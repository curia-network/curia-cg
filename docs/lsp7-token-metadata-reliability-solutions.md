# LSP7 Token Metadata Reliability Solutions

## Problem Statement

The current LSP7 token gating system has reliability issues when fetching token metadata, particularly:

1. **Classification vs Storage Mismatch**: Tokens classified as "Multi-unit NFT" (LSP4TokenType = 1) can have `decimals() = 18` but should be stored with `decimals = 0` for non-divisible behavior
2. **Metadata Fetch Failures**: ERC725Y interface failures cause fallback to wrong default values (`decimals: 18`)
3. **Data Source Reliability**: Direct RPC calls to individual contracts are unreliable and slow

**Example Issue**: JAN token (`0xf4272e04412f38ec7e4d2e0bc3c63db8e281533a`) has:
- ✅ Correct on-chain values: `LSP4TokenType = 1`, `decimals() = 0`
- ❌ Wrong stored values: `decimals: 18`, `minAmount: "1000000000000000000"`

This creates frontend display issues where users appear to not meet requirements despite having sufficient tokens.

## Solution Path 1: Smart Defaults & Classification Fix

### Quick Win Implementation
**Priority: High | Effort: Low | Impact: Medium**

#### 1.1 Fix Multi-unit NFT Decimals Handling
**File**: `src/components/locks/configurators/LSP7TokenConfigurator.tsx`

```typescript
// In handleFetchMetadata, after classification:
if (classification.kind === 'LSP7_NON_DIVISIBLE') {
  if (classification.reason === 'LSP4_NFT') {
    // Multi-unit NFTs should ALWAYS use decimals = 0, regardless of decimals() return
    setActualDecimals(0);
    console.log(`[LSP7] Multi-unit NFT detected: forcing decimals = 0`);
  } else if (classification.reason === 'DECIMALS_ZERO') {
    // Non-divisible tokens already have correct decimals
    setActualDecimals(0);
  }
} else if (classification.kind === 'LSP7_DIVISIBLE') {
  setActualDecimals(classification.decimals);
}
```

#### 1.2 Improve Fallback Logic
When ERC725Y fails, use better defaults based on classification:

```typescript
// In classification failure scenarios:
const fallbackDecimals = tokenType === 1 ? 0 : 18; // If LSP4TokenType=1, assume 0 decimals
```

#### 1.3 Add Validation Warnings
Show users when metadata appears inconsistent:

```typescript
if (tokenType === 1 && actualDecimals > 0) {
  // Show warning: "This Multi-unit NFT has unusual decimals. Please verify amounts carefully."
}
```

**Benefits**:
- ✅ Fixes the JAN token issue immediately
- ✅ No external dependencies
- ✅ Backward compatible

**Limitations**:
- ⚠️ Still relies on potentially unreliable direct RPC calls
- ⚠️ Doesn't solve broader metadata reliability issues

---

## Solution Path 2: Manual Override System

### User-Controlled Metadata
**Priority: Medium | Effort: Medium | Impact: High**

#### 2.1 Enhanced Token Configuration UI
**Files**: `LSP7TokenConfigurator.tsx`, `LSP8NFTConfigurator.tsx`

Add manual override controls:
```typescript
interface TokenMetadataOverride {
  name?: string;
  symbol?: string; 
  decimals?: number;
  isDivisible?: boolean;
  confidence: 'auto' | 'manual' | 'verified';
}
```

#### 2.2 Metadata Review Step
After auto-fetch, show verification UI:

```jsx
<MetadataReviewCard>
  <AutoFetchedData confidence={autoConfidence} />
  <ManualOverrideControls 
    onOverride={(overrides) => setMetadataOverrides(overrides)}
    showWarnings={hasInconsistencies}
  />
</MetadataReviewCard>
```

#### 2.3 Administrative Verification
**New Feature**: Community admins can mark tokens as "verified" with correct metadata.

