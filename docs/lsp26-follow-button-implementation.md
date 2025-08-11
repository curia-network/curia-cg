# LSP26 Follow Button Implementation Specification

## Overview

Implement a "Follow" button for `must_follow` Universal Profile requirements that appears when:
1. User is connected with their Universal Profile
2. User does not currently pass the `must_follow` requirement
3. User is viewing a gated lock/post and sees their verification status

This mirrors the existing marketplace "Get" button pattern exactly - providing an action button for users to fulfill requirements they currently fail.

## Current State Analysis

### Existing Follow Status Verification

The follow status checking **already exists and works correctly** in our gating system:

**In `useUpTokenVerification.ts`:**
```typescript
// We already check follow status during verification
const checkFollowerRequirements = async (requirements: FollowerRequirement[]) => {
  // This calls getFollowingStatus() to determine if user passes must_follow requirements
  const results = await Promise.all(requirements.map(async (req) => {
    if (req.type === 'must_follow') {
      const isFollowing = await getFollowingStatus(userProfileAddress, req.address);
      return { requirement: req, met: isFollowing };
    }
    // ... other requirement types
  }));
  return results;
};
```

**In `RichRequirementsDisplay.tsx`:**
```typescript
// We already show pass/fail status for follow requirements
{req.type === 'must_follow' && (
  <div className={`requirement-item ${requirementMet ? 'passed' : 'failed'}`}>
    Must follow {req.profileName || req.address}
    {requirementMet ? '✅' : '❌'}
    {/* HERE IS WHERE WE NEED THE FOLLOW BUTTON */}
  </div>
)}
```

### What We Need to Add

**Only one thing is missing:** The action button for failed `must_follow` requirements.

Currently when a user fails a `must_follow` requirement, they see:
- ❌ Must follow @alice
- *No way to take action*

We need to add:
- ❌ Must follow @alice **[Follow]** ← This button!

## Technical Implementation Plan

### 1. LSP26 Transaction Infrastructure

**File: `@/lib/lsp26.ts` (enhance existing)**

```typescript
// Enhance existing followProfile function
export async function followProfile(
  targetAddress: string, 
  signer: ethers.Signer
): Promise<ethers.ContractTransaction> {
  try {
    // 1. Gas estimation
    const gasEstimate = await lsp26Contract.estimateGas.follow(targetAddress);
    const gasLimit = gasEstimate.mul(110).div(100); // 10% buffer
    
    // 2. Execute follow via Universal Profile
    // The signer should already be connected to the UP
    const tx = await lsp26Contract.connect(signer).follow(targetAddress, { gasLimit });
    
    return tx;
  } catch (error) {
    // Enhanced error handling for specific cases
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new Error('Insufficient LYX for gas fees');
    }
    if (error.message.includes('User denied')) {
      throw new Error('Transaction cancelled by user');
    }
    throw error;
  }
}

// Add balance checking utility
export async function checkSufficientBalance(
  signer: ethers.Signer,
  estimatedGas: ethers.BigNumber,
  gasPrice: ethers.BigNumber
): Promise<boolean> {
  const balance = await signer.getBalance();
  const requiredBalance = estimatedGas.mul(gasPrice);
  return balance.gte(requiredBalance);
}
```

### 2. Follow Button Hook

**File: `@/hooks/useFollowAction.ts` (new)**

```typescript
import { useState } from 'react';
import { ethers } from 'ethers';
import { followProfile } from '@/lib/lsp26';

interface UseFollowActionProps {
  targetAddress: string;
  targetName?: string;
  onSuccess?: () => void;
}

export function useFollowAction({ targetAddress, targetName, onSuccess }: UseFollowActionProps) {
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const handleFollow = async (signer: ethers.Signer) => {
    setIsFollowPending(true);
    setFollowError(null);

    try {
      // 1. Pre-check if already following (safety check)
      const isAlreadyFollowing = await getFollowingStatus(
        await signer.getAddress(), 
        targetAddress
      );
      
      if (isAlreadyFollowing) {
        throw new Error('Already following this profile');
      }

      // 2. Check balance before attempting
      const gasEstimate = await lsp26Contract.estimateGas.follow(targetAddress);
      const gasPrice = await signer.getGasPrice();
      const hasSufficientBalance = await checkSufficientBalance(signer, gasEstimate, gasPrice);
      
      if (!hasSufficientBalance) {
        throw new Error('Insufficient LYX for gas fees. Please add LYX to your profile.');
      }

      // 3. Execute follow transaction
      const tx = await followProfile(targetAddress, signer);
      
      // 4. Wait for confirmation
      await tx.wait();
      
      // 5. Success callback
      onSuccess?.();
      
    } catch (error: any) {
      setFollowError(error.message || 'Failed to follow profile');
    } finally {
      setIsFollowPending(false);
    }
  };

  return {
    handleFollow,
    isFollowPending,
    followError,
    clearError: () => setFollowError(null)
  };
}
```

### 3. Follow Button Component Integration

**File: `@/components/gating/RichRequirementsDisplay.tsx` (modify existing)**

Add to the follower requirements section:

