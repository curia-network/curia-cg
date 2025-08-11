# Token Marketplace Links & Manual Metadata Implementation Plan (REFINED)

## Overview

This document outlines the implementation plan for extending LSP7/LSP8 token configurators with:
1. **Smart metadata fallback** - Show fetched data beautifully, allow manual entry where missing
2. **Comprehensive marketplace integration** - LSP7 (UniversalSwaps) + LSP8 (Universal.page) support  
3. **Universal Profile follow buttons** - Direct transaction-based follow functionality
4. **Database schema extensions** - Store marketplace links in existing JSONB structure
5. **Complete utility libraries** - Marketplace URL generation + follow transaction utilities

Based on analysis of existing codebase, `o5-lukso-marketplace.md`, `o5-lukso-marketplace-lsp8.md`, and wallet integration patterns.

## Requirements Analysis

### 1. Smart Metadata Fallback (REFINED)
**Problem**: GraphQL metadata can be missing/incomplete, but decimals field always needs a value.

**REFINED Solution**: 
- **Smart UI Pattern**: Always show fetched GraphQL data in a beautiful way
- **Fill-in-the-gaps**: Where metadata is missing, show empty/editable fields for user input
- **Visual distinction**: Clear indication of auto-detected vs manually entered data
- **Field-specific logic**:
  - `decimals`: Always required (GraphQL → stored → manual → error if still missing)
  - `name/symbol`: Optional but improves UX (GraphQL → manual → "Unknown Token")
  - `description/icon`: Optional enhancement fields

### 2. Comprehensive Marketplace Integration (REFINED)
**Problem**: Users who don't meet token requirements have no guidance on where to acquire tokens

**REFINED Solution**:
- **LSP7 Support**: UniversalSwaps integration (trade + info links)
- **LSP8 Support**: Universal.page integration (collection + item + viewer fallback)
- **Auto-suggestion**: Generate URLs based on contract address + token type/ID
- **Manual override**: Allow custom marketplace URLs
- **Smart defaults**: Primary acquisition URL prominently displayed

### 3. Universal Profile Follow Buttons (NEW RESEARCH)
**Problem**: Users who don't meet "must_follow" requirements need direct action

**REFINED Solution**: 
- **Follow Transaction**: Implement Universal Profile follow via wallet transaction
- **LSP26 Integration**: Extend existing `lsp26.ts` with follow/unfollow methods
- **Wallet Connection**: Use existing `UniversalProfileContext` for transaction signing
- **UI Integration**: "Follow" button only for `up_must_follow` requirements
- **Real-time Updates**: Refresh verification status after successful follow

## Database Schema Changes

### Current Token Config Storage
Token configurations are stored in `locks.gating_config` as JSONB with this structure:

```typescript
// Current LSP7TokenConfig
interface LSP7TokenConfig {
  contractAddress: string;
  minAmount: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

// Current LSP8NFTConfig  
interface LSP8NFTConfig {
  contractAddress: string;
  minAmount?: string;
  tokenId?: string;
  name?: string;
  symbol?: string;
}
```

### Proposed Schema Extensions

```typescript
// Extended LSP7TokenConfig
interface LSP7TokenConfig {
  contractAddress: string;
  minAmount: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  
  // New fields:
  marketplaceUrl?: string;           // Where to acquire this token
  isManualMetadata?: boolean;        // True if metadata was manually entered
  manualMetadata?: {                 // Manual override fields
    name?: string;
    symbol?: string; 
    decimals?: number;
  };
}

// Extended LSP8NFTConfig
interface LSP8NFTConfig {
  contractAddress: string;
  minAmount?: string;
  tokenId?: string;
  name?: string;
  symbol?: string;
  
  // New fields:
  marketplaceUrl?: string;           // Where to acquire this token/NFT
  isManualMetadata?: boolean;        // True if metadata was manually entered
  manualMetadata?: {                 // Manual override fields
    name?: string;
    symbol?: string;
  };
}

// Extended UPMustFollowConfig (for follow buttons)
interface UPMustFollowConfig {
  address: string;
  profileName?: string;
  username?: string;
  
  // New field:
  showFollowButton?: boolean;        // Whether to show follow action
}
```

**Migration Strategy**: 
- No database migration needed - JSONB fields are flexible
- New fields are optional, backward compatible
- Add new fields during lock creation/editing
- Legacy locks work without new fields

## Marketplace Link Generation Utility (REFINED)

### Implementation Plan

Create `src/lib/lukso/marketplaceLinks.ts` based on `o5-lukso-marketplace.md` + `o5-lukso-marketplace-lsp8.md`:

