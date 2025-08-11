/**
 * LUKSO GraphQL Service
 * 
 * Reliable token metadata fetching using LUKSO's official GraphQL indexer.
 * Provides batch queries, caching, IPFS resolution, and RPC fallback.
 * 
 * Based on successful host-service implementation patterns.
 */

import { GraphQLClient, gql } from 'graphql-request';

// Environment configuration
const LUKSO_GRAPHQL_URL = process.env.LUKSO_GRAPHQL_URL || 'https://envio.lukso-mainnet.universal.tech/v1/graphql';
const LUKSO_IPFS_GATEWAY = process.env.LUKSO_IPFS_GATEWAY_URL || 'https://api.universalprofile.cloud/ipfs/';

/**
 * Comprehensive token metadata interface
 */
export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenType: 'LSP7' | 'LSP8';
  lsp4TokenType: number; // 0 = Token, 1 = NFT, 2 = Collection
  totalSupply: string;
  isLSP7: boolean;
  isCollection: boolean;
  isDivisible: boolean; // Computed field
  icon?: string; // Resolved IPFS URL
  image?: string; // Resolved IPFS URL
  description?: string;
  confidence: 'high' | 'medium' | 'low'; // Data quality indicator
  createdAt?: number;
  updatedAt?: number;
  error?: string;
}

/**
 * Universal Profile metadata interface
 */
export interface ProfileMetadata {
  address: string;
  name?: string;
  description?: string;
  avatar?: string; // Resolved IPFS URL from avatars
  profileImage?: string; // Resolved IPFS URL from profileImages  
  links?: Array<{ title: string; url: string }>;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

/**
 * Raw GraphQL response interface
 */
interface GraphQLAssetResponse {
  id: string;
  name?: string;
  lsp4TokenName?: string;
  lsp4TokenSymbol?: string;
  lsp4TokenType?: number;
  decimals?: number;
  totalSupply?: string;
  isLSP7?: boolean;
  isCollection?: boolean;
  isUnknown?: boolean;
  supportedStandardsLsp4DigitalAsset?: boolean;
  description?: string;
  createdTimestamp?: number;
  updatedTimestamp?: number;
  error?: string;
  icons?: Array<{ url: string }>;
  images?: Array<{ url: string }>;
}

/**
 * Raw GraphQL Profile response interface
 */
interface GraphQLProfileResponse {
  id: string; // This is actually the address
  name?: string;
  description?: string;
  avatars?: { src: string }[];
  profileImages?: { src: string }[];
  links?: { title: string; url: string }[];
}

/**
 * Cache entry with timestamp (supports both tokens and profiles)
 */
interface CacheEntry {
  data: TokenMetadata | ProfileMetadata;
  timestamp: number;
}

/**
 * LUKSO GraphQL Service for reliable token metadata
 */
export class LuksoGraphQLService {
  private static instance: LuksoGraphQLService;
  private graphqlClient: GraphQLClient;
  private cache = new Map<string, CacheEntry>();
  
  // Cache duration: 1 hour for metadata (contracts don't change often)
  private static readonly CACHE_DURATION_MS = 60 * 60 * 1000;
  
  private constructor() {
    console.log(`[LuksoGraphQLService] Initializing with GraphQL: ${LUKSO_GRAPHQL_URL}`);
    this.graphqlClient = new GraphQLClient(LUKSO_GRAPHQL_URL);
  }

  /**
   * Singleton instance
   */
  public static getInstance(): LuksoGraphQLService {
    if (!LuksoGraphQLService.instance) {
      LuksoGraphQLService.instance = new LuksoGraphQLService();
    }
    return LuksoGraphQLService.instance;
  }

