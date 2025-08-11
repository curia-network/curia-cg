/**
 * LUKSO Metadata Hook - React Query integration for LUKSO token and profile metadata
 * 
 * This hook provides a clean interface for fetching LUKSO metadata via the backend
 * /api/lukso/metadata endpoint, with automatic caching, error handling, and batching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LuksoMetadataRequest {
  type: 'tokens' | 'profiles' | 'mixed';
  addresses: string[];
  includeBalances?: boolean;
  userAddress?: string;
  options?: {
    forceRefresh?: boolean;
    includeIcons?: boolean;
    includeDescriptions?: boolean;
  };
}

export interface LuksoTokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenType: 'LSP7' | 'LSP8';
  lsp4TokenType: number;
  totalSupply: string;
  isLSP7: boolean;
  isCollection: boolean;
  isDivisible: boolean;
  icon?: string;
  image?: string;
  description?: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export interface LuksoProfileMetadata {
  address: string;
  name?: string;
  description?: string;
  avatar?: string;
  profileImage?: string;
  links?: Array<{ title: string; url: string }>;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export interface LuksoTokenBalance {
  address: string;
  userAddress: string;
  balance: string;
  formattedBalance: string;
  decimals: number;
  symbol: string;
  confidence: 'high' | 'medium' | 'low';
  lastUpdated: number;
}

export interface LuksoMetadataResponse {
  success: boolean;
  data: {
    tokens?: Record<string, LuksoTokenMetadata>;
    profiles?: Record<string, LuksoProfileMetadata>;
    balances?: Record<string, LuksoTokenBalance>;
  };
  meta: {
    cached: string[];
    fetched: string[];
    failed: string[];
    timestamp: string;
    requestTime?: number;
    requestId?: string;
  };
  error?: string;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const luksoQueryKeys = {
  all: ['lukso'] as const,
  metadata: (type: string, addresses: string[]) => 
    ['lukso', 'metadata', type, addresses.sort()] as const,
  token: (address: string) => 
    ['lukso', 'metadata', 'tokens', [address]] as const,
  profile: (address: string) => 
    ['lukso', 'metadata', 'profiles', [address]] as const,
  balances: (addresses: string[], userAddress: string) => 
    ['lukso', 'balances', addresses.sort(), userAddress] as const,
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchLuksoMetadata(request: LuksoMetadataRequest): Promise<LuksoMetadataResponse> {
  const response = await fetch('/api/lukso/metadata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// MAIN HOOKS
// ============================================================================

/**
 * Hook for fetching LUKSO token metadata
 */
export function useLuksoTokenMetadata(
  addresses: string[],
  options?: {
    includeIcons?: boolean;
    includeDescriptions?: boolean;
    enabled?: boolean;
  }
) {
  const { enabled = true, ...requestOptions } = options || {};
  
  return useQuery({
    queryKey: luksoQueryKeys.metadata('tokens', addresses),
    queryFn: () => fetchLuksoMetadata({
      type: 'tokens',
      addresses,
      options: requestOptions,
    }),
    enabled: enabled && addresses.length > 0,
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 60 * 60 * 1000,        // 1 hour (renamed from cacheTime)
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (bad request, auth, etc.)
      if (error.message.includes('4')) return false;
      return failureCount < 3;
    },
  });
}

/**
 * Hook for fetching single token metadata
 */
export function useLuksoSingleToken(
  address: string,
  options?: {
    includeIcons?: boolean;
    includeDescriptions?: boolean;
    enabled?: boolean;
  }
) {
  const result = useLuksoTokenMetadata([address], options);
  
  return {
    ...result,
    data: result.data?.data?.tokens?.[address] || null,
  };
}

/**
 * Hook for fetching LUKSO profile metadata
 */
export function useLuksoProfileMetadata(
  addresses: string[],
  options?: {
    includeIcons?: boolean;
    includeDescriptions?: boolean;
    enabled?: boolean;
  }
) {
  const { enabled = true, ...requestOptions } = options || {};
  
  return useQuery({
    queryKey: luksoQueryKeys.metadata('profiles', addresses),
    queryFn: () => fetchLuksoMetadata({
      type: 'profiles',
      addresses,
      options: requestOptions,
    }),
    enabled: enabled && addresses.length > 0,
    staleTime: 2 * 60 * 1000,      // 2 minutes (profiles change more often)
    gcTime: 30 * 60 * 1000,        // 30 minutes
    retry: (failureCount, error) => {
      if (error.message.includes('4')) return false;
      return failureCount < 3;
    },
  });
}

/**
 * Hook for fetching token balances with metadata
 */
export function useLuksoTokenBalances(
  tokenAddresses: string[],
  userAddress?: string,
  options?: {
    includeIcons?: boolean;
    enabled?: boolean;
  }
) {
  const { enabled = true, ...requestOptions } = options || {};
  
  return useQuery({
    queryKey: luksoQueryKeys.balances(tokenAddresses, userAddress || ''),
    queryFn: () => fetchLuksoMetadata({
      type: 'tokens',
      addresses: tokenAddresses,
      includeBalances: true,
      userAddress,
      options: requestOptions,
    }),
    enabled: enabled && tokenAddresses.length > 0 && !!userAddress,
    staleTime: 30 * 1000,          // 30 seconds (balances change frequently)
    gcTime: 5 * 60 * 1000,         // 5 minutes
    retry: (failureCount, error) => {
      if (error.message.includes('4')) return false;
      return failureCount < 2; // Fewer retries for balance queries
    },
  });
}

