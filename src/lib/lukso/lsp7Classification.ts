/**
 * LSP7 Token Classification Utility
 * 
 * Implements the robust detection pipeline from LUKSO docs to classify
 * any contract address on LUKSO as:
 * - LSP7 divisible (fungible token with decimals > 0)
 * - LSP7 non-divisible (either LSP4TokenType=1 NFT or decimals=0)
 * - Not LSP7 (or unknown)
 * 
 * Based on: curia-cg/docs/o5-lsp-howto.md
 */

import { createPublicClient, http, getContract } from 'viem';
import { lukso, luksoTestnet } from 'viem/chains';
import { ERC725, type ERC725JSONSchema } from '@erc725/erc725.js';
import LSP4Schema from '@erc725/erc725.js/schemas/LSP4DigitalAsset.json';

// Note: Using fallback approach for interface IDs since we can't import from @lukso/lsp7-contracts yet
// TODO: Update to use official imports once package is properly configured
const INTERFACE_ID_LSP7 = '0xda1f85e4'; // LSP7DigitalAsset interface ID

// Minimal ABI for LSP7 detection and decimals reading
const LSP7_MINIMAL_ABI = [
  {
    name: 'supportsInterface',
    type: 'function',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export type Lsp7Divisibility =
  | { kind: 'LSP7_DIVISIBLE'; decimals: number }
  | { kind: 'LSP7_NON_DIVISIBLE'; reason: 'LSP4_NFT' | 'DECIMALS_ZERO' }
  | { kind: 'NOT_LSP7' }
  | { kind: 'UNKNOWN'; note: string };

export interface ClassifyLsp7Options {
  rpcUrl?: string;
  asset: `0x${string}`;
  ipfsGateway?: string;
}

/**
 * Classifies an LSP7 token using the robust detection pipeline:
 * 1. Verify it's LSP7 (ERC-165)
 * 2. Read LSP4TokenType (ERC725Y) - if NFT (1), short-circuit to non-divisible
 * 3. Read decimals() - 0 = non-divisible, >0 = divisible
 * 4. Handle edge cases and errors gracefully
 */
export async function classifyLsp7({
  rpcUrl = 'https://rpc.mainnet.lukso.network',
  asset,
  ipfsGateway = 'https://api.universalprofile.cloud/ipfs/',
}: ClassifyLsp7Options): Promise<Lsp7Divisibility> {
  
  const client = createPublicClient({ 
    chain: rpcUrl.includes('testnet') ? luksoTestnet : lukso,
    transport: http(rpcUrl) 
  });

  try {
    // 1) ERC-165: Is this contract LSP7?
    console.log(`[LSP7 Classification] Checking ERC-165 for ${asset}...`);
    
    const contract = getContract({
      address: asset,
      abi: LSP7_MINIMAL_ABI,
      client,
    });

    const isLsp7 = await contract.read.supportsInterface([INTERFACE_ID_LSP7 as `0x${string}`])
      .catch((error) => {
        console.log(`[LSP7 Classification] ERC-165 check failed for ${asset}:`, error.message);
        return false;
      });

    if (!isLsp7) {
      console.log(`[LSP7 Classification] ${asset} is not LSP7`);
      return { kind: 'NOT_LSP7' };
    }

    console.log(`[LSP7 Classification] ✅ ${asset} is LSP7, checking LSP4TokenType...`);

    // 2) LSP4TokenType via ERC725Y
    let tokenType: number | undefined;
    try {
      const erc725 = new ERC725(
        LSP4Schema as ERC725JSONSchema[], 
        asset, 
        rpcUrl,
        { ipfsGateway }
      );
      
      const result = await erc725.fetchData('LSP4TokenType');
      if (result && result.value !== null && result.value !== undefined) {
        tokenType = Number(result.value);
        console.log(`[LSP7 Classification] LSP4TokenType for ${asset}: ${tokenType}`);
      } else {
        console.log(`[LSP7 Classification] LSP4TokenType not found for ${asset}, will check decimals`);
      }
    } catch (error) {
      console.log(`[LSP7 Classification] LSP4TokenType fetch failed for ${asset}:`, error);
      // Continue to decimals check
    }

    // Short-circuit for NFT token type
    if (tokenType === 1) {
      console.log(`[LSP7 Classification] ✅ ${asset} is LSP7 NFT (multi-unit NFT) - non-divisible`);
      return { kind: 'LSP7_NON_DIVISIBLE', reason: 'LSP4_NFT' };
    }

    // 3) Read decimals() for the final determination
    console.log(`[LSP7 Classification] Reading decimals for ${asset}...`);
    try {
      const decimals = await contract.read.decimals();
      const decimalsNumber = Number(decimals);
      
      console.log(`[LSP7 Classification] Decimals for ${asset}: ${decimalsNumber}`);

      if (decimalsNumber === 0) {
        console.log(`[LSP7 Classification] ✅ ${asset} is LSP7 non-divisible (decimals=0)`);
        return { kind: 'LSP7_NON_DIVISIBLE', reason: 'DECIMALS_ZERO' };
      }
      
      if (decimalsNumber > 0) {
        console.log(`[LSP7 Classification] ✅ ${asset} is LSP7 divisible (decimals=${decimalsNumber})`);
        return { kind: 'LSP7_DIVISIBLE', decimals: decimalsNumber };
      }
      
      console.log(`[LSP7 Classification] ⚠️ ${asset} returned unexpected decimals value: ${decimalsNumber}`);
      return { kind: 'UNKNOWN', note: 'decimals returned unexpected value' };
      
    } catch (error) {
      console.log(`[LSP7 Classification] ❌ decimals() call failed for ${asset}:`, error);
      return { kind: 'UNKNOWN', note: 'decimals() missing or reverted' };
    }

  } catch (error) {
    console.error(`[LSP7 Classification] Unexpected error classifying ${asset}:`, error);
    return { kind: 'UNKNOWN', note: `Classification failed: ${error}` };
  }
}

/**
 * Utility function to get display decimals for a token
 * Returns the number of decimals to use for display formatting
 */
export function getDisplayDecimals(classification: Lsp7Divisibility): number {
  switch (classification.kind) {
    case 'LSP7_DIVISIBLE':
      return classification.decimals;
    case 'LSP7_NON_DIVISIBLE':
      return 0; // Always display as whole numbers
    case 'NOT_LSP7':
    case 'UNKNOWN':
    default:
      return 18; // Fallback, but should be handled explicitly by caller
  }
}

/**
 * Utility function to check if a token should be displayed as whole numbers
 */
export function isNonDivisibleToken(classification: Lsp7Divisibility): boolean {
  return classification.kind === 'LSP7_NON_DIVISIBLE';
}

/**
 * Cache for LSP7 classifications to avoid repeated API calls
 */
class Lsp7ClassificationCache {
  private cache = new Map<string, { result: Lsp7Divisibility; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  private getCacheKey(rpcUrl: string, asset: string): string {
    return `${rpcUrl}:${asset.toLowerCase()}`;
  }

  get(rpcUrl: string, asset: string): Lsp7Divisibility | null {
    const key = this.getCacheKey(rpcUrl, asset);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.TTL;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  set(rpcUrl: string, asset: string, result: Lsp7Divisibility): void {
    const key = this.getCacheKey(rpcUrl, asset);
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
const classificationCache = new Lsp7ClassificationCache();

/**
 * Cached version of classifyLsp7 that avoids repeated API calls
 */
export async function classifyLsp7Cached(options: ClassifyLsp7Options): Promise<Lsp7Divisibility> {
  const { rpcUrl = 'https://rpc.mainnet.lukso.network', asset } = options;
  
  // Check cache first
  const cached = classificationCache.get(rpcUrl, asset);
  if (cached) {
    console.log(`[LSP7 Classification] Cache hit for ${asset}`);
    return cached;
  }
  
  // Classify and cache result
  const result = await classifyLsp7(options);
  classificationCache.set(rpcUrl, asset, result);
  
  return result;
}

/**
 * Clear the classification cache (useful for testing or when switching networks)
 */
export function clearLsp7ClassificationCache(): void {
  classificationCache.clear();
}
