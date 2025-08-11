# CSV Upload Lock Creation Feature Specification

## Overview

This document specifies a new feature allowing users to create locks with many gating conditions by uploading CSV files instead of manually configuring each requirement through the UI.

## Current Lock Gating Structure Analysis

### Existing Gating Config Format
```json
{
  "categories": [
    {
      "type": "universal_profile",
      "enabled": true,
      "fulfillment": "any", // or "all"
      "requirements": {
        "requiredTokens": [
          {
            "name": "LUKSO OG NFT",
            "symbol": "LYXOG", 
            "decimals": 0,
            "minAmount": "1",
            "tokenType": "LSP7",
            "contractAddress": "0xb2894bfdac8d21c2098196b2707c738f5533e0a8"
          }
        ],
        "followerRequirements": [
          {
            "type": "minimum_followers",
            "value": "100"
          },
          {
            "type": "following",
            "value": "0x4945bD66B3FaA4726F8c88A0553753F701A1F5F7"
          }
        ]
      }
    },
    {
      "type": "ethereum_profile",
      "enabled": true,
      "fulfillment": "any",
      "requirements": {
        "requiredTokens": [
          {
            "contractAddress": "0x...",
            "tokenType": "ERC20",
            "minAmount": "1000000000000000000",
            "decimals": 18
          }
        ],
        "followerRequirements": []
      }
    }
  ],
  "requireAll": false
}
```

### Current Requirement Types
1. **Universal Profile Requirements**:
   - LSP7 tokens (fungible/non-divisible)
   - LSP8 NFTs (specific token IDs or collection counts)
   - LYX balance minimums
   - Follower count minimums
   - Must follow specific profiles
   - Must be followed by specific profiles

2. **Ethereum Profile Requirements**:
   - ERC20 token balances
   - ERC721 NFT ownership
   - ERC1155 token balances
   - ETH balance minimums
   - EFP (Ethereum Follow Protocol) requirements

## Feature Requirements

### User Stories

**As a community admin**, I want to:
- Upload a CSV with 100+ token contracts to create a lock allowing holders of ANY of those tokens
- Upload a CSV with specific LSP8 token IDs to create an exclusive NFT holder lock
- Upload a CSV with Universal Profile addresses for follower requirements
- Validate my CSV before creating the lock to catch errors early
- Preview the generated lock configuration before saving

**As a power user**, I want to:
- Mix different requirement types in one CSV (tokens + followers + balances)
- Specify different fulfillment modes (any vs all) per category
- Include metadata (names, symbols) to override auto-detection
- Download a template CSV to understand the expected format

### Core Functionality

#### 1. CSV Upload Interface
- **Location**: New tab/step in `LockCreationModal.tsx` 
- **Options**: "Manual Configuration" vs "CSV Upload"
- **File validation**: CSV format, size limits, column validation
- **Live preview**: Show parsed requirements as user uploads

#### 2. CSV Format Support

**Proposed CSV Columns**:
```csv
ecosystem,requirement_type,contract_address,token_type,min_amount,decimals,token_id,name,symbol,profile_address,follower_type,follower_value,fulfillment
universal_profile,token,0xb2894bfdac8d21c2098196b2707c738f5533e0a8,LSP7,1,0,,LUKSO OG NFT,LYXOG,,,any
universal_profile,token,0xeea8420360d5e2ec7990d880515b88eb015a4e32,LSP7,1,0,,DRIZZLE,DRIZ,,,any
universal_profile,token,0x544051588d6a0713e164196c16024fdcff877540,LSP8,1,0,123,Pigmint,PIG,,,any
universal_profile,follower,,,,,,,0x4945bD66B3FaA4726F8c88A0553753F701A1F5F7,following,,any
universal_profile,follower,,,,,,,,minimum_followers,100,any
ethereum_profile,token,0xa0b86a33e6b58c6c3f6b6a0b86a33e6b58c6c3f6,ERC20,1000000000000000000,18,,USDC,USDC,,,all
```

#### 3. CSV Processing Pipeline

