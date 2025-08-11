# LUKSO RPC to GraphQL Migration Plan

## Overview

This document provides a comprehensive migration plan to replace all LUKSO RPC calls with our new GraphQL-based solution. The migration will eliminate unreliable metadata fetching, improve performance through backend caching, and solve CORS/CSP issues in the frontend.

## Migration Architecture

```
OLD ARCHITECTURE:
Frontend Components → Direct RPC Calls → LUKSO Network
Backend Verification → Direct RPC Calls → LUKSO Network

NEW ARCHITECTURE:
Frontend Components → useLuksoMetadata Hook → /api/lukso/metadata → LuksoApiService → LuksoGraphQLService → LUKSO GraphQL Indexer
Backend Verification → LuksoGraphQLService (direct) → LUKSO GraphQL Indexer
```

## Files Requiring Migration

### 🎯 **Frontend Components (HIGH PRIORITY)**

#### **1. LSP7 Token Configurator**
**Files:**
- `src/components/locks/configurators/LSP7TokenConfigurator.tsx` (curia-cg)
- `src/components/locks/configurators/LSP7TokenConfigurator.tsx` (curia)

**Current RPC Usage:**
```typescript
// Lines 173-277: Direct ethers.js RPC calls
const rpcUrl = process.env.NEXT_PUBLIC_LUKSO_MAINNET_RPC_URL || 'https://rpc.mainnet.lukso.network';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, [...], provider);
contractDecimals = await contract.decimals();

// Lines 214-277: ERC725.js for metadata
const erc725 = new ERC725(LSP4Schema, contractAddress, rpcUrl, { ipfsGateway: IPFS_GATEWAY });
const lsp4Data = await erc725.fetchData(['LSP4TokenName', 'LSP4TokenSymbol']);
```

**Migration Plan:**
```typescript
// Replace handleFetchMetadata function with:
const { data: tokenData, isLoading: isLoadingMetadata, error } = useLuksoSingleToken(
  contractAddress,
  { 
    includeIcons: true, 
    enabled: addressValidation.isValid 
  }
);

// Update state management to use GraphQL data
useEffect(() => {
  if (tokenData) {
    setTokenName(tokenData.name);
    setTokenSymbol(tokenData.symbol);
    setActualDecimals(tokenData.decimals);
    setTokenClassification(tokenData); // Classification from GraphQL
  }
}, [tokenData]);
```

#### **2. LSP8 NFT Configurator**
**Files:**
- `src/components/locks/configurators/LSP8NFTConfigurator.tsx` (curia-cg)
- `src/components/locks/configurators/LSP8NFTConfigurator.tsx` (curia)

**Current RPC Usage:**
```typescript
// Lines 143-238: Similar pattern to LSP7
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, [...], provider);
const isLSP8 = await contract.supportsInterface(LSP8_INTERFACE_ID);
```

**Migration Plan:**
```typescript
// Same pattern as LSP7, but for LSP8 tokens
const { data: nftData, isLoading, error } = useLuksoSingleToken(
  contractAddress,
  { 
    includeIcons: true, 
    enabled: addressValidation.isValid 
  }
);

// Verify it's LSP8 in the response
useEffect(() => {
  if (nftData && nftData.tokenType !== 'LSP8') {
    setMetadataValidation({ 
      isValid: false, 
      error: 'Contract is not a valid LSP8 NFT token' 
    });
  }
}, [nftData]);
```

#### **3. Universal Profile Context (Host Service)**
**Files:**
- `host-service/src/contexts/UniversalProfileContext.tsx`

**Current RPC Usage:**
```typescript
// Lines 201-254: Token icon fetching via ERC725
const erc725 = new ERC725(LSP4DigitalAssetSchema, contractAddress, providerUrl, { ipfsGateway });
const result = await erc725.fetchData(['LSP4Metadata']);

// Lines 256-323: Token balance fetching
const nameAndSymbol = await erc725.fetchData(['LSP4TokenName', 'LSP4TokenSymbol']);
const contract = new ethers.Contract(addr, ['function decimals() view returns (uint8)'], provider);
decimals = await contract.decimals();
```

