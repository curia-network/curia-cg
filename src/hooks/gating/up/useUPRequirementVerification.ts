import { useMemo } from 'react';
import { UPGatingRequirements } from '@/types/gating';
import { useUpLyxBalance } from './useUpLyxBalance';
import { useUpTokenVerification } from './useUpTokenVerification';
import { useUpFollowerVerification } from './useUpFollowerVerification';
import { ExtendedVerificationStatus } from '@/components/gating/RichRequirementsDisplay';
import { ethers } from 'ethers';

export const useUPRequirementVerification = (
  upAddress: string | null,
  requirements: UPGatingRequirements,
): { isLoading: boolean, error: string | null, verificationStatus: ExtendedVerificationStatus } => {
  
  const stableRequirements = useMemo(() => requirements, [requirements]);

  // === CHILD HOOKS ===
  const { rawBalance: rawLyxBalance, isLoading: isLoadingLyx, error: lyxError } = useUpLyxBalance(upAddress);
  const { verificationStatus: tokenStatus, isLoading: isLoadingTokens, error: tokenError } = useUpTokenVerification(upAddress, stableRequirements.requiredTokens || []);
  const { verificationStatus: followerStatus, isLoading: isLoadingFollowers, error: followerError } = useUpFollowerVerification(upAddress, stableRequirements.followerRequirements || []);

  // === STATE AGGREGATION ===
  const isLoading = isLoadingLyx || isLoadingTokens || isLoadingFollowers;
  const error = lyxError || tokenError || followerError;

  const verificationStatus: ExtendedVerificationStatus = useMemo(() => {
    // Transform the token status to match the expected format with proper decimal handling
    const transformedTokenStatus: { [key: string]: { raw: string; formatted: string; decimals?: number; name?: string; symbol?: string; } } = {};
    for (const key in tokenStatus) {
      const value = tokenStatus[key];
      
      // Use displayDecimals for formatting, fallback to actual decimals
      const displayDecimals = value.metadata?.displayDecimals ?? value.metadata?.decimals ?? 18;
      
      // For non-divisible tokens (LSP8 or LSP7 NFTs), format as whole numbers
      let formattedBalance: string;
      if (value.metadata?.tokenType === 'LSP8' || value.metadata?.isDivisible === false) {
        // For non-divisible tokens, just parse as integer
        const balance = ethers.BigNumber.from(value.currentBalance);
        formattedBalance = balance.toString();
      } else {
        // For divisible tokens, use proper decimal formatting
        formattedBalance = ethers.utils.formatUnits(value.currentBalance, displayDecimals);
      }
      
      transformedTokenStatus[key] = {
        raw: value.currentBalance,
        formatted: formattedBalance,
        decimals: value.metadata?.decimals,
        name: value.metadata?.name,
        symbol: value.metadata?.symbol,
      };
    }

    const transformedFollowerStatus: Record<string, boolean> = {};
    for (const key in followerStatus) {
      transformedFollowerStatus[key] = followerStatus[key].isMet;
    }

    return {
      connected: !!upAddress,
      verified: false, // This hook only does frontend checks
      address: upAddress || undefined,
      requirements: [], // This can be deprecated
      balances: {
        lyx: rawLyxBalance ? BigInt(rawLyxBalance) : undefined,
        tokens: transformedTokenStatus,
      },
      followerStatus: transformedFollowerStatus,
      error: error || undefined,
    };
  }, [upAddress, rawLyxBalance, tokenStatus, followerStatus, error]);

  return {
    isLoading,
    error,
    verificationStatus,
  };
}; 