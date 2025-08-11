# Token Configurators GraphQL Migration Plan

## 🎯 **Objective**

Migrate all token configurators in lock creation/editing from unreliable RPC calls to the reliable GraphQL indexer. This is **CRITICAL** because these configurators store metadata in lock configs - if they fetch wrong data via RPC, it gets permanently saved and causes verification failures (like the JAN token issue).

## 🔍 **Current RPC Usage Analysis**

### **1. LUKSO Token Configurators (HIGH PRIORITY)**

#### **`LSP7TokenConfigurator.tsx`** ✅ **ALREADY PARTIALLY MIGRATED**
- **Status**: Uses `useLuksoSingleToken` GraphQL hook ✅
- **Migration**: COMPLETE - already using GraphQL for metadata
- **Verification**: Working correctly with GraphQL data

#### **`LSP8NFTConfigurator.tsx`** 🔴 **NEEDS MIGRATION**  
- **Current**: Direct RPC calls for metadata fetching
- **RPC Issues**: 
  ```typescript
  // Lines 147-200: Direct ethers.Contract calls
  const contract = new ethers.Contract(contractAddress, [...], provider);
  isLSP8 = await contract.supportsInterface(LSP8_INTERFACE_ID);
  const [nameBytes, symbolBytes] = await contract.getDataBatch(dataKeys);
  ```
- **Problem**: Unreliable RPC data gets stored in lock config

### **2. Ethereum Token Configurators (SEPARATE ECOSYSTEM)**

#### **`ERC20TokenConfigurator.tsx`** ⚠️ **ETHEREUM MAINNET**
- **Current**: RPC calls to Ethereum mainnet
- **Assessment**: Different blockchain, not part of LUKSO GraphQL migration
- **Decision**: Keep as-is (Ethereum ecosystem)

#### **`ERC721NFTConfigurator.tsx`** ⚠️ **ETHEREUM MAINNET**  
- **Current**: RPC calls to Ethereum mainnet
- **Assessment**: Different blockchain, not part of LUKSO GraphQL migration
- **Decision**: Keep as-is (Ethereum ecosystem)

#### **`ERC1155TokenConfigurator.tsx`** ⚠️ **ETHEREUM MAINNET**
- **Current**: RPC calls to Ethereum mainnet  
- **Assessment**: Different blockchain, not part of LUKSO GraphQL migration
- **Decision**: Keep as-is (Ethereum ecosystem)

### **3. Supporting Components**

