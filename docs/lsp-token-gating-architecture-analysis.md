# LSP Token Gating Architecture Analysis

## Overview

This document provides a comprehensive analysis of the LSP7/LSP8 token gating system in curia-cg, documenting all components involved in displaying and verifying lock gating conditions, their responsibilities, weaknesses, and patterns of reuse.

## Frontend Display Components

### Lock Display & Preview

#### `src/components/locks/LockPreviewModal.tsx`
**Responsibilities:**
- Displays lock gating conditions in preview mode
- Shows requirements and user verification status
- Provides UI for connecting Universal Profiles

**Main Weaknesses:**
- Removed edit functionality during refactoring (may have broken some flows)
- Relies heavily on external verification hooks for data

#### `src/components/locks/GatingRequirementsPreview.tsx`
**Responsibilities:**
- Renders overall gating requirements in lock preview
- Handles different gating categories (UP, Ethereum)
- Provides "Connect" buttons for each ecosystem

**Main Weaknesses:**
- Complex conditional rendering logic
- Tight coupling with multiple verification contexts

#### `src/components/gating/RichRequirementsDisplay.tsx` ⚠️ **CRITICAL COMPONENT**
**Responsibilities:**
- Core component for "Required vs You have" token display
- Handles LSP7/LSP8 token formatting with decimals
- Real-time verification status display
- Smart decimal detection for small amounts

**Main Weaknesses:**
- **MAJOR SOURCE OF BUGS**: Complex decimal handling logic
- Multiple fallback chains for token metadata
- Inconsistent prioritization between `tokenReq.decimals`, `tokenData.decimals`, and fallback 18
- Heavy console logging (should be removed in production)
- Mixed responsibilities (display + data transformation)

**Recent Fixes Applied:**
```typescript
// Prioritizes stored requirement decimals over metadata
const actualDecimals = (tokenReq as any).decimals ?? tokenData?.decimals ?? 18;
```

#### `src/components/gating/UniversalProfileGatingPanel.tsx`
**Responsibilities:**
- Wrapper for Universal Profile specific gating logic
- Renders `RichRequirementsDisplay` with UP context
- Handles UP connection/disconnection

**Main Weaknesses:**
- Simple wrapper, but critical in the data flow
- Passes verification status from hooks to display components

### Lock Creation & Editing

#### `src/components/locks/LockCreationModal.tsx`
**Responsibilities:**
- Multi-step lock creation flow
- Converts frontend requirements to backend `gatingConfig`
- Handles preview before saving

**Main Weaknesses:**
- **BUG SOURCE**: Complex conversion logic between frontend and backend formats
- Must ensure `decimals` field is preserved in conversions
- Heavy component with multiple responsibilities

**Critical Functions:**
```typescript
convertRequirementsToGatingConfig() // Frontend → Backend
handleSave() // Must include decimals field
```

#### `src/components/locks/LockEditModal.tsx`
**Responsibilities:**
- Editing existing locks using same flow as creation
- Converts backend `gatingConfig` to frontend requirements
- Reuses `RequirementsStep` from creation modal

**Main Weaknesses:**
- **BUG SOURCE**: Bidirectional conversion logic
- Must ensure all properties (`category`, `isValid`, `displayName`) are included
- Accessibility issues (DialogTitle requirements)

**Critical Functions:**
```typescript
convertGatingConfigToRequirements() // Backend → Frontend
convertBuilderStateToGatingConfig() // Frontend → Backend
```

#### `src/components/locks/RequirementsList.tsx`
**Responsibilities:**
- Displays list of requirements in creation/editing flow
- Fetches rich metadata for display using hooks
- Renders individual `RequirementCard` components

**Main Weaknesses:**
- Heavy metadata fetching logic
- Type casting to `any` for union type properties
- Depends on multiple hooks for metadata

#### `src/components/locks/RequirementCard.tsx`
**Responsibilities:**
- Beautiful display of individual gating requirements
- Shows token icons, names, amounts with proper formatting
- Handles different requirement types (LSP7, LSP8, social)