**Step 1: File Upload & Validation**
- File size limits (e.g., 10MB max)
- CSV format validation
- Column header validation
- Row count limits (e.g., 1000 requirements max)

**Step 2: Data Parsing & Transformation**
```typescript
interface CSVRow {
  ecosystem: 'universal_profile' | 'ethereum_profile';
  requirement_type: 'token' | 'follower' | 'balance';
  contract_address?: string;
  token_type?: 'LSP7' | 'LSP8' | 'ERC20' | 'ERC721' | 'ERC1155';
  min_amount?: string;
  decimals?: number;
  token_id?: string;
  name?: string;
  symbol?: string;
  profile_address?: string;
  follower_type?: 'minimum_followers' | 'following' | 'followed_by';
  follower_value?: string;
  fulfillment: 'any' | 'all';
}
```

**Step 3: Metadata Enrichment**
- Auto-fetch missing token metadata (names, symbols, decimals)
- Validate contract addresses exist and are correct type
- Cache results to avoid duplicate API calls

**Step 4: Gating Config Generation**
- Group requirements by ecosystem and fulfillment mode
- Convert to standard `gatingConfig` format
- Merge with any existing manual requirements

#### 4. Validation & Error Handling

**CSV Validation Rules**:
- Required fields per requirement type
- Valid contract address format (0x + 40 hex chars)
- Numeric validation for amounts, decimals, token IDs
- Ecosystem compatibility (LSP7/LSP8 only for universal_profile)
- Token type validation (LSP7 requires minAmount, LSP8 can use tokenId)

**Error Reporting**:
- Line-by-line error messages
- Invalid contract address detection
- Duplicate requirement detection
- Conflicting fulfillment modes within same ecosystem

**Progressive Enhancement**:
- Show warnings for missing metadata that will be auto-fetched
- Suggest corrections for common mistakes
- Validate token contracts exist on-chain

## Technical Implementation

### New Components

#### `src/components/locks/csv/CSVUploadStep.tsx`
**Responsibilities**:
- File upload interface with drag & drop
- CSV parsing and validation
- Live preview of parsed requirements
- Error display and correction interface

#### `src/components/locks/csv/CSVTemplateDownload.tsx`
**Responsibilities**:
- Generate and download template CSV files
- Multiple templates for different use cases
- Example data for common scenarios

#### `src/components/locks/csv/CSVPreviewTable.tsx`
**Responsibilities**:
- Tabular display of parsed CSV data
- Error highlighting and tooltips
- Edit-in-place for quick corrections
- Metadata status indicators (fetched/missing/error)

### Utility Functions

#### `src/lib/csv/csvParser.ts`
```typescript
export interface CSVParseResult {
  success: boolean;
  data: CSVRow[];
  errors: CSVError[];
  warnings: CSVWarning[];
}

export interface CSVError {
  row: number;
  column: string;
  message: string;
  severity: 'error' | 'warning';
}

export const parseCSV = (csvContent: string): CSVParseResult;
export const validateCSVRow = (row: CSVRow, rowIndex: number): CSVError[];
export const enrichWithMetadata = (rows: CSVRow[]): Promise<EnrichedCSVRow[]>;
```

#### `src/lib/csv/csvToGatingConfig.ts`
```typescript
export const convertCSVToGatingConfig = (
  enrichedRows: EnrichedCSVRow[]
): GatingConfig;

export const groupByEcosystemAndFulfillment = (
  rows: EnrichedCSVRow[]
): GroupedRequirements;
```

### Integration Points - UPDATED PLAN

#### Lock Creation Modal Integration Strategy

**Current Lock Creation Flow**:
1. **"Template & Info"** - Basic lock details and starting point selection
2. **"Requirements"** - Manual requirement configuration
3. **"Preview"** - Final review before creation

**NEW Integrated Flow with CSV Upload**:

#### Step 1: "Template & Info" Screen
**Location**: `src/components/locks/LockCreationModal.tsx`
**New Elements**:
- Add "Upload CSV" button alongside existing template options
- Button triggers transition to dedicated CSV upload screen

