/**
 * React Hook for LSP7/LSP8 Token Classification
 * 
 * Provides React Query integration for the LSP7 classification utility
 * and handles LSP8 tokens (which are always non-divisible NFTs)
 */

import { useQuery } from '@tanstack/react-query';
import { classifyLsp7Cached, type Lsp7Divisibility, getDisplayDecimals, isNonDivisibleToken } from '@/lib/lukso/lsp7Classification';

export interface TokenClassification {
  tokenType: 'LSP7' | 'LSP8' | 'UNKNOWN';
  isDivisible: boolean;
  displayDecimals: number;
  classification?: Lsp7Divisibility; // Only for LSP7 tokens
  isLoading: boolean;
  error: string | null;
}

interface UseTokenClassificationOptions {
  contractAddress: string;
  tokenType: 'LSP7' | 'LSP8';
  rpcUrl?: string;
  enabled?: boolean;
}

/**
 * Hook to classify tokens and determine proper display formatting
 */
export function useTokenClassification({
  contractAddress,
  tokenType,
  rpcUrl = 'https://rpc.mainnet.lukso.network',
  enabled = true,
}: UseTokenClassificationOptions): TokenClassification {
  
  // Always call useQuery, but conditionally enable it
  const {
    data: lsp7Classification,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tokenClassification', contractAddress, rpcUrl, tokenType],
    queryFn: async () => {
      if (!contractAddress.startsWith('0x') || contractAddress.length !== 42) {
        throw new Error('Invalid contract address format');
      }
      
      return await classifyLsp7Cached({
        asset: contractAddress as `0x${string}`,
        rpcUrl,
      });
    },
    enabled: enabled && tokenType === 'LSP7',
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: (failureCount, error) => {
      // Don't retry for clearly invalid addresses or NOT_LSP7 results
      if (error?.message?.includes('Invalid contract address')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // For LSP8, return immediate classification without API calls
  if (tokenType === 'LSP8') {
    return {
      tokenType: 'LSP8',
      isDivisible: false,
      displayDecimals: 0, // LSP8 are always whole numbers
      isLoading: false,
      error: null,
    };
  }

  // For LSP7, handle query results
  if (tokenType === 'LSP7') {
    if (isLoading) {
      return {
        tokenType: 'LSP7',
        isDivisible: false, // Conservative default while loading
        displayDecimals: 18, // Default fallback
        classification: undefined,
        isLoading: true,
        error: null,
      };
    }

    if (error) {
      return {
        tokenType: 'LSP7',
        isDivisible: false, // Conservative default on error
        displayDecimals: 18, // Default fallback
        classification: undefined,
        isLoading: false,
        error: error.message || 'Classification failed',
      };
    }

    if (lsp7Classification) {
      return {
        tokenType: 'LSP7',
        isDivisible: !isNonDivisibleToken(lsp7Classification),
        displayDecimals: getDisplayDecimals(lsp7Classification),
        classification: lsp7Classification,
        isLoading: false,
        error: null,
      };
    }
  }

  // Fallback for unknown cases
  return {
    tokenType: 'UNKNOWN',
    isDivisible: false,
    displayDecimals: 18,
    isLoading: false,
    error: 'Unknown token type or classification failed',
  };
}

/**
 * Note: Multiple token classification should be handled by calling useTokenClassification
 * individually for each token at the component level, not in a loop.
 * This function is deprecated to avoid Rules of Hooks violations.
 */

/**
 * Simplified hook that just returns the display decimals for a token
 * Useful when you only need formatting information
 */
export function useTokenDisplayDecimals(
  contractAddress: string,
  tokenType: 'LSP7' | 'LSP8',
  options: { rpcUrl?: string; enabled?: boolean } = {}
): { decimals: number; isLoading: boolean; error: string | null } {
  
  const classification = useTokenClassification({
    contractAddress,
    tokenType,
    ...options,
  });
  
  return {
    decimals: classification.displayDecimals,
    isLoading: classification.isLoading,
    error: classification.error,
  };
}