#### **`RequirementsList.tsx`** ⚠️ **MIXED USAGE**
- **Current**: Uses old `useUPTokenMetadata` hook for display
- **Issue**: Should use new `useLuksoTokenMetadata` for consistency
- **Priority**: LOW (display only, doesn't store data)

## 📋 **Migration Priority Matrix**

| Component | Priority | Reason | Action |
|-----------|----------|--------|---------|
| `LSP7TokenConfigurator` | ✅ **COMPLETE** | Already using GraphQL | Verify working |
| `LSP8NFTConfigurator` | 🔴 **CRITICAL** | Stores wrong metadata in locks | Migrate to GraphQL |
| `RequirementsList` | 🟡 **LOW** | Display only, not stored | Update hook usage |
| Ethereum Configurators | ❌ **NO ACTION** | Different blockchain | Keep RPC |

## 🔧 **LSP8NFTConfigurator Migration Plan**

### **Current Implementation Issues**

```typescript
// PROBLEM: Direct RPC calls (lines 147-200)
const contract = new ethers.Contract(contractAddress, [...], provider);

// Interface detection via RPC
isLSP8 = await contract.supportsInterface(LSP8_INTERFACE_ID);

// ERC725Y data fetching via RPC  
const [nameBytes, symbolBytes] = await contract.getDataBatch(dataKeys);
```

### **Target Implementation**

```typescript
// SOLUTION: Use GraphQL hook like LSP7TokenConfigurator
const { 
  data: tokenData, 
  isLoading: isLoadingMetadata,
  error: metadataError 
} = useLuksoSingleToken(
  contractAddress,
  { 
    includeIcons: true,
    enabled: addressValidation.isValid 
  }
);

// Handle GraphQL data
useEffect(() => {
  if (tokenData) {
    // Validate LSP8 token type
    if (tokenData.tokenType !== 'LSP8') {
      setAddressValidation({ 
        isValid: false, 
        error: `Contract is ${tokenData.tokenType}, not LSP8.` 
      });
      return;
    }
    
    // Use reliable GraphQL metadata
    setCollectionName(tokenData.name || 'Unknown Collection');
    setCollectionSymbol(tokenData.symbol || 'UNK');
  }
}, [tokenData]);
```

### **Migration Steps**

1. **Remove RPC dependencies:**
   ```typescript
   // REMOVE:
   - ethers.providers.JsonRpcProvider setup
   - ethers.Contract instances
   - supportsInterface calls
   - getDataBatch ERC725Y calls
   - Manual IPFS URL resolution
   ```

2. **Add GraphQL hook:**
   ```typescript
   // ADD:
   import { useLuksoSingleToken } from '@/hooks/lukso/useLuksoMetadata';
   
   const { data: tokenData, isLoading, error } = useLuksoSingleToken(
     contractAddress, 
     { includeIcons: true, enabled: addressValidation.isValid }
   );
   ```

3. **Update state management:**
   ```typescript
   // REPLACE manual RPC handling with GraphQL data handling
   useEffect(() => {
     if (tokenData?.tokenType === 'LSP8') {
       setCollectionName(tokenData.name || 'Unknown Collection');
       setCollectionSymbol(tokenData.symbol || 'UNK');
       // GraphQL already provides resolved icon URLs
     }
   }, [tokenData]);
   ```

4. **Simplify UI loading states:**
   ```typescript
   // SIMPLIFY: Use GraphQL loading state
   const isLoading = isLoadingMetadata;
   ```

## 🚫 **What NOT to Migrate**

### **Ethereum Ecosystem (Keep RPC)**
- `ERC20TokenConfigurator.tsx` - Ethereum mainnet 
- `ERC721NFTConfigurator.tsx` - Ethereum mainnet
- `ERC1155TokenConfigurator.tsx` - Ethereum mainnet

**Reason**: These are Ethereum mainnet contracts, not LUKSO. The GraphQL indexer is LUKSO-specific.

### **Balance Verification (Keep RPC)**
- Any actual token balance checking
- Real-time verification during gating

**Reason**: GraphQL is for metadata, RPC is still needed for real-time balance verification.

## 🧪 **Testing Strategy**

### **Pre-Migration Testing**
1. **Test problematic tokens with current RPC:**
   - JAN token (`0xf4272e04412f38ec7e4d2e0bc3c63db8e281533a`0`)
   - DRIZZLE token
   - LUKSO OG token
   - Document current behavior/errors

### **Post-Migration Testing**  
1. **Test same tokens with GraphQL:**
   - Verify correct metadata fetching
   - Verify correct decimals storage
   - Test lock creation → lock editing → verification flow

2. **Edge Case Testing:**
   - Invalid contract addresses
   - Non-LSP8 contracts
   - Network timeouts
   - Missing metadata

### **Validation Criteria**
✅ **Success Indicators:**
- LSP8 configurator fetches metadata via GraphQL
- No more RPC calls in LSP8NFTConfigurator  
- Stored lock configs contain correct metadata
- Verification works correctly with stored data

❌ **Failure Indicators:**
- Still seeing RPC calls in network tab
- Incorrect metadata stored in locks
- Verification failures due to wrong data

## 📊 **Impact Assessment**

### **Risk Level**: 🔴 **HIGH**
- **Why**: Wrong metadata storage causes permanent lock dysfunction
- **Examples**: JAN token verification failures due to wrong decimals

### **Complexity**: 🟡 **MEDIUM**
- **Effort**: ~2-3 hours per configurator  
- **Scope**: Isolated changes within each configurator

### **Benefits**: 🚀 **HIGH**
- Eliminates root cause of metadata storage issues
- Consistent reliable data source
- Faster configurator loading (GraphQL caching)
- Better user experience

## 🎯 **Implementation Order**

1. **Phase 1: LSP8NFTConfigurator Migration** (CRITICAL)
   - Highest impact, directly stores wrong metadata
   - Estimated time: 2-3 hours

2. **Phase 2: RequirementsList Update** (LOW PRIORITY)  
   - Display-only improvement for consistency
   - Estimated time: 30 minutes

3. **Phase 3: Testing & Validation**
   - Test with problematic tokens
   - Verify lock creation → editing → verification flow
   - Estimated time: 1 hour

**Total Effort**: ~4 hours
**Risk**: Low (isolated changes)
**Benefit**: Eliminates critical metadata reliability issues

## ✅ **Success Criteria**

1. **No RPC calls in LUKSO configurators** (except balance verification)
2. **Correct metadata stored in lock configs** 
3. **JAN token and similar tokens work correctly** in lock creation/verification
4. **Consistent data source** across all LUKSO components
5. **Improved performance** due to GraphQL caching

---

**Ready to implement? Let's start with LSP8NFTConfigurator migration!** 🚀