**Database Addition**:
```sql
CREATE TABLE verified_token_metadata (
  contract_address VARCHAR(42) PRIMARY KEY,
  name VARCHAR(255),
  symbol VARCHAR(50),
  decimals INTEGER,
  token_type VARCHAR(10), -- 'LSP7' | 'LSP8'
  is_divisible BOOLEAN,
  verified_by VARCHAR(255), -- admin user_id
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  community_id VARCHAR(255) -- scope verification to community
);
```

**Benefits**:
- ✅ Users can fix incorrect metadata immediately
- ✅ Builds community-verified token database
- ✅ Transparent about confidence levels

**Limitations**:
- ⚠️ Requires user knowledge to use correctly
- ⚠️ Potential for user error
- ⚠️ Additional UI complexity

---

## Solution Path 3: Reliable GraphQL Data Source

### LUKSO GraphQL Integration
**Priority: High | Effort: High | Impact: Very High**

#### 3.1 Current Host-Service Implementation Analysis

**Host-Service Usage Pattern**:
```typescript
// From /Users/florian/Git/curia/host-service/src/lib/friends/UpFriendsService.ts
private static readonly LUKSO_GRAPHQL_URL = process.env.LUKSO_GRAPHQL_URL || 'https://envio.lukso-mainnet.universal.tech/v1/graphql';
private static readonly LUKSO_IPFS_GATEWAY = process.env.LUKSO_IPFS_GATEWAY_URL || 'https://api.universalprofile.cloud/ipfs/';

this.graphqlClient = new GraphQLClient(LUKSO_GRAPHQL_URL);
```

**GraphQL Capabilities Discovered**:
- ✅ Schema introspection support
- ✅ Follow/Social data (`Follow` table with `follower_id`, `followee_id`)
- ✅ Profile data (`Profile` table with `id`, `name`, `avatars`, `profileImages`)
- ✅ Batch queries support
- ✅ Robust error handling with RPC fallback

#### 3.2 Token Metadata GraphQL Queries

**Investigate Available Tables**:
Based on host-service patterns, likely available:
- `Token` or `LSP7Token` table
- `TokenMetadata` table  
- `LSP4Metadata` or similar

**Schema Discovery Strategy**:
```typescript
const TOKEN_SCHEMA_INTROSPECTION = gql`
  query TokenSchemaIntrospection {
    __schema {
      types {
        name
        fields {
          name
          type { name kind }
        }
      }
    }
  }
`;
```

**Target Query Structure**:
```typescript
const BATCH_TOKEN_METADATA_QUERY = gql`
  query GetBatchTokenMetadata($addresses: [String!]!) {
    Token(where: { address: { _in: $addresses } }) {
      address
      name
      symbol
      decimals
      tokenType
      lsp4TokenType
      totalSupply
      isNFT
      # ... other fields discovered via introspection
    }
  }
`;
```

#### 3.3 New Utility: `LuksoGraphQLService`

**File**: `src/lib/lukso/LuksoGraphQLService.ts`

```typescript
export class LuksoGraphQLService {
  private static readonly LUKSO_GRAPHQL_URL = process.env.LUKSO_GRAPHQL_URL || 'https://envio.lukso-mainnet.universal.tech/v1/graphql';
  private static readonly LUKSO_IPFS_GATEWAY = process.env.LUKSO_IPFS_GATEWAY_URL || 'https://api.universalprofile.cloud/ipfs/';
  
  private graphqlClient: GraphQLClient;
  private schemaDiscovered = false;
  private tokenQueryStructure: string | null = null;
  
  // Caching for performance
  private tokenCache = new Map<string, TokenMetadata>();
  private profileCache = new Map<string, UPProfile>();
  
  /**
   * Batch fetch token metadata for multiple contracts
   */
  async batchFetchTokenMetadata(addresses: string[]): Promise<Map<string, TokenMetadata>> {
    // Check cache first
    // Discover schema if needed
    // Execute batch GraphQL query
    // Fallback to direct RPC for missing tokens
    // Update cache
  }
  
  /**
   * Fetch single token metadata with caching
   */
  async fetchTokenMetadata(address: string): Promise<TokenMetadata | null> {
    const batch = await this.batchFetchTokenMetadata([address]);
    return batch.get(address) || null;
  }
  
  /**
   * Resolve IPFS URLs to HTTP gateway URLs
   */
  private resolveIpfsUrl(url: string): string {
    if (url.startsWith('ipfs://')) {
      return url.replace('ipfs://', LuksoGraphQLService.LUKSO_IPFS_GATEWAY);
    }
    return url;
  }
}

export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenType: 'LSP7' | 'LSP8';
  lsp4TokenType?: number; // 0 = Token, 1 = NFT
  totalSupply?: string;
  isNFT: boolean;
  isDivisible: boolean;
  icon?: string;
  confidence: 'high' | 'medium' | 'low'; // Based on data completeness
}
```