**Migration Plan:**
```typescript
// Replace getTokenBalances with GraphQL-based fetching
const getTokenBalances = useCallback(async (tokenAddresses: string[]): Promise<TokenBalance[]> => {
  try {
    const response = await fetch('/api/lukso/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'tokens',
        addresses: tokenAddresses,
        includeBalances: true,
        userAddress: upAddress,
      }),
    });
    
    const data = await response.json();
    
    return Object.values(data.data.tokens || {}).map(token => ({
      contractAddress: token.address,
      balance: data.data.balances?.[token.address]?.balance || '0',
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      iconUrl: token.icon,
    }));
  } catch (error) {
    console.error('[UP Context] GraphQL metadata fetch failed:', error);
    return [];
  }
}, [upAddress]);

// Replace fetchTokenIcon with GraphQL data
const fetchTokenIcon = useCallback(async (contractAddress: string): Promise<string | null> => {
  const cached = tokenIconCache.get(contractAddress.toLowerCase());
  if (cached !== undefined) return cached;
  
  try {
    const response = await fetch('/api/lukso/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'tokens',
        addresses: [contractAddress],
        options: { includeIcons: true },
      }),
    });
    
    const data = await response.json();
    const token = data.data.tokens?.[contractAddress];
    const iconUrl = token?.icon || null;
    
    tokenIconCache.set(contractAddress.toLowerCase(), iconUrl);
    return iconUrl;
  } catch (error) {
    console.error('[UP Context] GraphQL icon fetch failed:', error);
    tokenIconCache.set(contractAddress.toLowerCase(), null);
    return null;
  }
}, [tokenIconCache]);
```

### 🔧 **Backend Verification Endpoints (HIGH PRIORITY)**

#### **4. Universal Profile Verification**
**Files:**
- `src/lib/verification/upVerification.ts` (curia-cg)
- `src/lib/verification/upVerification.ts` (curia)

**Current RPC Usage:**
```typescript
// Lines 30-63: Raw RPC calls for all operations
async function rawLuksoCall(method: string, params: unknown[] = []): Promise<unknown> {
  // Direct fetch() to RPC endpoints
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

// Lines 110-160: LSP7 balance verification
const balanceHex = await rawLuksoCall('eth_call', [
  { to: requirement.contractAddress, data: callData },
  'latest'
]);
```

**Migration Plan:**
```typescript
// Replace rawLuksoCall with LuksoGraphQLService
import { LuksoGraphQLService } from '@/lib/lukso/LuksoGraphQLService';

export async function verifyLSP7Balance(
  upAddress: string,
  requirement: TokenRequirement
): Promise<TokenVerificationResult> {
  try {
    console.log(`[verifyLSP7Balance] Checking LSP7 token ${requirement.contractAddress} for ${upAddress}`);

    // Use GraphQL service for metadata (if needed for validation)
    const graphqlService = LuksoGraphQLService.getInstance();
    const tokenMetadata = await graphqlService.getTokenMetadata(requirement.contractAddress);
    
    if (!tokenMetadata) {
      return {
        valid: false,
        error: `Token ${requirement.contractAddress} not found on LUKSO network`,
      };
    }

    // Continue using RPC for balance checks (GraphQL doesn't have real-time balances yet)
    // OR implement balance fetching via GraphQL when available
    const balanceHex = await rawLuksoCall('eth_call', [
      { to: requirement.contractAddress, data: callData },
      'latest'
    ]);

    // Use metadata from GraphQL for better decimal handling
    const tokenDecimals = tokenMetadata.decimals;
    const balanceFormatted = ethers.utils.formatUnits(balance, tokenDecimals);
    const minBalanceFormatted = ethers.utils.formatUnits(minBalance, tokenDecimals);
    
    return {
      valid: balance.gte(minBalance),
      error: balance.lt(minBalance) ? 
        `Insufficient ${tokenMetadata.symbol} balance. Required: ${minBalanceFormatted}, Current: ${balanceFormatted}` : 
        undefined,
      balance: balance.toString()
    };

  } catch (error) {
    console.error(`[verifyLSP7Balance] Failed to verify LSP7 token:`, error);
    return {
      valid: false,
      error: `Unable to verify token balance. Please try again.`,
    };
  }
}
```

### 📊 **Universal Profile & Social Metadata (MEDIUM PRIORITY)**

#### **5. UP Social Profile Fetching**
**Files:**
- `host-service/src/lib/upProfile.ts`
- `host-service/src/lib/friends/UpFriendsService.ts`

**Current RPC Usage:**
```typescript
// Lines 96-163: ERC725 profile fetching
const erc725 = new ERC725(LSP3ProfileSchema, address, LUKSO_RPC_URL, { ipfsGateway: IPFS_GATEWAY });
const profileData = await erc725.fetchData('LSP3Profile');
```