#### Step 2A: "CSV Upload" Screen (NEW)
**Location**: `src/components/locks/csv/CSVUploadScreen.tsx`
**Responsibilities**:
- File picker with drag & drop interface
- CSV parsing and validation with PapaParse
- Error correction and metadata enrichment
- Preview parsed requirements in table format
- "Continue" button → Navigate back to Requirements screen

#### Step 2B: "Requirements" Screen (ENHANCED)
**Location**: Existing `RequirementsStep` in `LockCreationModal.tsx`
**Enhanced Functionality**:
- Show CSV-imported requirements as if manually added
- Allow mixing CSV + manual requirements
- "Upload CSV" button available for additional imports
- Standard requirement editing/deletion capabilities

#### Step 3: "Preview" Screen (UNCHANGED)
**Location**: Existing preview logic
**Behavior**: Works identically with CSV-imported requirements

#### Navigation Flow

```
Template & Info Screen
├─ "Upload CSV" → CSV Upload Screen → Requirements Screen
└─ "Start Manual" → Requirements Screen

Requirements Screen  
├─ "Upload CSV" → CSV Upload Screen → (back to Requirements)
├─ "Add Manual" → Manual configurators
└─ "Continue" → Preview Screen
```

#### Modified Components

**`src/components/locks/LockCreationModal.tsx`**:
- Add CSV upload button to template selection screen
- Add navigation logic to CSV upload screen
- Enhanced stepper to show CSV upload when used
- Merge CSV requirements into existing `LockBuilderState`

**`src/components/locks/LockBuilderProvider.tsx`**:
- Extend `LockBuilderState` to include:
  ```typescript
  interface LockBuilderState {
    // ... existing fields
    csvImportedRequirements: GatingRequirement[];
    csvUploadStatus: 'idle' | 'uploading' | 'parsing' | 'success' | 'error';
    csvErrors: CSVError[];
  }
  ```

**`src/types/locks.ts`**:
- Add CSV-related state types
- Ensure compatibility with existing requirement interfaces

#### CSV Upload Screen Component

**`src/components/locks/csv/CSVUploadScreen.tsx`**:
```typescript
interface CSVUploadScreenProps {
  onRequirementsImported: (requirements: GatingRequirement[]) => void;
  onCancel: () => void;
  existingRequirements: GatingRequirement[];
}
```

**Features**:
- PapaParse integration for file processing
- Real-time validation with error highlighting
- Metadata enrichment progress indicators
- Preview table with edit-in-place capabilities
- Smart duplicate detection against existing requirements

### API Considerations

#### Metadata Fetching Optimization
- Batch token metadata requests
- Cache results in Redis/memory for session duration
- Avoid rate limiting with request queuing
- Fallback gracefully when metadata unavailable

#### New API Endpoints (Optional)
```typescript
// POST /api/locks/csv/validate
// Validate CSV data without creating lock
interface CSVValidationRequest {
  csvData: CSVRow[];
}

// POST /api/locks/csv/enrich
// Fetch metadata for CSV requirements
interface CSVEnrichRequest {
  tokenAddresses: string[];
  profileAddresses: string[];
}
```

## User Experience Design

### CSV Upload Flow

1. **Upload Step**
   - Drag & drop or file picker
   - Immediate format validation
   - Loading spinner during parsing

2. **Review & Edit Step**
   - Table view with sortable columns
   - Inline editing for corrections
   - Error highlighting with helpful messages
   - Metadata fetching progress indicators

3. **Preview Step**
   - Generated lock configuration preview
   - "Required vs You have" simulation
   - Final validation before creation

### Template System

**Suggested Templates**:
1. **Token Allowlist**: Simple list of contract addresses
2. **NFT Collection**: LSP8 tokens with specific IDs
3. **Multi-Token Gate**: Mixed LSP7/LSP8 requirements
4. **Social Requirements**: Follower-based gating
5. **Cross-Chain**: Universal Profile + Ethereum requirements