```typescript
// Comprehensive marketplace links interface
interface TokenMarketplaceLinks {
  // Primary acquisition URL (most important)
  primary: string;
  
  // LSP7 specific
  trade?: string;        // UniversalSwaps trading page
  info?: string;         // UniversalSwaps analytics page
  
  // LSP8 specific  
  collection?: string;   // Universal.page collection
  item?: string;         // Universal.page specific item (if tokenId)
  viewer?: string;       // UniversalEverything viewer fallback
}

// Main generation function
function generateMarketplaceLinks(
  standard: 'LSP7' | 'LSP8',
  contractAddress: string,
  tokenId?: string | number | bigint
): TokenMarketplaceLinks

// Get primary acquisition URL (most important for UX)
function getPrimaryMarketplaceUrl(
  standard: 'LSP7' | 'LSP8', 
  contractAddress: string,
  tokenId?: string | number | bigint
): string

// LSP8-specific helper for token ID formatting
function formatLSP8TokenId(
  tokenId: string | number | bigint,
  format: 'universal-page' | 'bytes32'
): string
```

### URL Generation Patterns (COMPREHENSIVE)

**LSP7 Tokens (UniversalSwaps)**:
- **Primary**: `https://universalswaps.io/tokens/lukso/${checksumAddress}`
- **Trade**: `https://universalswaps.io/tokens/lukso/${checksumAddress}`
- **Info**: `https://info.universalswaps.io/#/tokens/${checksumAddress}`

**LSP8 Tokens (Universal.page + fallbacks)**:
- **Primary**: Collection or item page depending on tokenId presence
- **Collection**: `https://universal.page/collections/lukso/${checksumAddress}`
- **Item**: `https://universal.page/collections/lukso/${checksumAddress}/${formattedTokenId}`
- **Viewer**: `https://universaleverything.io/asset/${checksumAddress}/tokenId/${bytes32TokenId}`

**LSP8 Token ID Handling**:
- Decimal: `4222` → Universal.page: `4222`, Viewer: `0x000...107e`
- Hex: `0x000...107e` → Universal.page: `0x000...107e`, Viewer: `0x000...107e`
- String: `"special"` → UTF-8 to bytes32 conversion

## Universal Profile Follow Implementation (NEW)

### Research Findings

**Current State**:
- `lsp26.ts` has read-only LSP26 registry interaction (followerCount, isFollowing)
- `UniversalProfileContext.tsx` provides wallet connection and message signing
- No follow/unfollow transaction functionality exists

**Follow Transaction Requirements**:
Based on research and existing patterns, Universal Profile following requires calling the Universal Profile's `setData` function with specific ERC725Y keys.

### Implementation Plan

Extend `src/lib/lsp26.ts` with transaction capabilities:

```typescript
// Add to existing LSP26Registry class
export class LSP26Registry {
  // ... existing read methods ...
  
  /**
   * Follow a Universal Profile by calling setData on the user's UP
   * @param userUpAddress - The UP address that wants to follow
   * @param targetUpAddress - The UP address to follow
   * @param provider - ethers provider with signer
   */
  async followProfile(
    userUpAddress: string,
    targetUpAddress: string, 
    provider: ethers.providers.Web3Provider
  ): Promise<{ success: boolean; txHash?: string; error?: string }>

  /**
   * Unfollow a Universal Profile
   */
  async unfollowProfile(
    userUpAddress: string,
    targetUpAddress: string,
    provider: ethers.providers.Web3Provider  
  ): Promise<{ success: boolean; txHash?: string; error?: string }>

  /**
   * Get estimated gas for follow transaction
   */
  async estimateFollowGas(
    userUpAddress: string,
    targetUpAddress: string,
    provider: ethers.providers.Web3Provider
  ): Promise<ethers.BigNumber>
}
```

### Follow Transaction Flow

1. **User clicks "Follow" button** in requirements display
2. **Check wallet connection** via `UniversalProfileContext`
3. **Estimate gas costs** for follow transaction
4. **Show confirmation modal** with gas estimate
5. **Execute follow transaction** via `setData` on user's Universal Profile
6. **Wait for confirmation** and update UI
7. **Refresh verification status** to reflect new follow state

### ERC725Y Data Keys for Following

Based on LSP26 standard patterns:
```typescript
// Following data key format (needs research confirmation)
const FOLLOWING_DATA_KEY_PREFIX = '0x...'; // LSP26 following key
const followingDataKey = FOLLOWING_DATA_KEY_PREFIX + targetUpAddress.slice(2);
const followingDataValue = '0x01'; // Following = true, 0x00 = unfollowing
```

### Wallet Integration Points

**Using Existing Infrastructure**:
- `UniversalProfileContext.provider` - For transaction signing
- `UniversalProfileContext.signMessage` - For verification if needed
- Modal system from lock verification flows
- Error handling patterns from existing transaction flows