**Main Weaknesses:**
- Type casting for union types
- Property name mismatches (e.g., `profileImage` vs `profilePictureUrl`)

### Token Configuration

#### `src/components/locks/configurators/LSP7TokenConfigurator.tsx`
**Responsibilities:**
- LSP7 token configuration in lock creation
- Fetches token metadata on-demand
- Converts user input to wei amounts using correct decimals

**Main Weaknesses:**
- **BUG SOURCE**: Must use `actualDecimals` from contract, not display decimals
- Complex token classification and metadata fetching
- Error handling for invalid contracts

**Critical Logic:**
```typescript
const weiAmount = parseTokenAmount(tokenAmount, actualDecimals);
```

#### `src/components/locks/configurators/LSP8NFTConfigurator.tsx`
**Responsibilities:**
- LSP8 NFT configuration in lock creation
- Handles both specific token IDs and collection counts

**Main Weaknesses:**
- Different logic paths for specific vs collection requirements
- Token existence validation

## Frontend Verification Hooks

### Core Verification Logic

#### `src/hooks/gating/up/useUPRequirementVerification.ts` ⚠️ **CRITICAL HOOK**
**Responsibilities:**
- Aggregates verification statuses from child hooks
- Transforms token data for display components
- Handles decimal formatting for "You have" display

**Main Weaknesses:**
- **MAJOR BUG SOURCE**: Decimal formatting fallback chains
- Complex conditional logic for divisible vs non-divisible tokens
- Recently fixed to prioritize requirement decimals

**Recent Fixes Applied:**
```typescript
const displayDecimals = value.metadata?.displayDecimals ?? value.metadata?.decimals ?? 18;
```

#### `src/hooks/gating/up/useUpTokenVerification.ts` ⚠️ **CRITICAL HOOK**
**Responsibilities:**
- Fetches user token balances from blockchain
- Compares balances against requirements
- Provides enhanced metadata with classification

**Main Weaknesses:**
- **MAJOR BUG SOURCE**: Must use `req.decimals` instead of metadata fallbacks
- Complex multicall logic for batching requests
- Different handling for LSP7 vs LSP8 vs LSP8 collections

**Recent Fixes Applied:**
```typescript
const actualDecimals = req.decimals ?? metadata?.actualDecimals ?? metadata?.decimals ?? 18;
isDivisible: req.decimals === 0 ? false : (metadata.isDivisible ?? (actualDecimals > 0));
```

#### `src/hooks/gating/up/useUpLyxBalance.ts`
**Responsibilities:**
- Fetches LYX balance for Universal Profiles
- Simple wrapper around provider calls

**Main Weaknesses:**
- Basic component, rarely source of issues

#### `src/hooks/gating/up/useUpFollowerVerification.ts`
**Responsibilities:**
- Verifies follower requirements (count, specific follows)
- Handles Universal Profile social graph

**Main Weaknesses:**
- API rate limiting concerns
- Complex follower counting logic

### Token Metadata Hooks

#### `src/hooks/useUPTokenMetadata.ts` ⚠️ **FREQUENTLY REUSED**
**Responsibilities:**
- Fetches LSP7/LSP8 token metadata (names, symbols, icons, decimals)
- Caches results using React Query
- Handles batch requests efficiently

**Main Weaknesses:**
- **REUSE PATTERN**: Used in multiple components, potential for inconsistent results
- Network failure handling
- Cache invalidation strategy

#### `src/hooks/useUPSocialProfiles.ts` ⚠️ **FREQUENTLY REUSED**
**Responsibilities:**
- Fetches Universal Profile social metadata
- Profile pictures, usernames, display names
- Caches results using React Query

**Main Weaknesses:**
- **REUSE PATTERN**: Used in multiple components
- Profile data structure changes over time

## Context Providers

#### `src/contexts/UniversalProfileContext.tsx` ⚠️ **CRITICAL CONTEXT**
**Responsibilities:**
- Universal Profile connection management
- Token balance fetching (`getTokenBalances`, `getEnhancedTokenBalances`)
- Metadata fetching with ERC725Y fallbacks

