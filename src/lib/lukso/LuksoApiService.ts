/**
 * LUKSO API Service - Backend service layer for LUKSO metadata and balances
 * 
 * This service provides a clean interface for fetching LUKSO token and profile
 * metadata via the GraphQL indexer, with caching, error handling, and batch optimization.
 */

import { LuksoGraphQLService, TokenMetadata as LuksoTokenMetadata, ProfileMetadata as LuksoProfileMetadata } from './LuksoGraphQLService';

// Note: Environment variables are configured in LuksoGraphQLService singleton

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

export interface LuksoMetadataResponse {
  success: boolean;
  data: {
    tokens?: Record<string, TokenMetadata>;
    profiles?: Record<string, ProfileMetadata>;
    balances?: Record<string, TokenBalance>;
  };
  meta: {
    cached: string[];
    fetched: string[];
    failed: string[];
    timestamp: string;
    cacheExpiry?: string;
  };
  error?: string;
}

export interface TokenMetadata {
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

export interface ProfileMetadata {
  address: string;
  name?: string;
  description?: string;
  avatar?: string;
  profileImage?: string;
  links?: Array<{ title: string; url: string }>;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export interface TokenBalance {
  address: string;
  userAddress: string;
  balance: string;
  formattedBalance: string;
  decimals: number;
  symbol: string;
  confidence: 'high' | 'medium' | 'low';
  lastUpdated: number;
}

// ============================================================================
// LUKSO API SERVICE CLASS
// ============================================================================

export class LuksoApiService {
  private graphqlService: LuksoGraphQLService;
  private cache: Map<string, { data: LuksoTokenMetadata; timestamp: number; ttl: number }>;

  constructor() {
    this.graphqlService = LuksoGraphQLService.getInstance();
    this.cache = new Map();
  }

  /**
   * Main entry point for metadata fetching
   */
  async fetchMetadata(request: LuksoMetadataRequest): Promise<LuksoMetadataResponse> {
    const startTime = Date.now();
    
    try {
      // 1. Validate request
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          data: {},
          meta: {
            cached: [],
            fetched: [],
            failed: request.addresses,
            timestamp: new Date().toISOString()
          }
        };
      }

      // 2. Check cache for existing data
      const { cached, needsFetch } = this.checkCache(request.addresses, request.type);

      // 3. Fetch missing data from GraphQL
      let fetchedData: LuksoTokenMetadata[] = [];
      let failed: string[] = [];

      if (needsFetch.length > 0) {
        try {
          console.log(`[LuksoApiService] Fetching ${needsFetch.length} addresses from GraphQL`);
          const fetchedMap = await this.graphqlService.batchFetchTokenMetadata(needsFetch);
          fetchedData = Array.from(fetchedMap.values());
          
          // Cache the fetched data
          this.cacheData(fetchedData, request.type);
        } catch (error) {
          console.error('[LuksoApiService] GraphQL fetch failed:', error);
          failed = needsFetch;
        }
      }

      // 4. Combine cached and fetched data
      const allData = [...this.getCachedData(cached, request.type), ...fetchedData];
      
      // 4.5. Fetch profiles if requested
      let profilesData: Map<string, LuksoProfileMetadata> = new Map();
      if (request.type === 'profiles' || request.type === 'mixed') {
        try {
          // Determine which addresses are for profiles
          let profileAddresses: string[];
          if (request.type === 'mixed') {
            // For mixed requests, profile addresses are those not fetched as tokens
            const tokenAddresses = allData.map(token => token.address.toLowerCase());
            profileAddresses = request.addresses.filter(addr => 
              !tokenAddresses.includes(addr.toLowerCase())
            );
          } else {
            // For pure profile requests, all addresses are profiles
            profileAddresses = request.addresses;
          }

          if (profileAddresses.length > 0) {
            console.log(`[LuksoApiService] 🔍 Fetching ${profileAddresses.length} profiles`);
            profilesData = await this.graphqlService.batchFetchProfileMetadata(profileAddresses);
          }
        } catch (error) {
          console.error('[LuksoApiService] ❌ Profile fetch failed:', error);
          failed.push(...request.addresses.filter(addr => 
            !allData.find(token => token.address.toLowerCase() === addr.toLowerCase())
          ));
        }
      }
      
      // 5. Transform to response format
      const response = this.transformToResponse(allData, request, profilesData);
      
      // 6. Add metadata
      response.meta = {
        cached: cached,
        fetched: fetchedData.map(t => t.address),
        failed: failed,
        timestamp: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + 3600000).toISOString() // 1 hour
      };