**Migration Plan:**
```typescript
// Extend GraphQL service for Universal Profile metadata
// Update LuksoGraphQLService to support profiles
// Replace ERC725 calls with GraphQL queries

export const getUPSocialProfile = async (address: string): Promise<UPSocialProfile> => {
  try {
    const response = await fetch('/api/lukso/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'profiles',
        addresses: [address],
        options: { includeIcons: true, includeDescriptions: true },
      }),
    });
    
    const data = await response.json();
    const profile = data.data.profiles?.[address];
    
    if (!profile) {
      return createFallbackProfile(address);
    }
    
    return {
      address,
      displayName: profile.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
      profileImageUrl: profile.avatar || profile.profileImage,
      description: profile.description,
      links: profile.links || [],
      lastFetched: new Date(),
    };
  } catch (error) {
    console.error('[getUPSocialProfile] GraphQL fetch failed:', error);
    return createFallbackProfile(address, error.message);
  }
};
```

### 🔧 **Hooks and Utilities (MEDIUM PRIORITY)**

#### **6. UP Token Metadata Hooks**
**Files:**
- `src/hooks/gating/up/useUPTokenMetadata.ts`
- `src/hooks/gating/up/useUPSocialProfiles.ts`

**Migration Plan:**
```typescript
// Replace existing hooks with new LUKSO metadata hooks
// Update all components using these hooks

// OLD: useUPTokenMetadata
// NEW: useLuksoTokenMetadata from our new hook

// Update all imports across the codebase:
// import { useUPTokenMetadata } from '@/hooks/gating/up/useUPTokenMetadata';
// ↓
// import { useLuksoTokenMetadata } from '@/hooks/lukso/useLuksoMetadata';
```

### 🎨 **Display Components (LOW PRIORITY)**

#### **7. Rich Requirements Display**
**Files:**
- `src/components/gating/RichRequirementsDisplay.tsx`

**Migration Plan:**
```typescript
// Update to use new metadata structure from GraphQL
// Replace useUPTokenMetadata with useLuksoTokenMetadata
// Ensure decimal handling works correctly with GraphQL data

const { data: tokensData } = useLuksoTokenMetadata(
  tokenRequirements.map(req => req.contractAddress),
  { includeIcons: true, enabled: tokenRequirements.length > 0 }
);

// Update token display logic to use GraphQL response format
```

#### **8. Requirement Cards**
**Files:**
- `src/components/locks/RequirementCard.tsx`

**Migration Plan:**
```typescript
// Similar pattern - replace metadata hooks with GraphQL-based ones
// Update token metadata display logic
```

## Migration Phases

### **Phase 1: Core Infrastructure (COMPLETED)**
- ✅ LuksoGraphQLService implementation
- ✅ LuksoApiService implementation  
- ✅ /api/lukso/metadata endpoint
- ✅ useLuksoMetadata React hooks

### **Phase 2: Frontend Token Configurators (2-3 days)**
1. **LSP7TokenConfigurator** - Replace RPC calls with useLuksoSingleToken hook
2. **LSP8NFTConfigurator** - Replace RPC calls with useLuksoSingleToken hook
3. **Test token metadata fetching** - Verify JAN, DRIZZLE, LUKSO OG work correctly
4. **Update error handling** - GraphQL-specific error messages

### **Phase 3: Backend Verification (1-2 days)**
1. **Update upVerification.ts** - Use LuksoGraphQLService for metadata
2. **Keep RPC for balances** - Until GraphQL supports real-time balance queries
3. **Test verification endpoints** - Ensure lock verification still works
4. **Update error messages** - Better user feedback with GraphQL metadata

### **Phase 4: Universal Profile Context (2-3 days)**
1. **Update UniversalProfileContext** - Replace ERC725 calls with GraphQL
2. **Migrate token balance fetching** - Use new metadata + existing balance calls
3. **Update token icon fetching** - Use GraphQL metadata
4. **Test UP functionality** - Ensure profile display still works

### **Phase 5: Hooks Migration (1-2 days)**
1. **Replace useUPTokenMetadata** - Update all imports to useLuksoTokenMetadata
2. **Update useUPSocialProfiles** - Extend for profile metadata when available
3. **Update display components** - RichRequirementsDisplay, RequirementCard
4. **Test all gating displays** - Ensure metadata shows correctly

