# CSV Upload Feature Roadmap v2.0
## 🚀 **Post-GraphQL Migration Strategy**

### 🎯 **Executive Summary**

With our successful GraphQL migration providing reliable LUKSO token metadata, we can now build a robust CSV upload feature that leverages this infrastructure for automatic metadata enrichment and validation.

## 📊 **Context: What We've Learned**

### ✅ **GraphQL Migration Success**
- **Reliable metadata**: No more "Unknown Token" fallbacks
- **Consistent decimals**: JAN token now correctly shows `decimals: 0` instead of `18`
- **Automatic validation**: Token type detection (LSP7 vs LSP8) works perfectly
- **Performance**: Fast, cached responses from LUKSO indexer

### 🔍 **Current Lock Creation Flow**
```
Step 1: "Template & Info" → Choose template or start from scratch
Step 2: "Requirements" → Configure individual requirements manually  
Step 3: "Preview & Test" → Test gating with wallet connections
Step 4: "Lock Details" → Final metadata and save
```

### 💡 **Key Insight: Perfect Integration Point**
The **Template & Info** step is the ideal place for CSV upload because:
- Users choose their starting point (template vs scratch vs CSV)
- Templates already pre-populate requirements
- CSV can follow the same pattern: pre-populate requirements from file

## 🎨 **Refined User Experience**

### **Template & Info Step (Enhanced)**
```
Choose your starting point:
┌─────────────────┬─────────────────┬─────────────────┐
│   📋 Templates  │  📁 Upload CSV  │  ✨ From Scratch │
│                 │                 │                 │
│ Community       │ Drag & drop     │ Start with      │
│ token lists,    │ your CSV file   │ empty lock      │
│ common patterns │ for bulk import │ and build       │
│                 │                 │ manually        │
└─────────────────┴─────────────────┴─────────────────┘
```

### **CSV Upload Flow**
1. **File Selection**: Drag & drop or browse for CSV
2. **Smart Processing**: Automatic parsing + GraphQL metadata enrichment
3. **Validation & Preview**: Show requirements table with any errors
4. **Integration**: Merge into normal Requirements step
5. **Continue Flow**: Same Preview & Save as manual creation

## 🛠 **Technical Architecture**

### **Why PapaParse Again? YES!**
- **Battle-tested**: Industry standard for CSV parsing in JS
- **Robust**: Handles edge cases, encoding issues, various CSV formats
- **TypeScript support**: Excellent type definitions
- **Performance**: Streaming for large files
- **Features**: Auto-detect delimiters, handle malformed data

**Alternative considered**: Built-in CSV parsing
**Decision**: PapaParse provides too many benefits to reinvent

### **GraphQL Integration Strategy**
```typescript
// CSV Processing Pipeline with GraphQL
File Upload → PapaParse → Address Extraction → GraphQL Batch Query → Merge Data → Validate → Preview
```

**Key Advantage**: We can now fetch metadata for 100+ tokens in a single GraphQL request!

### **Enhanced CSV Format (Simplified)**
```csv
ecosystem,requirement_type,contract_address,min_amount,token_id,fulfillment
universal_profile,lsp7_token,0xb2894bfdac8d21c2098196b2707c738f5533e0a8,1,,any
universal_profile,lsp7_token,0xeea8420360d5e2ec7990d880515b88eb015a4e32,1,,any
universal_profile,lsp8_nft,0x544051588d6a0713e164196c16024fdcff877540,1,123,any
universal_profile,follower,0x4945bD66B3FaA4726F8c88A0553753F701A1F5F7,1,,any
ethereum_profile,erc20_token,0xa0b86a33e6b58c6c3f6b6a0b86a33e6b58c6c3f6,1000000000000000000,,all
```

**Simplified because**: GraphQL auto-fills `name`, `symbol`, `decimals`, `tokenType` - users only need addresses!

## 📋 **Implementation Plan**

### **Phase 1: Core CSV Upload (2-3 days)**

#### **1. Enhance Template Selection Step**
**File**: `src/components/locks/LockCreationModal.tsx`
- Add "Upload CSV" option alongside templates
- New button triggers CSV upload modal overlay

#### **2. Create CSV Processing Utilities**
**Files**:
```
src/lib/csv/
├── csvParser.ts          # PapaParse + validation
├── csvToRequirements.ts  # CSV → GatingRequirement[] with GraphQL
└── csvTemplates.ts       # Download templates
```

**Key Enhancement**: `csvToRequirements.ts` uses our new GraphQL infrastructure:
```typescript
export async function enrichCSVWithGraphQL(
  csvRows: CSVRow[]
): Promise<EnrichedCSVRow[]> {
  // Extract all token addresses
  const tokenAddresses = csvRows
    .filter(row => row.contract_address)
    .map(row => row.contract_address);
  
  // Batch GraphQL query for all tokens
  const { data } = await luksoTokenMetadata(tokenAddresses, {
    includeIcons: true
  });
  
  // Merge GraphQL data with CSV data
  return csvRows.map(row => ({
    ...row,
    metadata: data.tokens[row.contract_address.toLowerCase()]
  }));
}
```

#### **3. Build CSV Upload Modal**
**File**: `src/components/locks/csv/CSVUploadModal.tsx`
- Overlay modal (not new step in stepper)
- File upload with drag & drop
- Real-time parsing and validation
- GraphQL metadata enrichment with progress
- Preview table with edit capabilities
- "Import X Requirements" button