#### 3.4 Integration Points

**Replace Direct RPC Calls**:
- `src/lib/lukso/lsp7Classification.ts` → Use GraphQL first, RPC fallback
- `src/contexts/UniversalProfileContext.tsx` → Use GraphQL for `getEnhancedTokenBalances`
- `src/hooks/gating/up/useUPTokenMetadata.ts` → Use GraphQL service

**Environment Variables** (Already in curia-cg):
```bash
LUKSO_GRAPHQL_URL=https://envio.lukso-mainnet.universal.tech/v1/graphql
LUKSO_IPFS_GATEWAY_URL=https://api.universalprofile.cloud/ipfs/
```

#### 3.5 Migration Strategy

**Phase 1**: Add GraphQL service alongside existing RPC calls
**Phase 2**: Switch configurators to use GraphQL first
**Phase 3**: Replace all RPC metadata calls with GraphQL
**Phase 4**: Keep RPC only for balance verification

**Benefits**:
- ✅ **Reliability**: Professional indexer vs individual RPC calls
- ✅ **Performance**: Batch queries, caching, CDN-backed
- ✅ **Completeness**: Pre-processed metadata, IPFS resolution
- ✅ **Consistency**: Single source of truth for all metadata
- ✅ **Future-proof**: Easy to add new metadata fields

**Challenges**:
- ⚠️ **Schema Discovery**: Need to investigate actual GraphQL schema
- ⚠️ **Integration Effort**: Significant refactoring required
- ⚠️ **Fallback Complexity**: Still need RPC backup for edge cases
- ⚠️ **Environment Setup**: Requires GraphQL URL configuration

---

## Recommended Implementation Order

### Phase 1: Immediate Fix (1-2 days)
1. **Implement Solution Path 1**: Fix Multi-unit NFT decimals handling
2. **Add validation warnings** for inconsistent metadata
3. **Test with JAN token** to verify fix

### Phase 2: Investigate GraphQL (3-5 days)  
1. **Schema discovery** on LUKSO GraphQL endpoint
2. **Test token metadata queries** 
3. **Build proof-of-concept** `LuksoGraphQLService`
4. **Performance comparison** vs current RPC approach

### Phase 3: GraphQL Integration (1-2 weeks)
1. **Implement full `LuksoGraphQLService`**
2. **Replace configurator metadata fetching**
3. **Update all verification hooks**
4. **Add comprehensive error handling & fallbacks**

### Phase 4: User Controls (1 week)
1. **Implement Solution Path 2**: Manual override system
2. **Add admin verification features**
3. **Build community token database**

## Open Questions for Investigation

1. **GraphQL Schema**: What token metadata fields are actually available?
2. **Rate Limits**: Does the LUKSO GraphQL endpoint have usage limitations?
3. **Real-time Data**: How quickly does GraphQL reflect on-chain changes?
4. **Coverage**: Does GraphQL index all LSP7/LSP8 tokens or only popular ones?
5. **Environment Variables**: Are `LUKSO_GRAPHQL_URL` and `LUKSO_IPFS_GATEWAY_URL` already configured in curia-cg?

## Success Metrics

- **Reliability**: > 95% successful metadata fetches
- **Performance**: < 2s average response time for batch metadata
- **Accuracy**: 0 incidents of wrong decimals storage for Multi-unit NFTs
- **User Experience**: Clear confidence indicators and override options
- **Maintainability**: Single service handling all LUKSO metadata needs