  /**
   * Batch fetch token metadata for multiple contracts (primary method)
   */
  async batchFetchTokenMetadata(addresses: string[]): Promise<Map<string, TokenMetadata>> {
    console.log(`[LuksoGraphQLService] 📦 Batch fetching metadata for ${addresses.length} tokens`);
    
    const resultMap = new Map<string, TokenMetadata>();
    const now = Date.now();
    
    // Check cache first and collect uncached addresses
    const uncachedAddresses: string[] = [];
    
    for (const address of addresses) {
      const normalizedAddress = address.toLowerCase();
      const cached = this.cache.get(`token_${normalizedAddress}`);
      
      if (cached && (now - cached.timestamp) < LuksoGraphQLService.CACHE_DURATION_MS) {
        // Type guard to ensure we have TokenMetadata
        const data = cached.data;
        if ('symbol' in data && 'decimals' in data) {
          resultMap.set(address, data as TokenMetadata);
          console.log(`[LuksoGraphQLService] 💾 Cache hit for ${address}`);
        } else {
          uncachedAddresses.push(address);
        }
      } else {
        uncachedAddresses.push(address);
      }
    }
    
    console.log(`[LuksoGraphQLService] 💾 Found ${resultMap.size} cached, fetching ${uncachedAddresses.length} from GraphQL`);
    
    if (uncachedAddresses.length === 0) {
      return resultMap;
    }

    try {
      // Execute batch GraphQL query
      const BATCH_ASSET_QUERY = gql`
        query GetAssetMetadata($addresses: [String!]!) {
          Asset(where: { id: { _in: $addresses } }) {
            id
            name
            lsp4TokenName
            lsp4TokenSymbol
            lsp4TokenType
            decimals
            totalSupply
            isLSP7
            isCollection
            isUnknown
            supportedStandardsLsp4DigitalAsset
            description
            createdTimestamp
            updatedTimestamp
            error
            icons {
              url
            }
            images {
              url
            }
          }
        }
      `;

      const variables = { 
        addresses: uncachedAddresses.map(addr => addr.toLowerCase()) 
      };
      
      console.log(`[LuksoGraphQLService] 🚀 Executing GraphQL query for ${uncachedAddresses.length} addresses`);
      const response: { Asset: GraphQLAssetResponse[] } = await this.graphqlClient.request(BATCH_ASSET_QUERY, variables);

      if (response.Asset && Array.isArray(response.Asset)) {
        // Process found assets
        response.Asset.forEach((assetData: GraphQLAssetResponse) => {
          const originalAddress = addresses.find(addr => addr.toLowerCase() === assetData.id.toLowerCase());
          
          if (originalAddress) {
            const metadata = this.transformGraphQLResponse(assetData);
            resultMap.set(originalAddress, metadata);
            
            // Cache the metadata
            this.cache.set(`token_${assetData.id.toLowerCase()}`, {
              data: metadata,
              timestamp: now
            });
            
            console.log(`[LuksoGraphQLService] ✅ Processed ${originalAddress}: ${metadata.name} (${metadata.symbol})`);
          }
        });
        
        console.log(`[LuksoGraphQLService] ✅ Successfully processed ${response.Asset.length}/${uncachedAddresses.length} assets via GraphQL`);
      }
      
      // Add empty metadata for addresses not found in GraphQL
      for (const address of uncachedAddresses) {
        if (!resultMap.has(address)) {
          const fallbackMetadata = this.createFallbackMetadata(address);
          resultMap.set(address, fallbackMetadata);
          
          // Cache the fallback to avoid repeated lookups
          this.cache.set(`token_${address.toLowerCase()}`, {
            data: fallbackMetadata,
            timestamp: now
          });
          
          console.log(`[LuksoGraphQLService] ⚠️ No GraphQL data for ${address}, using fallback`);
        }
      }
      
    } catch (error) {
      console.error(`[LuksoGraphQLService] ❌ GraphQL batch query failed:`, error);
      
      // Add fallback metadata for all uncached addresses
      for (const address of uncachedAddresses) {
        if (!resultMap.has(address)) {
          const fallbackMetadata = this.createFallbackMetadata(address, `GraphQL error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          resultMap.set(address, fallbackMetadata);
          
          // Cache the fallback
          this.cache.set(`token_${address.toLowerCase()}`, {
            data: fallbackMetadata,
            timestamp: now
          });
        }
      }
    }
    
    return resultMap;
  }

  /**
   * Fetch single token metadata with caching
   */
  async fetchTokenMetadata(address: string): Promise<TokenMetadata | null> {
    const batch = await this.batchFetchTokenMetadata([address]);
    return batch.get(address) || null;
  }

  /**
   * Batch fetch Universal Profile metadata with caching
   */
  public async batchFetchProfileMetadata(addresses: string[]): Promise<Map<string, ProfileMetadata>> {
    const resultMap = new Map<string, ProfileMetadata>();
    const uncachedAddresses: string[] = [];
    
    console.log(`[LuksoGraphQLService] 🔍 Fetching profile metadata for ${addresses.length} addresses`);
    
    // Check cache first
    for (const address of addresses) {
      const normalizedAddress = address.toLowerCase();
      const cached = this.cache.get(`profile_${normalizedAddress}`);
      
      if (cached && (Date.now() - cached.timestamp < LuksoGraphQLService.CACHE_DURATION_MS)) {
        resultMap.set(normalizedAddress, cached.data as ProfileMetadata);
        console.log(`[LuksoGraphQLService] ✓ Cache hit for profile ${normalizedAddress}`);
      } else {
        uncachedAddresses.push(normalizedAddress);
      }
    }
    
    if (uncachedAddresses.length === 0) {
      return resultMap;
    }

    try {
      // Execute batch GraphQL query
      const BATCH_PROFILE_QUERY = gql`
        query GetProfileMetadata($addresses: [String!]!) {
          Profile(where: { id: { _in: $addresses } }) {
            id
            name
            description
            avatars {
              src
            }
            profileImages {
              src
            }
            links {
              title
              url
            }
          }
        }
      `;

      const response: { Profile: GraphQLProfileResponse[] } = await this.graphqlClient.request(BATCH_PROFILE_QUERY, {
        addresses: uncachedAddresses
      });

      console.log(`[LuksoGraphQLService] 📊 GraphQL response for ${uncachedAddresses.length} profiles:`, {
        profileCount: response.Profile?.length || 0,
        addresses: uncachedAddresses
      });

      // Process response
      if (response.Profile && Array.isArray(response.Profile)) {
        for (const profile of response.Profile as GraphQLProfileResponse[]) {
          const metadata = this.convertProfileData(profile);
          const normalizedAddress = profile.id.toLowerCase();
          
          resultMap.set(normalizedAddress, metadata);
          
          // Cache the result
          this.cache.set(`profile_${normalizedAddress}`, {
            data: metadata,
            timestamp: Date.now()
          });
        }
      }

      // Handle missing profiles (create fallbacks for addresses not found)
      for (const address of uncachedAddresses) {
        if (!resultMap.has(address)) {
          const fallbackMetadata = this.createFallbackProfileMetadata(address);
          resultMap.set(address, fallbackMetadata);
          
          // Cache the fallback to avoid repeated lookups
          this.cache.set(`profile_${address}`, {
            data: fallbackMetadata,
            timestamp: Date.now()
          });
        }
      }

    } catch (error) {
      console.error(`[LuksoGraphQLService] ❌ Profile GraphQL query failed:`, error);
      
      // Create fallback for all uncached addresses on error
      for (const address of uncachedAddresses) {
        if (!resultMap.has(address)) {
          const fallbackMetadata = this.createFallbackProfileMetadata(address, `GraphQL error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          resultMap.set(address, fallbackMetadata);
        }
      }
    }
    
    return resultMap;
  }

  /**
   * Fetch single profile metadata with caching
   */
  async fetchProfileMetadata(address: string): Promise<ProfileMetadata | null> {
    const batch = await this.batchFetchProfileMetadata([address]);
    return batch.get(address.toLowerCase()) || null;
  }

  /**
   * Transform GraphQL response to our TokenMetadata interface
   */
  private transformGraphQLResponse(asset: GraphQLAssetResponse): TokenMetadata {
    // Determine confidence based on data completeness
    let confidence: 'high' | 'medium' | 'low' = 'high';
    
    if (asset.error || asset.isUnknown) {
      confidence = 'low';
    } else if (!asset.lsp4TokenName || !asset.lsp4TokenSymbol || asset.decimals === undefined) {
      confidence = 'medium';
    }

    // Compute isDivisible based on decimals and token type
    const decimals = asset.decimals ?? 18;
    const isDivisible = decimals > 0;
    
    return {
      address: asset.id,
      name: asset.lsp4TokenName || asset.name || 'Unknown Token',
      symbol: asset.lsp4TokenSymbol || 'UNK',
      decimals: decimals,
      tokenType: asset.isLSP7 ? 'LSP7' : 'LSP8',
      lsp4TokenType: asset.lsp4TokenType ?? 0,
      totalSupply: asset.totalSupply || '0',
      isLSP7: asset.isLSP7 ?? false,
      isCollection: asset.isCollection ?? false,
      isDivisible: isDivisible,
      icon: this.extractBestIcon(asset),
      image: this.extractBestImage(asset),
      description: asset.description,
      confidence: confidence,
      createdAt: asset.createdTimestamp,
      updatedAt: asset.updatedTimestamp,
      error: asset.error
    };
  }

  /**
   * Create fallback metadata for tokens not found in GraphQL
   */
  private createFallbackMetadata(address: string, error?: string): TokenMetadata {
    return {
      address: address,
      name: 'Unknown Token',
      symbol: 'UNK',
      decimals: 18, // Safe default for unknown tokens
      tokenType: 'LSP7', // Assume LSP7 for fallback
      lsp4TokenType: 0,
      totalSupply: '0',
      isLSP7: true,
      isCollection: false,
      isDivisible: true, // Safe default
      confidence: 'low',
      error: error || 'Token not found in GraphQL indexer'
    };
  }

  /**
   * Convert GraphQL Profile response to ProfileMetadata
   */
  private convertProfileData(profile: GraphQLProfileResponse): ProfileMetadata {
    return {
      address: profile.id, // GraphQL uses 'id' but it's actually the address
      name: profile.name || undefined,
      description: profile.description || undefined,
      avatar: this.extractBestAvatar(profile),
      profileImage: this.extractBestProfileImage(profile),
      links: profile.links || [],
      confidence: 'high'
    };
  }

  /**
   * Create fallback metadata for profiles not found in GraphQL
   */
  private createFallbackProfileMetadata(address: string, error?: string): ProfileMetadata {
    return {
      address: address,
      confidence: 'low',
      error: error || 'Profile not found in GraphQL indexer'
    };
  }

  /**
   * Extract best avatar URL from GraphQL response
   */
  private extractBestAvatar(profile: GraphQLProfileResponse): string | undefined {
    if (profile.avatars && profile.avatars.length > 0) {
      return this.resolveIpfsUrl(profile.avatars[0].src);
    }
    return undefined;
  }

  /**
   * Extract best profile image URL from GraphQL response
   */
  private extractBestProfileImage(profile: GraphQLProfileResponse): string | undefined {
    if (profile.profileImages && profile.profileImages.length > 0) {
      return this.resolveIpfsUrl(profile.profileImages[0].src);
    }
    return undefined;
  }

  /**
   * Extract best icon URL from GraphQL response
   */
  private extractBestIcon(asset: GraphQLAssetResponse): string | undefined {
    if (asset.icons && asset.icons.length > 0) {
      return this.resolveIpfsUrl(asset.icons[0].url);
    }
    return undefined;
  }

  /**
   * Extract best image URL from GraphQL response
   */
  private extractBestImage(asset: GraphQLAssetResponse): string | undefined {
    if (asset.images && asset.images.length > 0) {
      return this.resolveIpfsUrl(asset.images[0].url);
    }
    return undefined;
  }

  /**
   * Convert IPFS URLs to HTTP gateway URLs
   */
  private resolveIpfsUrl(url: string): string {
    if (url.startsWith('ipfs://')) {
      return url.replace('ipfs://', LUKSO_IPFS_GATEWAY);
    }
    return url; // Already HTTP or other format
  }

  /**
   * Clear cache (useful for development/testing)
   */
  public clearCache(): void {
    this.cache.clear();
    console.log(`[LuksoGraphQLService] 🗑️ Cache cleared`);
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance for easy access
export const luksoGraphQLService = LuksoGraphQLService.getInstance();
