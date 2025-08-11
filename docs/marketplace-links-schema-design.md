# Marketplace Links Schema Design & Backwards Compatibility

## 📋 Current Schema Analysis

### Database Storage
- **Table**: `locks` with `gating_config` as `JSONB` column
- **No database migration needed** - JSONB is flexible and can accommodate new fields
- Lock configurations are stored as complete JSON objects in `gating_config`

### Current TypeScript Interfaces

#### TokenRequirement (gating.ts & settings.ts)
```typescript
interface TokenRequirement {
  contractAddress: string;
  tokenType: 'LSP7' | 'LSP8';
  name?: string;
  symbol?: string;
  minAmount?: string;     // For LSP7 or LSP8 collection count
  tokenId?: string;       // For specific LSP8 NFT
  decimals?: number;      // Token decimals (LSP7 only)
}
```

#### GatingRequirement (locks.ts)
```typescript
interface GatingRequirement {
  id: string;
  type: RequirementType;
  category: RequirementCategory;
  config: RequirementConfig;  // Contains TokenRequirement for token gates
  isValid: boolean;
  displayName: string;
}
```

## 🎯 Proposed Schema Changes

### 1. Extended TokenRequirement Interface

```typescript
interface TokenRequirement {
  // Existing fields (unchanged)
  contractAddress: string;
  tokenType: 'LSP7' | 'LSP8';
  name?: string;
  symbol?: string;
  minAmount?: string;
  tokenId?: string;
  decimals?: number;

  // NEW: Marketplace links field
  marketplaceLinks?: TokenMarketplaceLinks;
  
  // NEW: Manual metadata override fields
  manualMetadata?: {
    name?: string;
    symbol?: string;
    decimals?: number;
  };
}
```

### 2. TokenMarketplaceLinks Interface

```typescript
interface TokenMarketplaceLinks {
  primary: string;        // Main acquisition URL
  trade?: string;         // UniversalSwaps trade (LSP7)
  info?: string;          // UniversalSwaps analytics (LSP7)
  collection?: string;    // Universal.page collection (LSP8)
  item?: string;          // Universal.page item (LSP8)
  viewer?: string;        // UniversalEverything viewer (LSP8)
  custom?: string;        // User-provided custom URL
}
```

## 🔄 Backwards Compatibility Strategy

### ✅ Fully Backwards Compatible - No Breaking Changes

#### 1. **All New Fields Are Optional**
- `marketplaceLinks?: TokenMarketplaceLinks` - completely optional
- `manualMetadata?: { ... }` - completely optional
- Existing locks continue to work unchanged

#### 2. **Progressive Enhancement Pattern**
- **Old locks**: Function exactly as before, no marketplace links shown
- **New locks**: Get marketplace links auto-generated during creation
- **Edited locks**: Get marketplace links added when edited/saved

#### 3. **Runtime Generation Fallback**
```typescript
// If marketplaceLinks not stored, generate on-demand
function getTokenMarketplaceLinks(requirement: TokenRequirement): TokenMarketplaceLinks {
  if (requirement.marketplaceLinks) {
    return requirement.marketplaceLinks; // Use stored links
  }
  
  // Fallback: Generate links on-demand from utility
  return generateMarketplaceLinks({
    standard: requirement.tokenType,
    address: requirement.contractAddress,
    tokenId: requirement.tokenId
  });
}
```

### 📦 Database Migration Strategy

#### ✅ **No Database Migration Required**
- JSONB column accommodates new fields automatically
- Existing JSON structures remain valid
- New fields added organically when locks are created/edited

#### 🔄 **Optional Data Backfill Migration** (Future)
```sql
-- Example: Backfill marketplace links for existing locks
-- (This would be a future enhancement, not required for launch)

UPDATE locks 
SET gating_config = jsonb_set(
  gating_config,
  '{categories,0,requirements,requiredTokens,0,marketplaceLinks}',
  '{"primary": "https://universalswaps.io/tokens/lukso/ADDRESS"}'
)
WHERE gating_config->'categories'->0->'requirements'->'requiredTokens'->0->>'tokenType' = 'LSP7'
  AND gating_config->'categories'->0->'requirements'->'requiredTokens'->0->'marketplaceLinks' IS NULL;
```

## 🎨 UI Backwards Compatibility