      console.log(`[LuksoApiService] Request completed in ${Date.now() - startTime}ms`);
      return response;

    } catch (error) {
      console.error('[LuksoApiService] Unexpected error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {},
        meta: {
          cached: [],
          fetched: [],
          failed: request.addresses,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get single token metadata (convenience method)
   */
  async getTokenMetadata(address: string): Promise<TokenMetadata | null> {
    const response = await this.fetchMetadata({
      type: 'tokens',
      addresses: [address]
    });

    if (response.success && response.data.tokens?.[address]) {
      return response.data.tokens[address];
    }

    return null;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private validateRequest(request: LuksoMetadataRequest): { valid: boolean; error?: string } {
    if (!request.addresses || request.addresses.length === 0) {
      return { valid: false, error: 'No addresses provided' };
    }

    if (request.addresses.length > 50) {
      return { valid: false, error: 'Too many addresses (max 50)' };
    }

    // Basic Ethereum address validation
    for (const address of request.addresses) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return { valid: false, error: `Invalid address format: ${address}` };
      }
    }

    if (request.includeBalances && !request.userAddress) {
      return { valid: false, error: 'userAddress required when includeBalances is true' };
    }

    return { valid: true };
  }

  private checkCache(addresses: string[], type: string): { cached: string[]; needsFetch: string[] } {
    const cached: string[] = [];
    const needsFetch: string[] = [];

    for (const address of addresses) {
      const cacheKey = `${type}:${address}`;
      const cachedEntry = this.cache.get(cacheKey);

      if (cachedEntry && Date.now() - cachedEntry.timestamp < cachedEntry.ttl) {
        cached.push(address);
      } else {
        needsFetch.push(address);
      }
    }

    return { cached, needsFetch };
  }

  private cacheData(data: LuksoTokenMetadata[], type: string): void {
    const ttl = type === 'tokens' ? 3600000 : 1800000; // 1 hour for tokens, 30 min for profiles

    for (const item of data) {
      const cacheKey = `${type}:${item.address}`;
      this.cache.set(cacheKey, {
        data: item,
        timestamp: Date.now(),
        ttl
      });
    }

    // Cleanup old cache entries (simple LRU)
    if (this.cache.size > 10000) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 10%
      const toRemove = Math.floor(sortedEntries.length * 0.1);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }

  private getCachedData(addresses: string[], type: string): LuksoTokenMetadata[] {
    const cached: LuksoTokenMetadata[] = [];

    for (const address of addresses) {
      const cacheKey = `${type}:${address}`;
      const cachedEntry = this.cache.get(cacheKey);
      
      if (cachedEntry) {
        cached.push(cachedEntry.data);
      }
    }

    return cached;
  }

  private transformToResponse(data: LuksoTokenMetadata[], request: LuksoMetadataRequest, profilesData?: Map<string, LuksoProfileMetadata>): LuksoMetadataResponse {
    const response: LuksoMetadataResponse = {
      success: true,
      data: {},
      meta: {
        cached: [],
        fetched: [],
        failed: [],
        timestamp: new Date().toISOString()
      }
    };

    if (request.type === 'tokens' || request.type === 'mixed') {
      response.data.tokens = {};
      
      for (const token of data) {
        // Convert LuksoTokenMetadata to TokenMetadata format
        // Use simple classification logic based on token type and decimals
        const isDivisible = token.lsp4TokenType === 1 ? false : (token.decimals > 0);
        
        response.data.tokens[token.address] = {
          address: token.address,
          name: token.name || 'Unknown Token',
          symbol: token.symbol || 'UNK',
          decimals: token.decimals,
          tokenType: token.isLSP7 ? 'LSP7' : 'LSP8',
          lsp4TokenType: token.lsp4TokenType,
          totalSupply: token.totalSupply || '0',
          isLSP7: token.isLSP7,
          isCollection: token.isCollection,
          isDivisible: isDivisible,
          icon: token.icon,
          image: token.image,
          description: token.description,
          confidence: token.error ? 'low' : 'high',
          error: token.error
        };
      }
    }

    // Add profiles if provided
    if (profilesData && profilesData.size > 0) {
      response.data.profiles = {};
      for (const [address, profile] of profilesData.entries()) {
        response.data.profiles[address] = {
          address: profile.address,
          name: profile.name,
          description: profile.description,
          avatar: profile.avatar,
          profileImage: profile.profileImage,
          links: profile.links,
          confidence: profile.confidence,
          error: profile.error
        };
      }
    } else if (request.type === 'profiles' || request.type === 'mixed') {
      // Initialize empty profiles object for profile requests
      response.data.profiles = {};
    }

    // TODO: Add balance support when needed
    if (request.includeBalances && request.userAddress) {
      response.data.balances = {};
      // Balance fetching will be implemented when needed
    }

    return response;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let serviceInstance: LuksoApiService | null = null;

export function getLuksoApiService(): LuksoApiService {
  if (!serviceInstance) {
    serviceInstance = new LuksoApiService();
  }
  return serviceInstance;
}