## Files to Modify

### 1. Type Definitions
- `src/types/locks.ts` - Extend `LSP7TokenConfig`, `LSP8NFTConfig`, `UPMustFollowConfig`
- `src/types/gating.ts` - Update corresponding interfaces 
- `src/types/settings.ts` - Update `TokenRequirement` interface

### 2. Marketplace Utilities
- `src/lib/lukso/marketplaceLinks.ts` - New file with URL generation logic
- `src/lib/lukso/index.ts` - Export new utilities

### 3. Configurator Components
- `src/components/locks/configurators/LSP7TokenConfigurator.tsx` - Add manual metadata + marketplace URL fields
- `src/components/locks/configurators/LSP8NFTConfigurator.tsx` - Add manual metadata + marketplace URL fields  
- `src/components/locks/configurators/UPMustFollowConfigurator.tsx` - Add follow button option

### 4. Display Components
- `src/components/gating/RichRequirementsDisplay.tsx` - Show marketplace links for unmet requirements
- `src/components/locks/RequirementCard.tsx` - Show marketplace URL in requirement previews
- `src/components/locks/RequirementsList.tsx` - Include marketplace info in requirement list

### 5. CSV Import
- `src/components/locks/csv/CSVUploadComponent.tsx` - Support marketplace URL column in CSV
- Update CSV schema documentation and validation

## Implementation Phases (REFINED)

### Phase 1: Marketplace Link Utility (Foundation)
**Scope**: Create comprehensive marketplace link generation
**Files**: 
- `src/lib/lukso/marketplaceLinks.ts` (new) - LSP7 + LSP8 support
- Update exports in `src/lib/lukso/index.ts`

**Deliverables**:
- UniversalSwaps URL generation for LSP7 tokens
- Universal.page + UniversalEverything URL generation for LSP8 tokens  
- LSP8 token ID format handling (decimal/hex/string)
- Comprehensive unit tests for all URL patterns
- Address checksumming and validation

### Phase 2: Universal Profile Follow Utility (Transactions)
**Scope**: Implement follow/unfollow transaction functionality
**Files**:
- `src/lib/lsp26.ts` - Extend with transaction methods
- `src/lib/lukso/followTransactions.ts` (new) - Transaction utilities

**Deliverables**:
- Follow/unfollow transaction methods with gas estimation
- ERC725Y data key handling for follow state
- Transaction confirmation and error handling
- Integration with existing UniversalProfileContext

### Phase 3: Type System Extensions  
**Scope**: Extend type definitions for all new fields
**Files**:
- `src/types/locks.ts`
- `src/types/gating.ts` 
- `src/types/settings.ts`

**Deliverables**:
- Extended config interfaces with marketplace links
- Manual metadata override fields
- Follow button configuration options
- Backward compatibility maintained

### Phase 4: Smart Metadata UI (Beautiful + Fallback)
**Scope**: Beautiful metadata display + manual entry where missing
**Files**:
- `src/components/locks/configurators/LSP7TokenConfigurator.tsx`
- `src/components/locks/configurators/LSP8NFTConfigurator.tsx`

**Deliverables**:
- Beautiful display of fetched GraphQL metadata
- Smart fallback fields for missing data (name, symbol, decimals)
- Visual distinction between auto-detected vs manual data
- Form validation with clear error messages
- Prevent saving with missing required fields (decimals)

### Phase 5: Marketplace URL Configuration
**Scope**: Add marketplace URL fields with auto-suggestions
**Files**:
- Same configurator files as Phase 4
- Form handling and marketplace utility integration

**Deliverables**:
- Auto-generated marketplace URL suggestions
- Manual marketplace URL override capability
- URL validation and preview functionality
- Primary vs secondary marketplace link handling

### Phase 6: Display Integration (Links + Follow Buttons)
**Scope**: Show marketplace links and follow buttons in requirement displays
**Files**:
- `src/components/gating/RichRequirementsDisplay.tsx`
- `src/components/locks/RequirementCard.tsx`
- `src/components/locks/RequirementsList.tsx`

**Deliverables**:
- "Get Token" links for unmet token requirements
- "Follow" buttons for `up_must_follow` requirements
- Transaction flow integration with wallet connection
- Real-time status updates after follow transactions
- Proper styling and responsive design

### Phase 7: CSV Import Support (Marketplace URLs)
**Scope**: Support marketplace URLs in CSV uploads
**Files**:
- `src/components/locks/csv/CSVUploadComponent.tsx`

**Deliverables**:
- Optional `marketplace_url` column (6th column) in CSV schema
- Backward compatibility with 5-column format
- Auto-generation of marketplace URLs when column empty
- Updated validation and parsing logic
- Documentation updates for new CSV format

