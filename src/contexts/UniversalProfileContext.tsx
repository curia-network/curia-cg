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
  ReactNode,
} from 'react';
import { ethers } from 'ethers';
import { LuksoApiService } from '@/lib/lukso/LuksoApiService';
import type { LuksoTokenMetadata } from '@/hooks/lukso/useLuksoMetadata';

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


  const getTokenBalances = useCallback(async (tokenAddresses: string[]): Promise<TokenBalance[]> => {
    if (!provider) return [];
    
    const balances = await Promise.all(
      tokenAddresses.map(async (addr) => {
        try {
          // Use GraphQL for basic metadata (lightweight, no icons)
          const luksoApiService = new LuksoApiService();
          const response = await luksoApiService.fetchMetadata({
            type: 'tokens',
            addresses: [addr],
            options: { includeIcons: false }
          });
          
          const metadata = response.success ? response.data.tokens?.[addr.toLowerCase()] as LuksoTokenMetadata | undefined : undefined;
          const name = metadata?.name;
          const symbol = metadata?.symbol;

          // Use decimals from GraphQL metadata (more reliable)
          const decimals = metadata?.decimals ?? 18;

          // Note: Icons not available in basic getTokenBalances - use getEnhancedTokenBalances for full metadata
          const iconUrl: string | undefined = undefined;

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
  }, [provider]);

  // Enhanced version that includes token classification (GraphQL-powered)
  const getEnhancedTokenBalances = useCallback(async (
    tokenRequests: Array<{ contractAddress: string; tokenType: 'LSP7' | 'LSP8' }>
  ): Promise<TokenBalance[]> => {
    if (!provider) return [];
    
    try {
      console.log(`[UP Context] 🚀 Fetching GraphQL metadata for ${tokenRequests.length} tokens...`);
      
      // Extract unique addresses for GraphQL query
      const addresses = tokenRequests.map(req => req.contractAddress);
      
      // Use LuksoApiService to fetch metadata via GraphQL
      const luksoApiService = new LuksoApiService();
      const response = await luksoApiService.fetchMetadata({
        type: 'tokens',
        addresses,
        options: { includeIcons: true }
      });
      
      if (!response.success || !response.data?.tokens) {
        console.error('[UP Context] ❌ GraphQL metadata fetch failed:', response.error);
        throw new Error(response.error || 'Failed to fetch token metadata');
      }
      
      console.log(`[UP Context] ✅ GraphQL metadata fetched for ${Object.keys(response.data.tokens).length} tokens`);
      
      // Transform GraphQL data to match existing TokenBalance interface
      const balances = tokenRequests.map(({ contractAddress: addr, tokenType }) => {
        const metadata = response.data.tokens?.[addr.toLowerCase()] as LuksoTokenMetadata | undefined;
        
        if (metadata) {
          console.log(`[UP Context] ✅ GraphQL metadata for ${addr}:`, {
            name: metadata.name,
            symbol: metadata.symbol,
            decimals: metadata.decimals,
            isDivisible: metadata.isDivisible,
            tokenType: metadata.tokenType
          });
          
          return {
            contractAddress: addr,
            balance: '0', // This function only fetches metadata
            name: metadata.name || 'Unknown Token',
            symbol: metadata.symbol || 'UNK',
            decimals: metadata.decimals, // Keep for backward compatibility
            iconUrl: metadata.icon,
            // Enhanced classification data from GraphQL
            actualDecimals: metadata.decimals,
            displayDecimals: metadata.decimals,
            isDivisible: metadata.isDivisible,
            tokenType: metadata.tokenType as 'LSP7' | 'LSP8',
            classification: metadata.isDivisible ? 'LSP7_DIVISIBLE' : 
                           metadata.tokenType === 'LSP8' ? 'LSP8_NFT' : 'LSP7_NON_DIVISIBLE',
          };
        } else {
          console.warn(`[UP Context] ⚠️ No GraphQL metadata found for ${addr}, using fallback`);
          return { 
            contractAddress: addr, 
            balance: '0', 
            name: 'Unknown Token', 
            symbol: 'UNK', 
            decimals: tokenType === 'LSP8' ? 0 : 18,
            actualDecimals: tokenType === 'LSP8' ? 0 : 18,
            displayDecimals: tokenType === 'LSP8' ? 0 : 18,
            isDivisible: tokenType === 'LSP7',
            tokenType,
            classification: 'fallback',
          };
        }
      });

      return balances;
    } catch (error) {
      console.error('[UP Context] ❌ Error fetching GraphQL metadata:', error);
      
      // Return fallback objects for all requests  
      return tokenRequests.map(({ contractAddress: addr, tokenType }) => ({ 
        contractAddress: addr, 
        balance: '0', 
        name: 'Unknown Token', 
        symbol: 'UNK', 
        decimals: tokenType === 'LSP8' ? 0 : 18,
        actualDecimals: tokenType === 'LSP8' ? 0 : 18,
        displayDecimals: tokenType === 'LSP8' ? 0 : 18,
        isDivisible: tokenType === 'LSP7',
        tokenType,
        classification: 'error',
      }));
    }
  }, [provider]);

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