### **Phase 6: Social Profile Enhancement (2-3 days)**
1. **Extend GraphQL service** - Add Universal Profile metadata support
2. **Update UP social fetching** - Replace ERC725 with GraphQL
3. **Update friends service** - Use GraphQL for profile resolution
4. **Test social features** - Profile cards, social stats

### **Phase 7: Cleanup & Optimization (1 day)**
1. **Remove unused RPC code** - Clean up old ERC725 imports
2. **Remove redundant providers** - Consolidate ethers.js usage
3. **Update error handling** - Consistent GraphQL error patterns
4. **Performance testing** - Verify caching works correctly

## Implementation Strategy

### **Migration Approach: Gradual Replacement**
1. **Feature flags** - Use environment variables to enable/disable GraphQL
2. **Fallback mechanisms** - Keep RPC as backup during transition
3. **Parallel testing** - Test both old and new approaches
4. **Component-by-component** - Migrate one component at a time

### **Testing Strategy**
1. **Known problematic tokens** - Test JAN, DRIZZLE, LUKSO OG specifically
2. **Cross-browser testing** - Ensure CORS issues are resolved
3. **Performance benchmarks** - Compare old vs new response times
4. **Error scenarios** - Test network failures, invalid addresses

### **Rollback Plan**
1. **Environment variable toggles** - Quick disable of GraphQL features
2. **Preserve old code** - Keep commented RPC implementations
3. **Database compatibility** - Ensure both systems work with same data
4. **Quick revert process** - Documented steps to rollback

## Success Metrics

### **Performance Improvements**
- ✅ **Metadata fetch time**: < 500ms (vs current 2-3s RPC calls)
- ✅ **Cache hit rate**: > 80% for repeated token queries
- ✅ **Error rate reduction**: < 1% failed metadata fetches
- ✅ **CORS/CSP issues**: Eliminated (100% backend proxy)

### **Reliability Improvements** 
- ✅ **Consistent token metadata**: GraphQL indexer vs inconsistent RPC
- ✅ **Better error messages**: User-friendly errors from GraphQL data
- ✅ **Reduced timeout issues**: GraphQL is more reliable than RPC
- ✅ **Centralized debugging**: All LUKSO calls go through one service

### **Developer Experience**
- ✅ **Simplified debugging**: Single endpoint for all LUKSO data
- ✅ **TypeScript safety**: Consistent interfaces across codebase  
- ✅ **React Query integration**: Automatic caching, loading states
- ✅ **Reduced complexity**: No more ERC725.js configuration

## Key Files Summary

### **High Priority (Core Functionality)**
```
Frontend Configurators:
- src/components/locks/configurators/LSP7TokenConfigurator.tsx
- src/components/locks/configurators/LSP8NFTConfigurator.tsx

Backend Verification:
- src/lib/verification/upVerification.ts

Context Providers:
- host-service/src/contexts/UniversalProfileContext.tsx
```

### **Medium Priority (Enhanced Features)**
```
Social & Profile:
- host-service/src/lib/upProfile.ts
- host-service/src/lib/friends/UpFriendsService.ts

Metadata Hooks:
- src/hooks/gating/up/useUPTokenMetadata.ts
- src/hooks/gating/up/useUPSocialProfiles.ts
```

### **Low Priority (Display & Polish)**
```
Display Components:
- src/components/gating/RichRequirementsDisplay.tsx
- src/components/locks/RequirementCard.tsx
- src/components/locks/RequirementsList.tsx
```

### **New Files (Already Created)**
```
GraphQL Infrastructure:
- src/lib/lukso/LuksoGraphQLService.ts ✅
- src/lib/lukso/LuksoApiService.ts ✅
- src/app/api/lukso/metadata/route.ts ✅
- src/hooks/lukso/useLuksoMetadata.ts ✅
```

## UniversalProfileContext Analysis & Refactor Plan

### **Current State Analysis**

The `UniversalProfileContext` is a critical piece that manages:

1. **Connection Management**: UP wallet connection, account/chain listeners
2. **Balance Fetching**: LYX balance, token balances 
3. **Enhanced Metadata**: `getEnhancedTokenBalances` - heavy RPC usage
4. **Message Signing**: Wallet integration for authentication

### **Key Functions Requiring Migration**

#### `getEnhancedTokenBalances` (PRIMARY TARGET)
**Current Implementation:**
- Uses ERC725.js for LSP4 metadata (name, symbol)
- Direct RPC calls for decimals via `contract.decimals()`
- `classifyLsp7Cached` for token classification
- `fetchTokenIcon` for icon URLs
- Complex error handling and fallbacks

