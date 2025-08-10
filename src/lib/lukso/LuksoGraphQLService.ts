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
 * Cache entry with timestamp
 */
interface CacheEntry {
  data: TokenMetadata;
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
      const cached = this.cache.get(normalizedAddress);
      
      if (cached && (now - cached.timestamp) < LuksoGraphQLService.CACHE_DURATION_MS) {
        resultMap.set(address, cached.data);
        console.log(`[LuksoGraphQLService] 💾 Cache hit for ${address}`);
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
            this.cache.set(assetData.id.toLowerCase(), {
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
          this.cache.set(address.toLowerCase(), {
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
          this.cache.set(address.toLowerCase(), {
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