#### **4. Integration Points**
- **Template Step**: Add CSV upload button
- **CSV Modal**: Process file and return requirements
- **Lock Builder**: Merge CSV requirements with existing state
- **Requirements Step**: Show imported requirements normally

### **Phase 2: Enhanced Features (1-2 days)**

#### **Advanced Validation**
- Duplicate detection across CSV and existing requirements
- Smart conflict resolution (merge vs replace)
- Token type validation (LSP7 vs LSP8 vs ERC20/721/1155)

#### **Template System**
- Download CSV templates for common use cases
- Import/export existing locks as CSV
- Community template sharing

#### **Error Handling**
- Line-by-line error reporting
- Smart suggestions for common mistakes
- Fallback to manual entry for failed lookups

### **Phase 3: Polish & Advanced Features (1-2 days)**

#### **UX Enhancements**
- Batch progress indicators
- Undo/redo for CSV imports
- Preview "Required vs You have" before import

#### **Performance Optimizations**
- Streaming parser for large files
- GraphQL request batching and caching
- Memory management for 1000+ requirements

## 🎯 **Why This Approach is Superior**

### **Leverages GraphQL Success**
✅ **Reliable metadata**: No more "Unknown Token" issues  
✅ **Batch efficiency**: Query 100+ tokens in single request  
✅ **Consistent data**: Same source as manual configurators  
✅ **Auto-validation**: Token type detection built-in  

### **Seamless Integration**
✅ **Familiar patterns**: Uses existing Template selection paradigm  
✅ **Non-disruptive**: Optional feature that enhances current flow  
✅ **Consistent UX**: Imported requirements look identical to manual ones  
✅ **Maintainable**: Reuses existing state management and validation  

### **Simplified for Users**
✅ **Minimal CSV columns**: Only addresses + amounts needed  
✅ **Auto-enrichment**: Names, symbols, decimals filled automatically  
✅ **Smart defaults**: Sensible fulfillment and ecosystem detection  
✅ **Error prevention**: Real-time validation prevents common mistakes  

## 🔄 **CSV Format Examples**

### **Simple Token Allowlist**
```csv
ecosystem,requirement_type,contract_address,min_amount,fulfillment
universal_profile,lsp7_token,0xb2894bfdac8d21c2098196b2707c738f5533e0a8,1,any
universal_profile,lsp7_token,0xeea8420360d5e2ec7990d880515b88eb015a4e32,1,any
universal_profile,lsp7_token,0xf4272e04412f38ec7e4d2e0bc3c63db8e281533a,1,any
```
**Result**: "Hold ANY of these 3 tokens" → GraphQL auto-fills metadata

### **Cross-Chain Requirements**
```csv
ecosystem,requirement_type,contract_address,min_amount,fulfillment
universal_profile,lsp7_token,0xb2894bfdac8d21c2098196b2707c738f5533e0a8,1,all
ethereum_profile,erc20_token,0xa0b86a33e6b58c6c3f6b6a0b86a33e6b58c6c3f6,1000000000000000000,all
```
**Result**: "Hold LUKSO OG NFT AND 1 USDC" → Mixed ecosystems supported

### **NFT Collection Gate**
```csv
ecosystem,requirement_type,contract_address,min_amount,token_id,fulfillment
universal_profile,lsp8_nft,0x544051588d6a0713e164196c16024fdcff877540,1,,any
universal_profile,lsp8_nft,0x544051588d6a0713e164196c16024fdcff877540,1,123,any
```
**Result**: "Hold any NFT from collection OR specific token #123"

## 🎪 **Success Metrics**

### **Adoption Goals**
- 30% of new locks use CSV upload within first month
- Average 50+ requirements per CSV lock (vs 5 for manual)
- <10% CSV upload abandonment rate

### **Performance Targets**
- CSV processing: <3 seconds for 100 tokens
- GraphQL metadata: >95% success rate
- File upload: Support up to 10MB files

### **Quality Metrics**
- Zero "Unknown Token" entries in CSV-created locks
- <5% user correction rate after initial processing
- Same verification success rate as manual locks

## 🚀 **Ready to Build**

### **Why This Will Work**
1. **Proven GraphQL infrastructure** - Reliable metadata source established
2. **Clear integration point** - Template selection is natural place for CSV
3. **Simplified CSV format** - GraphQL auto-fills complex metadata
4. **Familiar patterns** - Reuses existing lock builder state and validation
5. **Incremental approach** - Non-breaking addition to current flow

### **Risk Mitigation**
- **Large files**: Stream parsing + progress indicators
- **Network failures**: Graceful fallbacks + retry logic  
- **User errors**: Real-time validation + helpful templates
- **Performance**: Batch GraphQL queries + efficient state updates

### **Next Steps**
1. ✅ **Plan approved** - Architecture and UX defined
2. 🔄 **Examine integration points** - Study current Template step
3. 🏗️ **Build CSV utilities** - PapaParse + GraphQL integration
4. 🎨 **Create upload modal** - File processing UI
5. 🔗 **Integrate with lock builder** - Merge requirements seamlessly

**Ready to start coding when you give the green light!** 🚀

The combination of proven GraphQL infrastructure + simplified CSV format + seamless UX integration makes this the perfect time to implement bulk lock creation.
