# CSV Profile Support Implementation Plan

## Overview
Add Universal Profile follow requirements support to the CSV upload feature, building on the existing 4-column schema and reliable GraphQL infrastructure.

## Current Status
✅ **Frontend CSV Component**: Already updated with profile support  
❌ **Backend GraphQL Service**: Not yet implemented  
❌ **API Integration**: Profile metadata not accessible  

## Problem Analysis

### Current CSV Schema (Working)
```csv
ecosystem,requirement_type,contract_address,min_amount
universal_profile,lsp7_token,0xf427...,1
universal_profile,lsp8_nft,0xb289...,1
universal_profile,must_follow,0xcdec...,1          # NEW
universal_profile,must_be_followed_by,0xcdec...,1  # NEW
```

### Current GraphQL Issue
- `CSVUploadComponent.tsx` calls `useLuksoProfileMetadata()` 
- Hook tries to fetch from `/api/lukso/metadata` 
- Backend `LuksoApiService` has profile support stubbed (`TODO: Add profiles support`)
- `LuksoGraphQLService` has no profile methods at all
- LUKSO GraphQL schema uses `Profile` table with `id` field (not `address`)

## Technical Architecture Plan

### 1. GraphQL Schema Analysis
Based on our curl test:
```graphql
Profile(where: { id: { _in: $addresses } }) {
  id                    # This is the address field
  name
  description
  avatars { src }
  profileImages { src }
  links { title url }
}
```

### 2. Type System Design

#### A. Core Profile Types (New)
```typescript
// src/lib/lukso/LuksoGraphQLService.ts
export interface ProfileMetadata {
  address: string;        // Normalized from GraphQL 'id' field
  name?: string;
  description?: string;
  avatar?: string;        // Best resolved IPFS URL from avatars[0]
  profileImage?: string;  // Best resolved IPFS URL from profileImages[0]
  links?: Array<{ title: string; url: string }>;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

interface GraphQLProfileResponse {
  id: string;             // This is actually the address
  name?: string;
  description?: string;
  avatars?: { src: string }[];
  profileImages?: { src: string }[];
  links?: { title: string; url: string }[];
}
```

#### B. Cache Strategy (Updated)
```typescript
// Make cache generic to avoid type mixing
interface CacheEntry<T = TokenMetadata | ProfileMetadata> {
  data: T;
  timestamp: number;
}

// Use separate cache keys:
// - tokens: `token_${address}`
// - profiles: `profile_${address}`
```

#### C. API Request Types (Updated)
```typescript
// src/lib/lukso/LuksoApiService.ts - Already exists, just implement
export interface LuksoMetadataRequest {
  type: 'tokens' | 'profiles' | 'mixed';  // ✅ Already supports profiles
  addresses: string[];
  // ... existing options
}

export interface LuksoMetadataResponse {
  data: {
    tokens?: Record<string, TokenMetadata>;
    profiles?: Record<string, ProfileMetadata>;  // ✅ Already defined
    // ...
  };
  // ... rest
}
```

### 3. Implementation Strategy

#### Phase 1: GraphQL Service Extension
1. **Add Profile Methods to `LuksoGraphQLService`**:
   ```typescript
   public async fetchProfileMetadata(addresses: string[]): Promise<Record<string, ProfileMetadata>>
   private convertProfileData(profile: GraphQLProfileResponse): ProfileMetadata
   private createFallbackProfileMetadata(address: string, error?: string): ProfileMetadata
   private extractBestAvatar(profile: GraphQLProfileResponse): string | undefined
   private extractBestProfileImage(profile: GraphQLProfileResponse): string | undefined
   ```

2. **Update Cache System**:
   - Generic `CacheEntry<T>` type
   - Separate cache prefixes: `profile_${address}` vs `token_${address}`
   - Same TTL as tokens (reasonable for profiles)

#### Phase 2: API Service Integration  
1. **Complete `LuksoApiService.fetchMetadata()`**:
   - Remove TODO comment for profiles
   - Implement profile address filtering for `type: 'mixed'`
   - Call `luksoService.fetchProfileMetadata(profileAddresses)`
   - Transform and cache results

