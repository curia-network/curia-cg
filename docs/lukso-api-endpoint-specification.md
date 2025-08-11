# LUKSO API Endpoint Specification

## Overview

This document specifies a new API endpoint for LUKSO-specific data fetching, including token metadata and Universal Profile information. The endpoint will serve as a backend proxy to the LUKSO GraphQL indexer, eliminating CORS/CSP issues and providing centralized caching and error handling.

## Existing API Patterns Analysis

### **Authentication Pattern** 
```typescript
// From src/lib/withAuth.ts
export function withAuth(
  handler: (req: AuthenticatedRequest, context: RouteContext) => Promise<NextResponse>,
  adminOnly: boolean = false
)
```

### **Response Format Patterns**
```typescript
// Success responses
NextResponse.json(userInfo);
NextResponse.json({ settings });
NextResponse.json({ success: true, data: metadata });

// Error responses  
NextResponse.json({ error: 'User not found' }, { status: 401 });
NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
```

### **Route Structure Patterns**
- **Resource-based**: `/api/me`, `/api/locks`, `/api/communities`
- **Nested resources**: `/api/locks/[lockId]/verify/[categoryType]`
- **Ecosystem-specific**: `/api/ethereum/validate-signature`, `/api/ethereum/verify-erc20`

### **Request Handling Patterns**
1. **Authentication check** via `withAuth` middleware
2. **Input validation** with specific error messages
3. **Database queries** with error handling
4. **Response formatting** with consistent structure
5. **Error logging** with descriptive prefixes

## Proposed LUKSO API Endpoint

### **Route Structure**
```
/api/lukso/
├── tokens          # Token metadata endpoints
├── profiles        # Universal Profile endpoints  
├── balances        # Token balance endpoints
└── metadata        # General metadata endpoints
```

### **Primary Endpoint: `/api/lukso/metadata`**

This unified endpoint handles both token and profile metadata requests, following the established patterns.

#### **POST /api/lukso/metadata**

**Request Body:**
```typescript
interface LuksoMetadataRequest {
  type: 'tokens' | 'profiles' | 'mixed';
  addresses: string[];
  includeBalances?: boolean;     // For tokens, include user balances
  userAddress?: string;          // Required if includeBalances = true
  options?: {
    forceRefresh?: boolean;      // Bypass cache
    includeIcons?: boolean;      // Include icon/image URLs
    includeDescriptions?: boolean; // Include full descriptions
  };
}
```

**Response Body:**
```typescript
interface LuksoMetadataResponse {
  success: boolean;
  data: {
    tokens?: Map<string, TokenMetadata>;
    profiles?: Map<string, ProfileMetadata>;
    balances?: Map<string, TokenBalance>; // If requested
  };
  meta: {
    cached: string[];           // Addresses served from cache
    fetched: string[];          // Addresses fetched from GraphQL
    failed: string[];           // Addresses that failed to fetch
    timestamp: string;
    cacheExpiry: string;
  };
  error?: string;
}
```

#### **GET /api/lukso/metadata/[address]**

Single address endpoint for simple lookups.

**Query Parameters:**
- `type`: `token` | `profile` (required)
- `includeBalance`: `true` | `false` (default: false)
- `userAddress`: User's address (required if includeBalance = true)

## Data Interfaces

### **TokenMetadata Interface**
```typescript
interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenType: 'LSP7' | 'LSP8';
  lsp4TokenType: number;        // 0 = Token, 1 = NFT, 2 = Collection
  totalSupply: string;
  isLSP7: boolean;
  isCollection: boolean;
  isDivisible: boolean;         // Computed field
  icon?: string;                // Resolved IPFS URL
  image?: string;               // Resolved IPFS URL  
  description?: string;
  confidence: 'high' | 'medium' | 'low';
  createdAt?: number;
  updatedAt?: number;
  error?: string;
}
```