### Error Prevention

**Smart Defaults**:
- Auto-detect token type from contract
- Default fulfillment to "any" for token lists
- Auto-populate decimals from contract
- Suggest names/symbols from metadata

**Validation Helpers**:
- Real-time contract address validation
- Token type compatibility checks
- Duplicate detection with merge suggestions
- Import from existing locks

## Edge Cases & Considerations

### CSV Format Variations
- Handle different CSV dialects (comma vs semicolon)
- Support Excel exports with BOM
- Graceful handling of empty rows/columns
- Unicode support for international characters

### Large File Handling
- Streaming parsing for large files
- Progressive metadata fetching
- UI responsiveness during processing
- Memory optimization for 1000+ requirements

### Network Dependencies
- Offline validation where possible
- Graceful degradation when RPC unavailable
- Retry logic for metadata fetching
- Fallback to manual entry when auto-fetch fails

### Data Integrity
- Prevent CSV injection attacks
- Validate all user input thoroughly
- Sanitize contract addresses
- Rate limit metadata requests

## Migration & Backward Compatibility

### Existing Lock Export
- Add CSV export functionality to existing locks
- Allow users to download lock config as CSV
- Support editing existing locks via CSV re-upload

### Template Generation
- Generate CSV templates from popular existing locks
- Community template sharing
- Import from other platforms (e.g., Guild.xyz exports)

## Success Metrics

### Adoption Metrics
- Percentage of locks created via CSV vs manual
- Average number of requirements per CSV lock
- CSV upload success rate vs abandonment

### Performance Metrics
- CSV parsing time for different file sizes
- Metadata fetching completion rate
- Time to create lock from CSV upload start

### Quality Metrics
- Error rate in CSV uploads
- User correction rate after initial upload
- Lock functionality success rate (CSV vs manual)

## Future Enhancements

### Advanced Features
- **Bulk Operations**: Update multiple existing locks via CSV
- **Conditional Logic**: "If LSP7 balance > X, then require LSP8"
- **Time-based Requirements**: "Must hold token for 30 days"
- **Dynamic Amounts**: "Require 1% of total supply"

### Integration Opportunities
- **External APIs**: Import from OpenSea, LooksRare collections
- **Governance Tools**: Import DAO member lists
- **DeFi Protocols**: Import liquidity provider lists
- **Social Platforms**: Import Twitter/Farcaster follower lists

### Automation
- **Scheduled Updates**: Automatically update locks from CSV URLs
- **Smart Contracts**: On-chain CSV storage and updates
- **IPFS Integration**: Decentralized CSV storage

## Implementation Steps - READY TO CODE

### Phase 1: Core Integration (IMMEDIATE - 1-2 days)

#### Step 1: Examine Current Lock Creation Modal
**File**: `src/components/locks/LockCreationModal.tsx`
- Understand current stepper implementation
- Identify where to add "Upload CSV" buttons
- Map current `LockBuilderState` structure

#### Step 2: Create CSV Processing Utilities
**Files to Create**:
```
src/lib/csv/
├── csvParser.ts          # PapaParse integration + validation
├── csvToRequirements.ts  # Convert CSV → GatingRequirement[]
└── csvTemplates.ts       # Template generation and download
```

#### Step 3: Build CSV Upload Screen Component
**File**: `src/components/locks/csv/CSVUploadScreen.tsx`
- File picker with drag & drop (use existing UI patterns)
- PapaParse integration for parsing
- Validation and error display
- Metadata enrichment with progress indicators
- Requirements preview table

#### Step 4: Extend LockBuilderState
**File**: `src/types/locks.ts`
- Add CSV-related fields to `LockBuilderState`
- Ensure type compatibility with existing system

#### Step 5: Integrate with Lock Creation Modal
**File**: `src/components/locks/LockCreationModal.tsx`
- Add "Upload CSV" button to template screen
- Add navigation to CSV upload screen
- Merge CSV requirements into existing requirements list
- Update stepper UI to reflect CSV usage