#### Phase 3: Frontend Hook Integration
1. **Verify `useLuksoProfileMetadata` Hook**:
   - Should already work once backend is implemented
   - Uses same auth pattern as `useLuksoTokenMetadata`

#### Phase 4: CSV Integration  
1. **No Changes Needed**:
   - `CSVUploadComponent.tsx` already implements profile support
   - Validation, GraphQL enrichment, and conversion all ready
   - Will work automatically once backend is complete

### 4. Detailed Implementation Plan

#### Step 1: Update `LuksoGraphQLService.ts`
```typescript
// Add ProfileMetadata interface (already designed above)
// Add GraphQLProfileResponse interface 
// Update CacheEntry to be generic
// Add fetchProfileMetadata() method with proper GraphQL query
// Add helper methods for profile data conversion
```

#### Step 2: Update `LuksoApiService.ts`  
```typescript
// Remove "TODO: Add profiles support" 
// Implement profile fetching in fetchMetadata()
// Handle 'mixed' type by separating token vs profile addresses
// Transform GraphQL responses to API format
```

#### Step 3: Test & Validate
```bash
# Test profile-only CSV
echo "universal_profile,must_follow,0xcdec110f9c255357e37f46cd2687be1f7e9b02f7,1" > test_profiles.csv

# Test mixed CSV  
echo "universal_profile,lsp7_token,0xf427...,1
universal_profile,must_follow,0xcdec...,1" > test_mixed.csv
```

### 5. Error Handling Strategy

#### GraphQL Errors
- Profile not found → confidence: 'low', error set, cached with shorter TTL
- Network errors → fallback metadata, user-visible error

#### Validation Errors  
- Invalid address format → clear error message
- Wrong requirement type → suggest correct options
- Mixed ecosystem → enforce LUKSO-only

### 6. Performance Considerations

#### Caching
- Same 30-minute TTL as tokens (profiles change infrequently)
- Separate cache namespaces prevent type conflicts
- Batch queries for multiple profiles

#### Rate Limiting
- LUKSO GraphQL is quite generous
- Batch up to 50 addresses per request (same as tokens)

### 7. Testing Strategy

#### Unit Tests
- `LuksoGraphQLService.fetchProfileMetadata()` with mock responses
- `LuksoApiService.fetchMetadata()` with mixed token/profile requests
- Cache hit/miss scenarios

#### Integration Tests  
- CSV upload with profile requirements
- Mixed token + profile CSV files
- Error handling for invalid profiles

#### Manual Testing
- Test with real LUKSO profile addresses (like the feindura example)
- Verify GraphQL enrichment displays profile names
- Test fallback behavior for non-existent profiles

### 8. Risks & Mitigations

#### Risk: GraphQL Schema Changes
**Mitigation**: Test against LUKSO mainnet GraphQL regularly, add error handling

#### Risk: Profile Address Format Issues  
**Mitigation**: Same validation as token addresses (0x + 40 hex chars)

#### Risk: Cache Type Confusion
**Mitigation**: Generic cache with separate key prefixes, TypeScript enforcement

### 9. Success Criteria

1. ✅ CSV upload accepts `must_follow` and `must_be_followed_by` requirements
2. ✅ Profile names resolve from LUKSO GraphQL (e.g., "feindura" for 0xcdec...)  
3. ✅ Mixed token + profile CSV files work correctly
4. ✅ Validation shows clear error messages for invalid profiles
5. ✅ Performance remains good with proper caching
6. ✅ Fallback gracefully when profiles not found

### 10. Implementation Order

1. **First**: Update `LuksoGraphQLService` with profile methods
2. **Second**: Complete `LuksoApiService` profile integration
3. **Third**: Test CSV upload with profile addresses
4. **Fourth**: Validate error handling and edge cases

---

## Next Steps
1. Implement GraphQL service changes
2. Test with known profile address (0xcdec110f9c255357e37f46cd2687be1f7e9b02f7)
3. Validate CSV upload flow works end-to-end