/**
 * Mutation hook for refreshing metadata
 */
export function useLuksoMetadataRefresh() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (request: LuksoMetadataRequest) => {
      const requestWithRefresh = {
        ...request,
        options: { ...request.options, forceRefresh: true },
      };
      return fetchLuksoMetadata(requestWithRefresh);
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries to trigger refetch
      queryClient.invalidateQueries({
        queryKey: luksoQueryKeys.metadata(variables.type, variables.addresses),
      });
      
      // If balances were included, invalidate balance queries too
      if (variables.includeBalances && variables.userAddress) {
        queryClient.invalidateQueries({
          queryKey: luksoQueryKeys.balances(variables.addresses, variables.userAddress),
        });
      }
    },
  });
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook for preloading metadata (useful for hover states, etc.)
 */
export function useLuksoMetadataPreload() {
  const queryClient = useQueryClient();
  
  const preloadTokens = (addresses: string[]) => {
    queryClient.prefetchQuery({
      queryKey: luksoQueryKeys.metadata('tokens', addresses),
      queryFn: () => fetchLuksoMetadata({
        type: 'tokens',
        addresses,
        options: { includeIcons: true },
      }),
      staleTime: 5 * 60 * 1000,
    });
  };
  
  const preloadProfiles = (addresses: string[]) => {
    queryClient.prefetchQuery({
      queryKey: luksoQueryKeys.metadata('profiles', addresses),
      queryFn: () => fetchLuksoMetadata({
        type: 'profiles',
        addresses,
        options: { includeIcons: true },
      }),
      staleTime: 2 * 60 * 1000,
    });
  };
  
  return { preloadTokens, preloadProfiles };
}

/**
 * Hook to get cached metadata without triggering new requests
 */
export function useLuksoCachedMetadata(addresses: string[], type: 'tokens' | 'profiles') {
  const queryClient = useQueryClient();
  
  const cachedData = queryClient.getQueryData(
    luksoQueryKeys.metadata(type, addresses)
  ) as LuksoMetadataResponse | undefined;
  
  return {
    data: cachedData?.data || {},
    isStale: !cachedData || Date.now() - new Date(cachedData.meta.timestamp).getTime() > 5 * 60 * 1000,
    meta: cachedData?.meta,
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR MIGRATION
// ============================================================================

/**
 * Helper to convert old metadata format to new format (for migration)
 */
export function convertLegacyTokenMetadata(
  legacyData: any
): Partial<LuksoTokenMetadata> {
  return {
    address: legacyData.contractAddress || legacyData.address,
    name: legacyData.name || 'Unknown Token',
    symbol: legacyData.symbol || 'UNK',
    decimals: legacyData.decimals ?? 18,
    tokenType: legacyData.tokenType || (legacyData.isLSP7 ? 'LSP7' : 'LSP8'),
    lsp4TokenType: legacyData.lsp4TokenType ?? 0,
    totalSupply: legacyData.totalSupply || '0',
    isLSP7: legacyData.isLSP7 ?? true,
    isCollection: legacyData.isCollection ?? false,
    isDivisible: legacyData.isDivisible ?? (legacyData.decimals > 0),
    icon: legacyData.icon || legacyData.iconUrl,
    image: legacyData.image || legacyData.imageUrl,
    description: legacyData.description,
    confidence: 'medium', // Default for migrated data
  };
}

/**
 * Hook for gradual migration - tries new API first, falls back to old method
 */
export function useLuksoMetadataWithFallback(
  addresses: string[],
  fallbackFn?: (addresses: string[]) => Promise<any[]>,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options || {};
  
  const newApiQuery = useLuksoTokenMetadata(addresses, { enabled });
  
  // If new API fails and we have a fallback, use it
  const fallbackQuery = useQuery({
    queryKey: ['lukso-fallback', addresses.sort()],
    queryFn: () => fallbackFn?.(addresses) || Promise.resolve([]),
    enabled: enabled && newApiQuery.isError && !!fallbackFn,
    staleTime: 1 * 60 * 1000, // Shorter cache for fallback
  });
  
  // Return new API data if available, otherwise fallback data
  if (newApiQuery.isSuccess) {
    return {
      ...newApiQuery,
      source: 'graphql' as const,
    };
  }
  
  if (fallbackQuery.isSuccess) {
    return {
      ...fallbackQuery,
      data: {
        success: true,
        data: {
          tokens: fallbackQuery.data?.reduce((acc: any, item: any) => {
            const converted = convertLegacyTokenMetadata(item);
            if (converted.address) {
              acc[converted.address] = converted;
            }
            return acc;
          }, {}),
        },
        meta: {
          cached: [],
          fetched: addresses,
          failed: [],
          timestamp: new Date().toISOString(),
        },
      },
      source: 'rpc-fallback' as const,
    };
  }
  
  return {
    ...newApiQuery,
    source: 'graphql' as const,
  };
}