**Main Weaknesses:**
- **MAJOR BUG SOURCE**: Complex fallback logic when ERC725Y fails
- Two different balance fetching methods with different purposes
- Icon caching logic
- Error handling for unsupported contracts

**Critical Functions:**
```typescript
getTokenBalances() // Metadata only, balance: '0'
getEnhancedTokenBalances() // With classification, but metadata focus
fetchTokenIcon() // With fallback error handling
```

**Recent Fixes Applied:**
- Added robust error handling for ERC725Y failures
- Fallback to direct contract calls for `decimals()`, `name()`, `symbol()`

## Backend Verification

### API Routes

#### `src/app/api/locks/[lockId]/verification-status/route.ts`
**Responsibilities:**
- Backend verification of lock requirements
- Returns pass/fail status for lock access
- Handles Universal Profile and Ethereum verification

**Main Weaknesses:**
- Complex verification logic duplication
- Different from frontend verification (can cause inconsistencies)

#### `src/app/api/locks/[lockId]/verify/[categoryType]/route.ts`
**Responsibilities:**
- Specific category verification endpoints
- Detailed verification results

**Main Weaknesses:**
- Category-specific logic branches

### Backend Verification Logic

#### `src/lib/verification/upVerification.ts` ⚠️ **BACKEND CRITICAL**
**Responsibilities:**
- Server-side Universal Profile verification
- LSP7/LSP8 balance checking with proper decimals
- Follower requirement verification

**Main Weaknesses:**
- **BUG SOURCE**: Must stay in sync with frontend verification logic
- Decimal handling must match frontend

**Recent Fixes Applied:**
```typescript
const tokenDecimals = requirement.decimals ?? 18; // Use requirement decimals
```

## Token Classification & Utilities

### LSP7 Classification

#### `src/lib/lukso/lsp7Classification.ts` ⚠️ **CRITICAL UTILITY**
**Responsibilities:**
- Robust LSP7 token classification
- Supports both old and new LSP7 interface IDs
- Determines divisibility and token type

**Main Weaknesses:**
- **INTERFACE ID CHANGES**: LUKSO updated interface IDs in March 2024
- Complex fallback logic
- Network-dependent (RPC calls)

**Recent Fixes Applied:**
```typescript
const INTERFACE_ID_LSP7_OLD = '0xb3c4928f'; // Pre-March 2024
const INTERFACE_ID_LSP7_NEW = '0xc52d6008'; // Post-March 2024
```

#### `src/hooks/useTokenClassification.ts`
**Responsibilities:**
- React hook wrapper for `lsp7Classification`
- Handles multiple token classifications
- Caches results

**Main Weaknesses:**
- React Hooks rules compliance (no hooks in loops)
- Complex `useMemo` and `useQueries` logic

### Conversion Utilities

#### `src/lib/requirements/conversions.ts` ⚠️ **CRITICAL UTILITY**
**Responsibilities:**
- Token amount conversions between display and wei formats
- Handles zero decimals for non-divisible tokens

**Main Weaknesses:**
- **BUG SOURCE**: Must handle `decimals: 0` correctly
- Used throughout frontend and backend

**Recent Fixes Applied:**
```typescript
export const formatTokenAmount = (amount: string, decimals: number = 18): string => {
  if (decimals === 0) {
    return amount; // Return raw amount for non-divisible tokens
  }
  return ethers.utils.formatUnits(amount, decimals);
};
```

## Type Definitions

### Frontend Types

#### `src/types/locks.ts`
**Responsibilities:**
- `LockBuilderState` for creation/editing flow
- `LSP7TokenConfig` with decimals field
- `LockWithStats` with permissions

**Main Weaknesses:**
- Complex nested interfaces
- Must stay in sync with backend types

#### `src/types/gating.ts` & `src/types/settings.ts`
**Responsibilities:**
- `TokenRequirement` interface with decimals field
- Gating requirement types and unions