## Technical Considerations

### 1. GraphQL Metadata Fallback Strategy
```typescript
// Current: GraphQL primary, fallback to stored config
const name = tokenData?.name || config.name || 'Unknown Token';

// Proposed: Add manual metadata layer
const name = config.manualMetadata?.name || tokenData?.name || config.name || 'Unknown Token';
```

### 2. UI State Management for Manual Entry
- Show manual fields only when `isLoadingMetadata === false && (metadataError || !tokenData)`
- Clear manual fields when GraphQL succeeds after failure
- Persist manual entries in form state during editing

### 3. Marketplace URL Validation
```typescript
// Validate marketplace URLs
function isValidMarketplaceUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Allow HTTPS only for security
    return urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}
```

### 4. CSV Schema Extensions
```csv
# Current 4-5 column format:
ecosystem,requirement_type,contract_address,min_amount,token_id

# Proposed 6-column format:
ecosystem,requirement_type,contract_address,min_amount,token_id,marketplace_url

# Example:
universal_profile,lsp7_token,0xf4272e...,1000000000000000000,,https://universalswaps.io/tokens/lukso/0xf4272e...
universal_profile,lsp8_nft,0x2b2eb8...,1,4222,https://universal.page/collections/lukso/0x2b2eb8.../4222
```

## Security & Validation

### 1. Marketplace URL Safety
- Whitelist known marketplace domains (universalswaps.io, universal.page, universaleverything.io)
- Validate HTTPS protocol only
- Sanitize URLs to prevent XSS attacks
- Show URL preview before saving

### 2. Manual Metadata Validation
- Validate decimals are 0-18 range for LSP7
- Sanitize name/symbol strings (no scripts/HTML)
- Limit string lengths (name: 100 chars, symbol: 20 chars)
- Validate token ID format for LSP8

### 3. Address Validation
- Maintain existing Ethereum address validation
- Checksum addresses consistently
- Verify contract existence on LUKSO network

## Testing Strategy

### 1. Unit Tests
- Marketplace URL generation functions
- Manual metadata validation logic
- CSV parsing with new columns
- Type interface compatibility

### 2. Integration Tests  
- Configurator form behavior with/without GraphQL data
- Marketplace link display in requirements components
- CSV upload with marketplace URLs
- Follow button functionality

### 3. User Testing Scenarios
- Configure old token with no GraphQL metadata
- Edit marketplace URL for token requirement
- Upload CSV with marketplace URL column
- View marketplace links for unmet requirements
- Use follow button for social requirements

## Key Questions Answered Through Research

1. ✅ **Metadata Fallback Strategy**: Show all fetched data beautifully, allow manual entry where missing (especially decimals)
2. ✅ **Follow Mechanism**: Extend existing `lsp26.ts` with transaction capabilities using `UniversalProfileContext`  
3. ✅ **LSP8 Marketplace**: Universal.page + UniversalEverything with comprehensive token ID handling
4. ✅ **CSV Support**: 6th column optional, backward compatible with existing 5-column format
5. ✅ **Wallet Integration**: Use existing `UniversalProfileContext` transaction patterns

## Remaining Questions for Final Confirmation

1. **ERC725Y Follow Data Keys**: Need to confirm exact LSP26 data key format for follow/unfollow transactions
2. **UI/UX Preferences**: 
   - Should manual metadata be visually distinguished or blend seamlessly?
   - Where should marketplace links appear (buttons, inline links, etc.)?
3. **Follow Button Security**: Should follow transactions require additional confirmation beyond wallet signature?
4. **Marketplace URL Validation**: Restrict to known domains or allow any HTTPS URL?

## Ready for Implementation

**Phase 1 (Marketplace Utility)** is fully specified and ready to implement:
- LSP7: UniversalSwaps integration 
- LSP8: Universal.page + token ID formatting
- Comprehensive URL generation with all edge cases covered
- Based on your provided marketplace documentation

**Phase 2 (Follow Utility)** needs minor research clarification:
- Confirm LSP26 ERC725Y data key format
- Transaction flow is well-understood from existing patterns

**Phase 3+ (UI Integration)** is well-planned:
- Type extensions are straightforward
- UI patterns follow existing configurator structure
- Display integration builds on current requirements system

## Recommended Next Steps

1. **Start with Phase 1** (Marketplace utility) - most foundational and fully specified
2. **Research LSP26 data keys** for follow transactions (web search + LUKSO docs)
3. **Implement in small iterations** with your feedback at each step
4. **Build utility first, then integrate** into UI components progressively

The plan is comprehensive, well-researched, and ready for iterative implementation with your guidance! 🚀
