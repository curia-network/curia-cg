/**
 * Universal Profile Context
 *
 * This context provides a simplified, wagmi-independent interface for interacting
 * with the Universal Profile browser extension (window.lukso). It manages
 * connection state, provides the connected address, and exposes functions
 * for common operations like fetching balances.
 *
 * It manually handles event listeners for account and chain changes to ensure
 * a stable and predictable state for consuming components.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { ethers } from 'ethers';
import { ERC725 } from '@erc725/erc725.js';
import LSP4DigitalAssetSchema from '@erc725/erc725.js/schemas/LSP4DigitalAsset.json';
import { classifyLsp7Cached, getDisplayDecimals, isNonDivisibleToken } from '@/lib/lukso/lsp7Classification';

// ===== INTERFACES =====

export interface TokenBalance {
  contractAddress: string;
  balance: string; // The balance in wei
  name?: string;
  symbol?: string;
  decimals?: number;
  iconUrl?: string;
  // Enhanced classification information
  actualDecimals?: number; // Decimals from contract (may differ from display decimals)
  displayDecimals?: number; // Decimals to use for display formatting
  isDivisible?: boolean; // Whether the token is divisible
  tokenType?: 'LSP7' | 'LSP8'; // Token standard type
  classification?: string; // Classification details for debugging
}

export interface UniversalProfileContextType {
  upAddress: string | null;
  isConnecting: boolean;
  provider: ethers.providers.Web3Provider | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  getLyxBalance: () => Promise<string>;
  getTokenBalances: (tokenAddresses: string[]) => Promise<TokenBalance[]>;
  getEnhancedTokenBalances: (tokenRequests: Array<{ contractAddress: string; tokenType: 'LSP7' | 'LSP8' }>) => Promise<TokenBalance[]>;
  signMessage: (message: string) => Promise<string>;
}

// ===== CONTEXT DEFINITION =====

const UniversalProfileContext = createContext<UniversalProfileContextType | undefined>(undefined);

// ===== PROVIDER COMPONENT =====

export const UniversalProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [upAddress, setUpAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [hasCheckedExistingConnection, setHasCheckedExistingConnection] = useState(false);

  const disconnect = useCallback(() => {
    setUpAddress(null);
    setProvider(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('upAddress');
    }
  }, []);

  const handleAccountsChanged = useCallback((accounts: string[]) => {
    if (accounts.length === 0) {
      disconnect();
    } else {
      setUpAddress(ethers.utils.getAddress(accounts[0]));
    }
  }, [disconnect]);

  const checkExistingConnection = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).lukso) {
      setHasCheckedExistingConnection(true);
      return;
    }
    setIsConnecting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const web3Provider = new ethers.providers.Web3Provider((window as any).lukso);
      const accounts = await web3Provider.listAccounts();

      if (accounts.length > 0) {
        const address = ethers.utils.getAddress(accounts[0]);
        setProvider(web3Provider);
        setUpAddress(address);
        if (typeof window !== 'undefined') {
          localStorage.setItem('upAddress', address);
        }
      }
    } catch (error) {
      console.error('Error checking existing UP connection:', error);
    } finally {
      setIsConnecting(false);
      setHasCheckedExistingConnection(true);
    }
  }, []);

  const connect = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).lukso) {
      // In a real app, you'd show a modal or a more user-friendly message
      alert('Please install the Universal Profile extension.');
      return;
    }

    setIsConnecting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const web3Provider = new ethers.providers.Web3Provider((window as any).lukso);
      await web3Provider.send('eth_requestAccounts', []);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();
      
      const checksummedAddress = ethers.utils.getAddress(address);
      setProvider(web3Provider);
      setUpAddress(checksummedAddress);
      if (typeof window !== 'undefined') {
        localStorage.setItem('upAddress', checksummedAddress);
      }
    } catch (error) {
      console.error('Failed to connect to Universal Profile:', error);
      disconnect();
    } finally {
      setIsConnecting(false);
    }
  }, [disconnect]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const luksoProvider = (window as any).lukso;
    if (luksoProvider) {
      luksoProvider.on('accountsChanged', handleAccountsChanged);
      luksoProvider.on('chainChanged', disconnect);
      luksoProvider.on('disconnect', disconnect);

      checkExistingConnection();
    } else {
      // No LUKSO extension, mark as checked
      setHasCheckedExistingConnection(true);
    }

    return () => {
      if (luksoProvider) {
        luksoProvider.removeListener('accountsChanged', handleAccountsChanged);
        luksoProvider.removeListener('chainChanged', disconnect);
        luksoProvider.removeListener('disconnect', disconnect);
      }
    };
  }, [checkExistingConnection, disconnect, handleAccountsChanged]);

  const getLyxBalance = useCallback(async (): Promise<string> => {
    if (!upAddress || !provider) return '0';
    const balance = await provider.getBalance(upAddress);
    return balance.toString();
  }, [upAddress, provider]);

  // ===== TOKEN ICON FETCHING =====
  
  // Cache for token icons to avoid repeated fetches
  const tokenIconCache = useMemo(() => new Map<string, string | null>(), []);

  // Helper to fetch token icon using the official ERC725.js library (LUKSO docs approach)
  const fetchTokenIcon = useCallback(async (contractAddress: string): Promise<string | null> => {
    const lower = contractAddress.toLowerCase();
    if (tokenIconCache.has(lower)) {
      return tokenIconCache.get(lower) ?? null;
    }

    try {
      console.log(`[UP Context] Fetching LSP4Metadata icon for ${contractAddress}`);
      
      // Use official ERC725.js library as per LUKSO docs
      const erc725 = new ERC725(
        LSP4DigitalAssetSchema, 
        contractAddress, 
        'https://rpc.mainnet.lukso.network',
        {
          ipfsGateway: 'https://api.universalprofile.cloud/ipfs/',
        }
      );

      // Use fetchData to automatically handle VerifiableURI decoding
      let result;
      try {
        result = await erc725.fetchData(['LSP4Metadata']);
      } catch (erc725Error) {
        console.log(`[UP Context] ⚠️ ERC725Y LSP4Metadata failed for ${contractAddress}:`, erc725Error);
        tokenIconCache.set(lower, null);
        return null;
      }
      
      const metadata = result.find(item => item.name === 'LSP4Metadata');
      
      if (!metadata?.value) {
        console.log(`[UP Context] No LSP4Metadata found for ${contractAddress}`);
        tokenIconCache.set(lower, null);
        return null;
      }

      // The value is already decoded JSON by ERC725.js
      const metadataJson = metadata.value as { LSP4Metadata?: { icon?: Array<{ url: string }> } };
      const iconUrl = metadataJson.LSP4Metadata?.icon?.[0]?.url;
      
      if (iconUrl) {
        // Resolve IPFS URL if needed
        const resolvedIconUrl = iconUrl.startsWith('ipfs://') 
          ? iconUrl.replace('ipfs://', 'https://api.universalprofile.cloud/ipfs/')
          : iconUrl;
        
        console.log(`[UP Context] ✅ Found token icon: ${resolvedIconUrl}`);
        tokenIconCache.set(lower, resolvedIconUrl);
        return resolvedIconUrl;
      }

      console.log(`[UP Context] No icon found in LSP4Metadata for ${contractAddress}`);
      tokenIconCache.set(lower, null);
      return null;
      
    } catch (error) {
      console.error(`[UP Context] LSP4Metadata fetch failed for ${contractAddress}:`, error);
      tokenIconCache.set(lower, null);
      return null;
    }
  }, [tokenIconCache]);

  const getTokenBalances = useCallback(async (tokenAddresses: string[]): Promise<TokenBalance[]> => {
    if (!provider) return [];
    
    const balances = await Promise.all(
      tokenAddresses.map(async (addr) => {
        try {
          // ✅ Use proper provider URL format like the old implementation
          const providerUrl = 'https://rpc.mainnet.lukso.network';
          
          const erc725 = new ERC725(
            LSP4DigitalAssetSchema, 
            addr, 
            providerUrl,
            {
              ipfsGateway: 'https://api.universalprofile.cloud/ipfs/',
            }
          );
          
          // Only fetch LSP4TokenName and LSP4TokenSymbol (LSP4TokenDecimals doesn't exist)
          const nameAndSymbol = await erc725.fetchData(['LSP4TokenName', 'LSP4TokenSymbol']);
          
          const name = nameAndSymbol.find(d => d.name === 'LSP4TokenName')?.value as string | undefined;
          const symbol = nameAndSymbol.find(d => d.name === 'LSP4TokenSymbol')?.value as string | undefined;

          let decimals = 18; // Default for most fungible tokens
          try {
            // Standard contract call for decimals, works for LSP7
            const contract = new ethers.Contract(addr, ['function decimals() view returns (uint8)'], provider);
            decimals = await contract.decimals();
          } catch {
            // This is expected for NFTs (LSP8) which often don't have a decimals function.
            // We can safely ignore this error and use the default of 18, though it won't be used.
            console.log(`Could not fetch decimals for ${addr}, likely an NFT.`)
          }

          // ===== FETCH TOKEN ICON =====
          let iconUrl: string | undefined;
          try {
            console.log(`[UP Context] Attempting to fetch token icon for ${addr}...`);
            iconUrl = await fetchTokenIcon(addr) || undefined;
            
            if (iconUrl) {
              console.log(`[UP Context] ✅ Token icon fetched successfully for ${addr}`);
            } else {
              console.log(`[UP Context] ⚠️ No token icon available for ${addr}`);
            }
          } catch (iconError) {
            console.log(`[UP Context] Icon fetch failed (non-critical) for ${addr}:`, iconError);
          }

          return {
            contractAddress: addr,
            balance: '0', // This function only fetches metadata
            name: name || 'Unknown Token',
            symbol: symbol || 'UNK',
            decimals,
            iconUrl,
          };
        } catch (error) {
          console.error(`Error fetching metadata for token ${addr}:`, error);
          // Return a fallback object so one bad token doesn't break the whole list
          return { contractAddress: addr, balance: '0', name: 'Unknown Token', symbol: '???', decimals: 18 };
        }
      })
    );

    return balances;
  }, [provider, fetchTokenIcon]);

  // Enhanced version that includes token classification
  const getEnhancedTokenBalances = useCallback(async (
    tokenRequests: Array<{ contractAddress: string; tokenType: 'LSP7' | 'LSP8' }>
  ): Promise<TokenBalance[]> => {
    if (!provider) return [];
    
    const balances = await Promise.all(
      tokenRequests.map(async ({ contractAddress: addr, tokenType }) => {
        try {
          console.log(`[UP Context] Fetching enhanced metadata for ${addr} (${tokenType})`);
          
          // ✅ Use proper provider URL format
          const providerUrl = 'https://rpc.mainnet.lukso.network';
          
          // Try to fetch basic metadata, but don't fail if ERC725Y doesn't work
          let name: string | undefined;
          let symbol: string | undefined;
          
          try {
            const erc725 = new ERC725(
              LSP4DigitalAssetSchema, 
              addr, 
              providerUrl,
              {
                ipfsGateway: 'https://api.universalprofile.cloud/ipfs/',
              }
            );
            
            const nameAndSymbol = await erc725.fetchData(['LSP4TokenName', 'LSP4TokenSymbol']);
            name = nameAndSymbol.find(d => d.name === 'LSP4TokenName')?.value as string | undefined;
            symbol = nameAndSymbol.find(d => d.name === 'LSP4TokenSymbol')?.value as string | undefined;
            console.log(`[UP Context] ✅ ERC725Y metadata for ${addr}: name=${name}, symbol=${symbol}`);
          } catch (erc725Error) {
            console.log(`[UP Context] ⚠️ ERC725Y metadata failed for ${addr}, trying direct contract calls:`, erc725Error);
            
            // Fallback to direct contract calls
            try {
              const contract = new ethers.Contract(addr, [
                'function name() view returns (string)',
                'function symbol() view returns (string)'
              ], provider);
              
              name = await contract.name();
              symbol = await contract.symbol();
              console.log(`[UP Context] ✅ Direct contract metadata for ${addr}: name=${name}, symbol=${symbol}`);
            } catch (directError) {
              console.log(`[UP Context] ⚠️ Direct contract metadata also failed for ${addr}:`, directError);
              name = 'Unknown Token';
              symbol = '???';
            }
          }

          // Get actual decimals from contract
          let actualDecimals = 18; // Default fallback
          try {
            if (tokenType === 'LSP7') {
              const contract = new ethers.Contract(addr, ['function decimals() view returns (uint8)'], provider);
              actualDecimals = await contract.decimals();
            } else {
              actualDecimals = 0; // LSP8 tokens don't have decimals
            }
          } catch {
            console.log(`[UP Context] Could not fetch decimals for ${addr}, using defaults`);
            actualDecimals = tokenType === 'LSP8' ? 0 : 18;
          }

          // Enhanced classification for LSP7 tokens
          let displayDecimals = actualDecimals;
          let isDivisible = actualDecimals > 0;
          let classification = 'basic';

          if (tokenType === 'LSP7') {
            try {
              console.log(`[UP Context] Classifying LSP7 token ${addr}...`);
              const lsp7Classification = await classifyLsp7Cached({
                asset: addr as `0x${string}`,
                rpcUrl: providerUrl,
              });
              
              displayDecimals = getDisplayDecimals(lsp7Classification);
              isDivisible = !isNonDivisibleToken(lsp7Classification);
              classification = `${lsp7Classification.kind}${lsp7Classification.kind === 'LSP7_NON_DIVISIBLE' ? `:${lsp7Classification.reason}` : ''}`;
              
              console.log(`[UP Context] ✅ LSP7 classification for ${addr}: ${classification}, displayDecimals: ${displayDecimals}`);
            } catch (classificationError) {
              console.log(`[UP Context] ⚠️ LSP7 classification failed for ${addr}, using fallback:`, classificationError);
              // Keep the defaults we already set
            }
          } else {
            // LSP8 tokens are always non-divisible NFTs
            displayDecimals = 0;
            isDivisible = false;
            classification = 'LSP8_NFT';
          }

          // ===== FETCH TOKEN ICON =====
          let iconUrl: string | undefined;
          try {
            iconUrl = await fetchTokenIcon(addr) || undefined;
          } catch (iconError) {
            console.log(`[UP Context] Icon fetch failed (non-critical) for ${addr}:`, iconError);
          }

          return {
            contractAddress: addr,
            balance: '0', // This function only fetches metadata
            name: name || 'Unknown Token',
            symbol: symbol || 'UNK',
            decimals: actualDecimals, // Keep for backward compatibility
            iconUrl,
            // Enhanced classification data
            actualDecimals,
            displayDecimals,
            isDivisible,
            tokenType,
            classification,
          };
        } catch (error) {
          console.error(`[UP Context] Error fetching enhanced metadata for token ${addr}:`, error);
          // Return a fallback object
          return { 
            contractAddress: addr, 
            balance: '0', 
            name: 'Unknown Token', 
            symbol: '???', 
            decimals: tokenType === 'LSP8' ? 0 : 18,
            actualDecimals: tokenType === 'LSP8' ? 0 : 18,
            displayDecimals: tokenType === 'LSP8' ? 0 : 18,
            isDivisible: tokenType !== 'LSP8',
            tokenType,
            classification: 'UNKNOWN',
          };
        }
      })
    );

    return balances;
  }, [provider, fetchTokenIcon]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!provider) {
      throw new Error("Provider not available. Please connect your wallet.");
    }
    const signer = provider.getSigner();
    return await signer.signMessage(message);
  }, [provider]);

  const value: UniversalProfileContextType = {
    upAddress,
    isConnecting,
    provider,
    connect,
    disconnect,
    getLyxBalance,
    getTokenBalances,
    getEnhancedTokenBalances,
    signMessage,
  };

  // Don't render children until we've checked for existing connections
  if (!hasCheckedExistingConnection) {
    return (
      <UniversalProfileContext.Provider value={value}>
        <div className="flex items-center justify-center p-4">
          <div className="text-sm text-muted-foreground">Checking Universal Profile connection...</div>
        </div>
      </UniversalProfileContext.Provider>
    );
  }

  return (
    <UniversalProfileContext.Provider value={value}>
      {children}
    </UniversalProfileContext.Provider>
  );
};

// ===== CONSUMER HOOK =====

export const useUniversalProfile = () => {
  const context = useContext(UniversalProfileContext);
  if (context === undefined) {
    throw new Error('useUniversalProfile must be used within a UniversalProfileProvider');
  }
  return context;
}; 