```typescript
// Import follow functionality
import { useFollowAction } from '@/hooks/useFollowAction';
import { useUpProfileContext } from '@/contexts/UpProfileContext'; // for signer

// Inside component, for each must_follow requirement:
const FollowRequirementItem: React.FC<{
  requirement: FollowerRequirement;
  requirementMet: boolean;
}> = ({ requirement, requirementMet }) => {
  const { signer, userStatus } = useUpProfileContext();
  
  const { handleFollow, isFollowPending, followError, clearError } = useFollowAction({
    targetAddress: requirement.address,
    targetName: requirement.profileName,
    onSuccess: () => {
      // Refresh verification status after successful follow
      invalidateVerificationStatus?.();
    }
  });

  const onFollowClick = async () => {
    if (!signer) return;
    clearError();
    await handleFollow(signer);
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${
      requirementMet 
        ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800' 
        : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
    }`}>
      <div className="flex items-center space-x-3">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
          requirementMet ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {requirementMet ? (
            <Check className="h-3 w-3 text-white" />
          ) : (
            <X className="h-3 w-3 text-white" />
          )}
        </div>
        
        <div>
          <p className={`text-sm font-medium ${
            requirementMet ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
          }`}>
            Must follow {requirement.profileName || requirement.address}
          </p>
          {followError && (
            <p className="text-xs text-red-600 mt-1">{followError}</p>
          )}
        </div>
      </div>

      {/* FOLLOW BUTTON - Only show if requirement not met and user connected */}
      {!requirementMet && userStatus.connected && (
        <Button
          size="sm"
          onClick={onFollowClick}
          disabled={isFollowPending}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isFollowPending ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Following...
            </>
          ) : (
            'Follow'
          )}
        </Button>
      )}
      
      {/* Optional: Link to profile using cgInstance.navigate */}
      {requirement.profileName && (
        <button
          onClick={() => cgInstance?.navigate(`https://profile.lukso.network/${requirement.address}`)}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          View Profile
        </button>
      )}
    </div>
  );
};
```

### 4. Error Handling Scenarios

**User-Friendly Error Messages:**

```typescript
const getErrorMessage = (error: string): string => {
  if (error.includes('insufficient funds') || error.includes('Insufficient LYX')) {
    return 'Not enough LYX for gas fees. Please add LYX to your profile and try again.';
  }
  if (error.includes('User denied') || error.includes('cancelled')) {
    return 'Follow request cancelled.';
  }
  if (error.includes('Already following')) {
    return 'You are already following this profile.';
  }
  if (error.includes('network') || error.includes('timeout')) {
    return 'Network error. Please check your connection and try again.';
  }
  return 'Failed to follow profile. Please try again.';
};
```

### 5. Integration with Existing Verification Flow

**The follow status checking already works perfectly.** Here's how it integrates:

1. **User visits gated content** → `useUpTokenVerification` runs
2. **Verification checks follow status** → `getFollowingStatus()` called for each `must_follow` requirement  
3. **Requirements display** → `RichRequirementsDisplay` shows pass/fail status
4. **User sees failed follow requirement** → Follow button appears
5. **User clicks Follow** → LSP26 transaction executed
6. **Transaction succeeds** → `invalidateVerificationStatus()` called
7. **Verification re-runs** → `getFollowingStatus()` now returns true
8. **UI updates** → Requirement shows as passed, Follow button disappears

**No changes needed to existing verification logic!** We just add the action button.

## User Experience Flow

```
User sees: ❌ Must follow @alice

User clicks: [Follow] button

System: 
- Estimates gas
- Checks LYX balance  
- Shows transaction confirmation
- User approves in UP wallet
- Transaction mines
- Verification status refreshes
- UI updates

User now sees: ✅ Must follow @alice
```

## Implementation Phases

### Phase 1: Core Infrastructure (1 session)
- Enhance `@/lib/lsp26.ts` with robust transaction handling
- Create `useFollowAction` hook
- Add error handling utilities

### Phase 2: UI Integration (1 session)  
- Add Follow button to `RichRequirementsDisplay`
- Implement loading states and error display
- Test user interaction flow

### Phase 3: Polish & Edge Cases (0.5 sessions)
- Handle edge cases (insufficient balance, self-follow, etc.)
- Add optional profile links via `cgInstance.navigate`
- Final testing and UX polish

## Key Design Decisions

### Why This Approach Works

1. **Leverages Existing Infrastructure**: Uses current verification system, just adds action capability
2. **Consistent UX**: Mirrors marketplace "Get" button pattern exactly  
3. **Real-time Updates**: Integrates with existing `invalidateVerificationStatus()` pattern
4. **Minimal Code Changes**: Only adds UI layer, no changes to verification logic
5. **Robust Error Handling**: Covers all failure scenarios with user-friendly messages

### Integration Points

- **Verification**: Uses existing `getFollowingStatus()` and verification refresh patterns
- **Wallet**: Uses existing UP connection and signer infrastructure  
- **UI**: Follows established button styling and conditional display patterns
- **Navigation**: Uses `cgInstance.navigate()` for any external links
- **State Management**: Integrates with existing requirement status updates

## Clarification: Follow Status Checking

You're 100% correct! The follow status checking **already works perfectly** in our gating system. When I mentioned "integrate getFollowingStatus() into requirement verification," I was being unclear.

**What already works:**
- ✅ `getFollowingStatus()` is called during verification
- ✅ `must_follow` requirements show pass/fail correctly  
- ✅ Real-time verification updates work

**What we're adding:**
- 🆕 Action button for failed `must_follow` requirements
- 🆕 LSP26 transaction execution
- 🆕 User feedback during follow process

The verification infrastructure is complete. We're just adding the "Follow" button that lets users take action on failed requirements, exactly like the marketplace "Get" button for token requirements.

This is purely additive - no changes to existing verification logic needed!