### Current Display Logic (No Changes Needed)
```typescript
// RequirementCard.tsx - EXISTING code unchanged
const tokenName = requirement.config.name || 'Unknown Token';
const tokenSymbol = requirement.config.symbol || 'UNK';
const tokenDecimals = requirement.config.decimals;
```

### Enhanced Display Logic (New Additions)
```typescript
// RequirementCard.tsx - NEW optional enhancements
function RequirementCard({ requirement }) {
  const marketplaceLinks = getTokenMarketplaceLinks(requirement.config);
  
  return (
    <div>
      {/* Existing display logic unchanged */}
      <TokenDisplay requirement={requirement.config} />
      
      {/* NEW: Optional marketplace link */}
      {marketplaceLinks?.primary && (
        <MarketplaceLink url={marketplaceLinks.primary} />
      )}
    </div>
  );
}
```

## 🚀 Implementation Phases

### Phase 1: Foundation (✅ COMPLETE)
- ✅ Marketplace utility created and tested
- ✅ No database changes needed

### Phase 2: Type System (NEXT)
- Add optional fields to `TokenRequirement` interface
- Create `TokenMarketplaceLinks` interface
- Update all imports across codebase

### Phase 3: UI Integration
- Add marketplace links to configurators (LSP7/LSP8)
- Add manual metadata override UI
- Integrate with lock creation/editing flow

### Phase 4: Display Enhancement
- Add marketplace links to RequirementCard
- Add marketplace links to RichRequirementsDisplay
- Add marketplace links to CSV import flow

## 🛡️ Risk Mitigation

### Zero Breaking Changes
- **Existing locks**: Continue working unchanged
- **Existing APIs**: No changes to request/response formats
- **Existing UI**: Graceful degradation (no links shown if not present)

### Graceful Degradation
```typescript
// All new features have fallbacks
const marketplaceUrl = requirement.marketplaceLinks?.primary 
  ?? generatePrimaryMarketplaceUrl(requirement)
  ?? undefined; // Show nothing if generation fails

const displayName = requirement.manualMetadata?.name
  ?? requirement.name
  ?? 'Unknown Token'; // Existing fallback chain
```

### Future-Proofing
- Optional marketplace link types (trade, info, collection, etc.)
- Extensible manual metadata structure
- Custom marketplace URL support

## 📊 Storage Impact

### Minimal Storage Overhead
- **Empty new locks**: ~0 bytes overhead (fields omitted when undefined)
- **Populated marketplace links**: ~200-400 bytes per token requirement
- **Manual metadata**: ~50-150 bytes per token requirement

### Example Storage Comparison
```json
// BEFORE (current)
{
  "contractAddress": "0xf76253...",
  "tokenType": "LSP7",
  "name": "Fish",
  "symbol": "FISH",
  "decimals": 18,
  "minAmount": "1000000000000000"
}

// AFTER (with marketplace links)
{
  "contractAddress": "0xf76253...",
  "tokenType": "LSP7", 
  "name": "Fish",
  "symbol": "FISH",
  "decimals": 18,
  "minAmount": "1000000000000000",
  "marketplaceLinks": {
    "primary": "https://universalswaps.io/tokens/lukso/0xf76253...",
    "trade": "https://universalswaps.io/tokens/lukso/0xf76253...",
    "info": "https://info.universalswaps.io/#/tokens/0xf76253..."
  }
}
```

## ✅ Validation Strategy

### Type Safety
- All new fields optional with proper TypeScript types
- Runtime validation for marketplace URLs
- Existing validation logic unchanged

### Testing
- Unit tests for new utility functions
- Integration tests for lock creation/editing
- Backwards compatibility tests for existing locks

### Rollout Plan
1. **Silent deployment**: Add new fields, no UI changes
2. **Progressive enhancement**: Enable marketplace links in configurators
3. **Full feature**: Add manual metadata override UI
4. **Optional backfill**: Generate links for existing locks (future)

## 🎯 Summary

**✅ Zero breaking changes** - All new features are additive and optional
**✅ No database migration** - JSONB handles new fields automatically  
**✅ Graceful degradation** - Existing locks work unchanged
**✅ Progressive enhancement** - New locks get enhanced features
**✅ Future-proofing** - Extensible design for additional marketplace integrations

This design ensures a smooth, risk-free integration of marketplace links while maintaining full backwards compatibility with existing lock configurations.
