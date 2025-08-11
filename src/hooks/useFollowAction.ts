import { useState, useCallback, useRef } from 'react';
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
  followStatus: 'idle' | 'confirming' | 'polling' | 'success' | 'timeout';
  pollProgress: { current: number; total: number };
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
  const [followStatus, setFollowStatus] = useState<'idle' | 'confirming' | 'polling' | 'success' | 'timeout'>('idle');
  const [pollProgress, setPollProgress] = useState({ current: 0, total: 60 }); // 60 polls = 2 minutes
  
  // Refs for cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearError = useCallback(() => {
    setFollowError(null);
    setFollowStatus('idle');
  }, []);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const startPolling = useCallback(async (userAddress: string) => {
    console.log(`[useFollowAction] Starting follow status polling...`);
    setFollowStatus('polling');
    setPollProgress({ current: 0, total: 60 });
    
    let pollCount = 0;
    const maxPolls = 60; // 2 minutes at 2-second intervals
    
    pollIntervalRef.current = setInterval(async () => {
      pollCount++;
      setPollProgress({ current: pollCount, total: maxPolls });
      
      try {
        console.log(`[useFollowAction] Polling follow status... (${pollCount}/${maxPolls})`);
        const isNowFollowing = await getFollowingStatus(userAddress, targetAddress);
        
        if (isNowFollowing) {
          console.log(`[useFollowAction] ✅ Follow confirmed via polling!`);
          cleanup();
          setFollowStatus('success');
          setIsFollowPending(false);
          onSuccess?.();
          return;
        }
        
        if (pollCount >= maxPolls) {
          console.warn(`[useFollowAction] ⏰ Polling timeout after ${maxPolls} attempts`);
          cleanup();
          setFollowStatus('timeout');
          setIsFollowPending(false);
          setFollowError('Follow action is taking longer than expected. Please refresh the page to check if it completed.');
        }
        
      } catch (pollError) {
        console.error(`[useFollowAction] Polling error:`, pollError);
        // Continue polling despite individual poll errors
      }
    }, 2000); // Poll every 2 seconds
    
    // Safety timeout
    pollTimeoutRef.current = setTimeout(() => {
      console.warn(`[useFollowAction] ⏰ Safety timeout reached`);
      cleanup();
      setFollowStatus('timeout');
      setIsFollowPending(false);
      setFollowError('Follow action is taking longer than expected. Please refresh the page to check if it completed.');
    }, 125000); // 2 minutes and 5 seconds safety buffer
  }, [targetAddress, onSuccess, cleanup]);

  const handleFollow = useCallback(async (signer: ethers.Signer) => {
    console.log(`[useFollowAction] Starting follow process for ${targetAddress}`);
    
    // Clean up any existing polling
    cleanup();
    
    setIsFollowPending(true);
    setFollowError(null);
    setFollowStatus('confirming');
    setPollProgress({ current: 0, total: 60 });

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
      
      console.log(`[useFollowAction] ✅ Transaction submitted: ${tx.hash}`);
      console.log(`[useFollowAction] Starting polling for follow status...`);
      
      // 6. Start polling immediately after transaction submission
      startPolling(userAddress);
      
    } catch (error: any) {
      console.error('[useFollowAction] Follow failed:', error);
      
      // Clean up on error
      cleanup();
      
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
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setFollowError(errorMessage);
      setFollowStatus('idle');
      setIsFollowPending(false);
    }
  }, [targetAddress, targetName, onSuccess, cleanup, startPolling]);

  return {
    handleFollow,
    isFollowPending,
    followError,
    followStatus,
    pollProgress,
    clearError
  };
}