**Migration Strategy:**
```typescript
// OLD (RPC-heavy):
getEnhancedTokenBalances(requests) → [ERC725.js + RPC calls + classification]

// NEW (GraphQL-based):
getEnhancedTokenBalances(requests) → LuksoApiService.fetchMetadata()
```

#### `getTokenBalances` (SECONDARY TARGET) 
**Current Implementation:**
- Pure balance fetching via RPC (`balanceOf`)
- No metadata, just balance numbers
- Simpler, less prone to failure

**Migration Strategy:**
- Keep RPC for balance fetching (reliable)
- Use GraphQL only for metadata enhancement

### **Refactor Approach**

#### **Option A: Minimal Migration (RECOMMENDED)**
```typescript
getEnhancedTokenBalances(requests) {
  // 1. Use LuksoApiService for metadata (name, symbol, decimals, icons)
  // 2. Keep RPC for actual balance fetching
  // 3. Merge GraphQL metadata with RPC balances
  // 4. Remove ERC725.js dependency
  // 5. Remove classifyLsp7Cached dependency
}
```

#### **Option B: Full Replacement** 
```typescript
// Replace entire context with:
// - GraphQL for all metadata
// - React Query for caching
// - Separate hooks for different concerns
```

#### **Option C: Hybrid Approach**
```typescript
// Keep existing structure but:
// - Replace metadata fetching with GraphQL
// - Keep balance fetching with RPC
// - Add GraphQL caching layer
```

### **Dependencies to Remove**
```typescript
// Current heavy imports:
import { ERC725 } from '@erc725/erc725.js';
import LSP4DigitalAssetSchema from '@erc725/erc725.js/schemas/LSP4DigitalAsset.json';
import { classifyLsp7Cached, getDisplayDecimals, isNonDivisibleToken } from '@/lib/lukso/lsp7Classification';

// New lightweight imports:
import { LuksoApiService } from '@/lib/lukso/LuksoApiService';
import type { LuksoTokenMetadata } from '@/hooks/lukso/useLuksoMetadata';
```

### **Implementation Plan**

#### **Phase 1: Prepare**
1. ✅ Document current behavior
2. ✅ Identify all consumers of `getEnhancedTokenBalances`
3. ✅ Plan data structure compatibility

#### **Phase 2: Replace Core Logic**
1. Replace ERC725.js metadata fetching with `LuksoApiService`
2. Transform GraphQL response to match current `TokenBalance` interface
3. Remove classification logic (use GraphQL data directly)
4. Keep same function signature for compatibility

#### **Phase 3: Test & Validate**
1. Test with JAN token (known problematic case)
2. Verify all existing consumers work unchanged
3. Performance comparison (GraphQL vs RPC)

#### **Phase 4: Cleanup**
1. Remove unused imports and dependencies
2. Update error handling
3. Add GraphQL-specific logging

### **Risk Assessment**

**LOW RISK**: 
- `getEnhancedTokenBalances` is well-isolated
- Function signature can remain unchanged
- Fallback logic already exists

**MEDIUM RISK**: 
- Many components depend on this context
- Data structure changes could break consumers

**MITIGATION**:
- Keep exact same return interface
- Comprehensive testing before merge
- Gradual rollout with feature flags

### **Success Criteria**

1. ✅ JAN token displays correct metadata (name, symbol, decimals)
2. ✅ Performance improvement (GraphQL < 500ms vs RPC > 2s)
3. ✅ No breaking changes to existing components
4. ✅ Reduced bundle size (remove ERC725.js)
5. ✅ Better error handling and user feedback

## Next Steps

**IMMEDIATE**: 
1. ✅ Complete this analysis 
2. ✅ Create isolated test for `getEnhancedTokenBalances`
3. ✅ Implement replacement with careful interface preservation

**FOLLOWING**:
1. **Test with Phase 1/2 completions** - Verify RichRequirementsDisplay + useUpTokenVerification work
2. **Complete UniversalProfileContext migration** - Use detailed plan above
3. **Migrate remaining configurators** - LSP8NFTConfigurator, etc.
4. **End-to-end testing** - JAN, DRIZZLE, LUKSO OG tokens

This migration will solve the fundamental reliability issues with LUKSO metadata fetching while providing a much better developer and user experience.