### Phase 2: Enhanced Features (NEXT - 2-3 days)
- Advanced error correction interface
- Template download system
- Follower requirements support  
- Duplicate detection and merging

### Phase 3: Advanced Features (FUTURE - 1 week)
- Export existing locks to CSV
- Bulk editing capabilities
- Community template sharing

## Technical Implementation Plan

### 1. CSV Processing Pipeline
```typescript
// Flow: File Upload → Parse → Validate → Enrich → Convert → Merge
File → Papa.parse() → validateCSVData() → enrichWithMetadata() → csvToRequirements() → mergeWithExisting()
```

### 2. State Management Integration
```typescript
// Extend existing LockBuilderContext
const { requirements, addRequirements, csvImportedRequirements } = useLockBuilder();

// CSV upload flow
const handleCSVImport = (csvRequirements: GatingRequirement[]) => {
  addRequirements(csvRequirements);
  navigateToRequirementsScreen();
};
```

### 3. UI/UX Integration Points
- **Template Screen**: Add CSV upload option alongside existing templates
- **Requirements Screen**: Show imported requirements as if manually added
- **CSV Upload Screen**: Full-screen modal overlay with file processing
- **Navigation**: Seamless transitions between screens

### 4. Validation Strategy
```typescript
// Progressive validation approach
1. File format validation (CSV structure)
2. Column validation (required fields present)
3. Data type validation (addresses, numbers)
4. Business logic validation (token types, ecosystems)
5. Metadata enrichment (auto-fetch names, symbols, decimals)
6. Duplicate detection (against existing requirements)
```

### 5. Error Handling & UX
- **Real-time validation**: Show errors as user uploads
- **Batch error display**: Line-by-line error reporting
- **Error correction**: Inline editing capabilities
- **Progressive enhancement**: Continue with warnings, block on errors
- **Recovery**: Allow re-upload or manual correction

## Ready for Implementation

The plan is now complete with:
✅ **Clear integration strategy** - Fits seamlessly into existing modal flow
✅ **Defined navigation flow** - Template → CSV Upload → Requirements → Preview  
✅ **Component architecture** - Reuses existing patterns and state management
✅ **Technical specifications** - PapaParse integration with robust validation
✅ **UX considerations** - Progressive enhancement and error handling

**NEXT STEP**: Examine `LockCreationModal.tsx` to understand current implementation and identify exact integration points.

## Technical Risks & Mitigation

### Risk: Performance with Large CSVs
**Mitigation**: 
- Implement streaming parsing
- Add progress indicators
- Set reasonable file size limits
- Optimize metadata fetching with batching

### Risk: Metadata Fetching Failures
**Mitigation**:
- Graceful fallbacks to manual entry
- Cache successful fetches
- Retry logic with exponential backoff
- Clear error messages with suggested fixes

### Risk: User Error in CSV Format
**Mitigation**:
- Comprehensive template system
- Real-time validation with helpful messages
- Import from common formats (Excel, Google Sheets)
- Progressive disclosure of advanced options

### Risk: Security Vulnerabilities
**Mitigation**:
- Thorough input validation and sanitization
- File size and content limits
- Rate limiting on metadata requests
- No server-side code execution from CSV content

---

## Summary & Recommendations

The CSV upload feature addresses a clear need for bulk lock creation while leveraging the existing robust gating infrastructure. The proposed implementation:

1. **Builds on existing patterns** - Uses current lock creation flow and gating config format
2. **Maintains type safety** - Validates all CSV data against existing interfaces
3. **Provides excellent UX** - Progressive validation, templates, and error correction
4. **Scales efficiently** - Handles large files with streaming and batching
5. **Prevents common errors** - Smart defaults and real-time validation

**Recommended next steps**:
1. Create basic CSV parsing prototype
2. Design template formats with user research
3. Implement core upload flow in existing modal
4. Add metadata enrichment and validation
5. Beta test with power users who need bulk creation

This feature would significantly reduce friction for community administrators creating complex gating rules while maintaining the robustness and reliability of the current system.