**Main Weaknesses:**
- **DUPLICATION**: Same interfaces in multiple files
- Union type complexity requires casting

**Recent Fixes Applied:**
```typescript
export interface TokenRequirement {
  // ...
  decimals?: number; // Added for proper formatting
}
```

## Reuse Patterns & Tech Debt

### High-Reuse Components ⚠️ **SOURCES OF BUGS**

1. **`useUPTokenMetadata`** - Used in:
   - `RequirementsList.tsx`
   - `RequirementCard.tsx`
   - Multiple configurators
   - **Risk**: Inconsistent caching, different error handling

2. **`useUPSocialProfiles`** - Used in:
   - `RequirementsList.tsx`
   - `RequirementCard.tsx`
   - Social configurators
   - **Risk**: Profile data structure changes

3. **`RichRequirementsDisplay`** - Core display component
   - Used in multiple gating contexts
   - **Risk**: Changes affect all lock displays

### Code Duplication Issues

1. **Decimal Handling Logic**
   - Duplicated across multiple hooks and components
   - Different fallback chains in different places
   - **Solution**: Centralize in utility functions

2. **Token Metadata Fetching**
   - Similar logic in `UniversalProfileContext` and hooks
   - **Risk**: Inconsistent error handling

3. **Requirement Conversion Logic**
   - Frontend ↔ Backend conversions in multiple places
   - **Risk**: Missing field mappings

### Tech Debt Areas

1. **Type Casting Overuse**
   - Frequent `as any` casts for union types
   - **Risk**: Runtime errors, type safety loss

2. **Complex Fallback Chains**
   - Multiple fallback levels for decimals, metadata
   - **Risk**: Unexpected behavior, hard to debug

3. **Mixed Responsibilities**
   - Components doing both data fetching and display
   - **Risk**: Hard to test, maintain

4. **Inconsistent Error Handling**
   - Different error handling patterns across components
   - **Risk**: Inconsistent user experience

## Critical Bug Patterns

### 1. Decimal Mismatches
**Where**: `useUpTokenVerification.ts`, `RichRequirementsDisplay.tsx`
**Cause**: Using metadata decimals instead of requirement decimals
**Fix Pattern**: Always prioritize `req.decimals` over metadata

### 2. Interface ID Updates
**Where**: `lsp7Classification.ts`
**Cause**: LUKSO interface ID changes break classification
**Fix Pattern**: Support both old and new interface IDs

### 3. ERC725Y Failures
**Where**: `UniversalProfileContext.tsx`
**Cause**: Some contracts don't support ERC725Y interface
**Fix Pattern**: Fallback to direct contract calls

### 4. Conversion Data Loss
**Where**: `LockCreationModal.tsx`, `LockEditModal.tsx`
**Cause**: Missing fields during frontend ↔ backend conversion
**Fix Pattern**: Explicit field mapping with validation

### 5. Type Union Complexity
**Where**: `RequirementCard.tsx`, `RequirementsList.tsx`
**Cause**: Union types require type guards or casting
**Fix Pattern**: Proper type narrowing or safe casting

## Recommendations for Future Development

1. **Centralize Decimal Logic**: Create utility functions for all decimal handling
2. **Improve Type Safety**: Add proper type guards for union types
3. **Standardize Error Handling**: Consistent error patterns across components
4. **Reduce Duplication**: Extract common metadata fetching logic
5. **Add Integration Tests**: Test full token verification flows
6. **Monitor Interface Changes**: Track LUKSO protocol updates
7. **Audit Fallback Chains**: Simplify complex fallback logic
8. **Documentation**: Document decimal handling patterns for developers

## Testing Priority Areas

1. **Non-divisible LSP7 tokens** (decimals: 0)
2. **Interface ID edge cases** (old vs new contracts)
3. **ERC725Y unsupported contracts**
4. **Large number handling** (BigInt edge cases)
5. **Network failure scenarios**
6. **Cache invalidation behaviors**

---

*This document should be updated as new components are added or patterns change.*