### **ProfileMetadata Interface**
```typescript
interface ProfileMetadata {
  address: string;
  name?: string;
  description?: string;
  avatar?: string;              // Resolved IPFS URL
  profileImage?: string;        // Resolved IPFS URL
  links?: Array<{ title: string; url: string }>;
  confidence: 'high' | 'medium' | 'low';
  createdAt?: number;
  updatedAt?: number;
  error?: string;
}
```

### **TokenBalance Interface**
```typescript
interface TokenBalance {
  address: string;              // Token contract address
  userAddress: string;          // User's address
  balance: string;              // Raw balance in wei/smallest unit
  formattedBalance: string;     // Human-readable balance
  decimals: number;             // Token decimals for formatting
  symbol: string;               // Token symbol
  confidence: 'high' | 'medium' | 'low';
  lastUpdated: number;
}
```

## Backend Implementation Architecture

### **Service Layer Integration**
```typescript
// src/lib/lukso/LuksoApiService.ts
export class LuksoApiService {
  private graphqlService: LuksoGraphQLService;
  private balanceService: LuksoBalanceService;
  private cache: LuksoMetadataCache;
  
  async fetchMetadata(request: LuksoMetadataRequest): Promise<LuksoMetadataResponse> {
    // 1. Validate request
    // 2. Check cache
    // 3. Batch fetch from GraphQL
    // 4. Fetch balances if requested
    // 5. Update cache
    // 6. Format response
  }
}
```

### **Caching Strategy**
```typescript
interface CacheConfig {
  tokenMetadata: {
    ttl: 3600;                  // 1 hour (metadata rarely changes)
    maxSize: 10000;             // 10k token entries
  };
  profileMetadata: {
    ttl: 1800;                  // 30 minutes (profiles change more often)
    maxSize: 5000;              // 5k profile entries
  };
  balances: {
    ttl: 60;                    // 1 minute (balances change frequently)
    maxSize: 50000;             // 50k balance entries
  };
}
```

### **Error Handling Strategy**
```typescript
enum LuksoApiErrorType {
  INVALID_REQUEST = 'INVALID_REQUEST',
  GRAPHQL_ERROR = 'GRAPHQL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR'
}

interface LuksoApiError {
  type: LuksoApiErrorType;
  message: string;
  details?: any;
  retryable: boolean;
}
```

## Frontend Integration

### **New Hook: `useLuksoMetadata`**
```typescript
// src/hooks/lukso/useLuksoMetadata.ts
export function useLuksoMetadata(addresses: string[], type: 'tokens' | 'profiles') {
  return useQuery({
    queryKey: ['lukso-metadata', type, addresses],
    queryFn: async () => {
      const response = await fetch('/api/lukso/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, addresses })
      });
      
      if (!response.ok) throw new Error('Failed to fetch metadata');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,     // 5 minutes
    cacheTime: 60 * 60 * 1000,    // 1 hour
  });
}
```

### **Integration Points**
1. **`LSP7TokenConfigurator.tsx`**: Replace direct GraphQL calls
2. **`LSP8NFTConfigurator.tsx`**: Replace direct GraphQL calls  
3. **`useUPTokenMetadata.ts`**: Use backend proxy instead of RPC
4. **`RichRequirementsDisplay.tsx`**: Enhanced metadata display
5. **Lock verification endpoints**: Consistent metadata access

## Implementation Roadmap

### **Phase 1: Core Infrastructure (2-3 days)**
1. ✅ **LuksoGraphQLService** - Already implemented and tested
2. **LuksoApiService** - Backend service layer 
3. **Cache implementation** - Redis or in-memory with TTL
4. **API route handler** - `/api/lukso/metadata`
5. **Basic error handling** - GraphQL failures, network issues

### **Phase 2: Frontend Integration (2-3 days)**  
1. **`useLuksoMetadata` hook** - React Query integration
2. **Update token configurators** - Replace direct GraphQL/RPC calls
3. **Update metadata hooks** - `useUPTokenMetadata` proxy integration
4. **Error handling UI** - Graceful degradation for failures
5. **Loading states** - Proper UX during metadata fetching

