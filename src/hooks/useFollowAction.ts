import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { followProfile, checkSufficientBalance, getFollowingStatus } from '@/lib/lsp26';

interface UseFollowActionProps {
  targetAddress: string;
  targetName?: string;
  onSuccess?: () => void;
}

interface UseFollowActionReturn {
  handleFollow: (signer: ethers.Signer) => Promise<void>;
  isFollowPending: boolean;
  followError: string | null;
  clearError: () => void;
}

/**
 * Hook for managing follow action state and transactions
 * Handles the complete follow flow: validation, transaction, and feedback
 */
export function useFollowAction({ 
  targetAddress, 
  targetName, 
  onSuccess 
}: UseFollowActionProps): UseFollowActionReturn {
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setFollowError(null);
  }, []);

  const handleFollow = useCallback(async (signer: ethers.Signer) => {
    console.log(`[useFollowAction] Starting follow process for ${targetAddress}`);
    
    setIsFollowPending(true);
    setFollowError(null);

    try {
      // 1. Get user's address for validation
      const userAddress = await signer.getAddress();
      console.log(`[useFollowAction] User address: ${userAddress}`);

      // 2. Prevent self-follow
      if (userAddress.toLowerCase() === targetAddress.toLowerCase()) {
        throw new Error('Cannot follow yourself');
      }

      // 3. Pre-check if already following (safety check)
      console.log(`[useFollowAction] Checking if already following...`);
      const isAlreadyFollowing = await getFollowingStatus(userAddress, targetAddress);
      
      if (isAlreadyFollowing) {
        throw new Error(`Already following ${targetName || 'this profile'}`);
      }

      // 4. Check balance before attempting transaction
      console.log(`[useFollowAction] Checking sufficient balance...`);
      const hasSufficientBalance = await checkSufficientBalance(signer, targetAddress);
      
      if (!hasSufficientBalance) {
        throw new Error('Insufficient LYX for gas fees. Please add LYX to your profile and try again.');
      }

      // 5. Execute follow transaction
      console.log(`[useFollowAction] Executing follow transaction...`);
      const tx = await followProfile(targetAddress, signer);
      
      console.log(`[useFollowAction] Transaction submitted: ${tx.hash}`);
      
      // 6. Wait for confirmation (with extended timeout for Universal Relayer)
      console.log(`[useFollowAction] Waiting for transaction confirmation...`);
      console.log(`[useFollowAction] Note: LUKSO Universal Relayer may cause delays - this is normal`);
      
      const receipt = await Promise.race([
        tx.wait(),
        // Extended timeout for Universal Relayer delays (5 minutes)
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_RELAYER_DELAY')), 300000)
        )
      ]);
      
      if (receipt.status === 1) {
        console.log(`[useFollowAction] ✅ Follow successful in block ${receipt.blockNumber}!`);
        
        // 7. Success callback to refresh verification status
        onSuccess?.();
      } else {
        throw new Error('Transaction failed - receipt status 0');
      }
      
    } catch (error: any) {
      console.error('[useFollowAction] Follow failed:', error);
      
      // Convert error to user-friendly message
      let errorMessage = error.message || 'Failed to follow profile';
      
      // Handle specific error cases
      if (errorMessage.includes('User denied') || errorMessage.includes('cancelled')) {
        errorMessage = 'Follow request cancelled';
      } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('Insufficient LYX')) {
        errorMessage = 'Not enough LYX for gas fees. Please add LYX to your profile and try again.';
      } else if (errorMessage.includes('Already following')) {
        // Keep the specific already following message
        errorMessage = errorMessage;
      } else if (errorMessage.includes('Cannot follow yourself')) {
        errorMessage = 'You cannot follow your own profile';
      } else if (errorMessage.includes('TIMEOUT_RELAYER_DELAY')) {
        // Specific handling for Universal Relayer delays
        errorMessage = 'Transaction is processing through LUKSO Universal Relayer. This may take several minutes. Check back shortly or try refreshing.';
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setFollowError(errorMessage);
    } finally {
      setIsFollowPending(false);
    }
  }, [targetAddress, targetName, onSuccess]);

  return {
    handleFollow,
    isFollowPending,
    followError,
    clearError
  };
}