### **Phase 3: Enhanced Features (1-2 days)**
1. **Balance integration** - Token balance fetching
2. **Profile metadata** - Universal Profile data
3. **Batch optimization** - Smart request batching
4. **Cache warming** - Preload popular tokens
5. **Monitoring** - API performance metrics

### **Phase 4: Migration & Testing (1-2 days)**
1. **Gradual rollout** - Feature flags for new endpoints
2. **Performance testing** - Load testing with cache
3. **Fallback mechanisms** - RPC backup for GraphQL failures  
4. **Documentation** - API documentation and examples
5. **Monitoring dashboards** - Cache hit rates, error rates

## Migration Strategy

### **Backwards Compatibility**
- Keep existing RPC-based functions as fallbacks
- Use feature flags to gradually enable new endpoints
- Maintain existing hook interfaces, update internals

### **Rollout Plan**
1. **Development**: Deploy to dev environment, test with known tokens
2. **Staging**: Limited rollout with monitoring  
3. **Production**: Gradual rollout by user percentage
4. **Full deployment**: Replace all direct GraphQL/RPC calls

### **Rollback Plan**
- Feature flags allow instant rollback to RPC-based methods
- Cache data remains valid during rollbacks
- No database schema changes required

## Security Considerations

### **Authentication Requirements**
- Most endpoints require authentication via `withAuth` middleware
- Public metadata endpoints (token info) may not require auth
- Balance endpoints always require authenticated user

### **Rate Limiting**
```typescript
// Per-user rate limits
const rateLimits = {
  authenticated: {
    requests: 1000,             // 1000 requests
    window: 3600,               // per hour
  },
  unauthenticated: {
    requests: 100,              // 100 requests  
    window: 3600,               // per hour
  }
};
```

### **Input Validation**
- Validate Ethereum addresses format
- Limit batch size (max 50 addresses per request)
- Sanitize GraphQL responses
- Validate IPFS URLs before resolution

## Performance Expectations

### **Target Metrics**
- **Response time**: < 200ms for cached data, < 1s for fresh GraphQL data
- **Cache hit rate**: > 80% for token metadata, > 60% for balances
- **Throughput**: > 1000 requests/minute per instance
- **Availability**: > 99.5% uptime (with GraphQL fallback)

### **Optimization Strategies**
- **Request deduplication**: Combine concurrent requests for same data
- **Background refresh**: Update cache before expiry
- **Compression**: Gzip responses for large metadata payloads
- **CDN integration**: Cache static metadata at edge locations

## Success Metrics

### **Technical Metrics**
- ✅ **Reliability**: > 99% successful metadata fetches
- ✅ **Performance**: < 500ms average response time
- ✅ **Cache efficiency**: > 75% cache hit rate
- ✅ **Error rate**: < 1% GraphQL/network errors

### **Business Metrics**  
- ✅ **User experience**: Faster lock creation/editing
- ✅ **Development velocity**: Reduced debugging of metadata issues
- ✅ **System stability**: Fewer CORS/CSP issues in production
- ✅ **Maintenance burden**: Centralized LUKSO data handling

## Future Enhancements

### **Advanced Features**
1. **Real-time subscriptions**: WebSocket updates for balance changes
2. **Predictive caching**: ML-based cache warming
3. **Multi-chain support**: Extend to other LSP-compatible chains
4. **Advanced analytics**: Token popularity, usage patterns
5. **API rate optimization**: Smart request batching and deduplication

### **Integration Opportunities**
1. **Lock analytics**: Track which tokens are commonly used in locks
2. **Community insights**: Most popular tokens per community
3. **User behavior**: Token interaction patterns
4. **Performance optimization**: Cache strategies based on usage data

This endpoint design provides a robust, scalable foundation for all LUKSO data needs while maintaining consistency with existing curia-cg API patterns and enabling future enhancements.
