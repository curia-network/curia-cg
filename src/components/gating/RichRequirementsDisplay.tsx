/**
 * Rich Requirements Display Component
 * 
 * A beautiful, prominent display of gating requirements with:
 * - Gradient backgrounds based on verification status
 * - Profile pictures for follower requirements
 * - Token icons from IPFS metadata
 * - Detailed "Required vs You have" information
 * - Real-time loading states and animations
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Coins, 
  Users, 
  UserCheck, 
  UserX,
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  Wallet
} from 'lucide-react';
import { ethers } from 'ethers';

import { UPGatingRequirements, VerificationStatus } from '@/types/gating';
import { lsp26Registry } from '@/lib/lsp26';
import { useUPSocialProfiles } from '@/hooks/useUPSocialProfiles';
import { useLuksoTokenMetadata, type LuksoTokenMetadata } from '@/hooks/lukso/useLuksoMetadata';

// ===== TYPES =====

// Extended verification status with additional properties needed for rich display
export interface ExtendedVerificationStatus extends VerificationStatus {
  address?: string; // User's wallet address when connected
  balances?: {
    lyx?: bigint; // Use bigint for precision
    eth?: bigint;
    tokens?: Record<string, {
      raw: string;        // Raw balance for BigNumber comparisons 
      formatted: string;  // Formatted balance for display
      decimals?: number;
      name?: string;
      symbol?: string;
    }>;
  };
  followerStatus?: Record<string, boolean>;
}

export interface RichRequirementsDisplayProps {
  requirements: UPGatingRequirements;
  fulfillment?: "any" | "all"; // 🚀 NEW: Fulfillment mode for this category
  userStatus: ExtendedVerificationStatus;
  metadata: {
    icon: string;
    name: string;
    brandColor: string;
  };
  onConnect: () => Promise<void>;
  onDisconnect?: () => void;
  disabled?: boolean;
  className?: string;
  isPreviewMode?: boolean;
  showHeader?: boolean;
}

// Simplified state - only for follower counts (user-specific data)
interface FollowerVerificationState {
  followerVerifications: Record<string, {
    type: 'minimum_followers' | 'followed_by' | 'following';
    value: string;
    userFollowerCount?: number;
    status: boolean;
    isLoading: boolean;
    error?: string;
  }>;
}

// ===== MAIN COMPONENT =====

export const RichRequirementsDisplay: React.FC<RichRequirementsDisplayProps> = ({
  requirements,
  fulfillment = 'all', // 🚀 NEW: Default to 'all' for backward compatibility
  userStatus,
  metadata,
  onConnect,
  onDisconnect,
  disabled = false,
  className = '',
  isPreviewMode = false,
  showHeader = true // NEW: Default to true for backward compatibility
}) => {
  // 🔍 DEBUG: Log fulfillment prop value
  console.log(`[RichRequirementsDisplay] 🔧 Fulfillment mode: "${fulfillment}" (${typeof fulfillment})`);
  
  // ===== REACT QUERY DATA FETCHING =====
  
  // Get all addresses we need profiles for
  const profileAddresses = useMemo(() => {
    const addresses: string[] = [];
    
    // Add follower requirement addresses (except minimum_followers which are just counts)
    if (requirements.followerRequirements) {
      requirements.followerRequirements
        .filter(req => req.type !== 'minimum_followers')
        .forEach(req => addresses.push(req.value));
    }
    
    // Add connected user address
    if (userStatus.address) {
      addresses.push(userStatus.address);
    }
    
    return [...new Set(addresses)]; // Remove duplicates
  }, [requirements.followerRequirements, userStatus.address]);

  // Get all token addresses we need metadata for
  const tokenAddresses = useMemo(() => 
    requirements.requiredTokens?.map(t => t.contractAddress) || []
  , [requirements.requiredTokens]);

  // Fetch profiles & token metadata with custom hooks
  const { data: socialProfiles = {}, isLoading: isLoadingSocialProfiles } = useUPSocialProfiles(profileAddresses);

  // Fetch token metadata using GraphQL-based hook
  const { data: tokenMetadataResponse, isLoading: isLoadingTokenMetadata } = useLuksoTokenMetadata(
    tokenAddresses,
    { 
      includeIcons: true, 
      enabled: tokenAddresses.length > 0 
    }
  );

  // Extract token metadata from response
  const tokenMetadata = useMemo(() => {
    return tokenMetadataResponse?.data?.tokens || {} as Record<string, LuksoTokenMetadata>;
  }, [tokenMetadataResponse]);

  // ===== FOLLOWER COUNT STATE (user-specific, can't be cached globally) =====
  const [followerState, setFollowerState] = useState<FollowerVerificationState>({
    followerVerifications: {},
  });

  // ===== FOLLOWER COUNT FETCHING =====
  const followerReqString = JSON.stringify(requirements.followerRequirements ?? []);
  useEffect(() => {
    const fetchFollowerCounts = async () => {
      if (!userStatus.connected || !userStatus.address) return;
      if (requirements.followerRequirements == null || requirements.followerRequirements.length === 0) return;

      const minFollowerReqs = requirements.followerRequirements.filter(r => r.type === 'minimum_followers');
      if (minFollowerReqs.length === 0) return;

      try {
        const count = await lsp26Registry.getFollowerCount(userStatus.address);
        setFollowerState(prev => {
          const updatedFollowerVerifications = { ...prev.followerVerifications };
          let hasChanges = false;
          minFollowerReqs.forEach(r => {
            const key = `${r.type}-${r.value}`;
            const meets = count >= parseInt(r.value);
            const existing = updatedFollowerVerifications[key];
            if (!existing || existing.status !== meets || existing.userFollowerCount !== count) {
              hasChanges = true;
              updatedFollowerVerifications[key] = {
                type: r.type,
                value: r.value,
                userFollowerCount: count,
                status: meets,
                isLoading: false,
              };
            }
          });
          if (!hasChanges) return prev; // Avoid unnecessary state updates
          return {
            ...prev,
            followerVerifications: updatedFollowerVerifications,
          };
        });
      } catch (err) {
        console.error('[RichRequirementsDisplay] Failed to fetch follower count', err);
      }
    };

    fetchFollowerCounts();
  }, [userStatus.connected, userStatus.address, followerReqString]);

  // ===== HELPER FUNCTIONS =====
  
  const formatBalance = (balance: string | bigint): string => {
    const balanceStr = typeof balance === 'bigint' ? ethers.utils.formatEther(balance) : balance;
    const num = parseFloat(balanceStr);
    return num < 0.001 ? '< 0.001' : num.toFixed(3);
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get status styling for requirement cards (unified implementation - matches Ethereum version)
  const getRequirementStyling = (isLoading: boolean, meetsRequirement?: boolean, error?: string) => {
    if (isLoading) {
      return 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 border-gray-200 dark:border-gray-700';
    }
    if (error) {
      return 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 border-red-200 dark:border-red-800';
    }
    if (meetsRequirement === true) {
      return 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-green-200 dark:border-green-800';
    }
    if (meetsRequirement === false) {
      return 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 border-red-200 dark:border-red-800';
    }
    return 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10 border-amber-200 dark:border-amber-800';
  };

  // Get status icon for requirements (unified implementation - matches Ethereum version)
  const getStatusIcon = (isLoading: boolean, meetsRequirement?: boolean, error?: string) => {
    if (isLoading) {
      return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
    if (error) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    if (meetsRequirement === true) {
      return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    }
    if (meetsRequirement === false) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  };

  // ===== REAL VERIFICATION DATA =====
  // Using real blockchain data from connected Universal Profile
  
  // LYX balance verification with real data
  const lyxVerification = requirements.minLyxBalance ? {
    userBalance: userStatus.balances?.lyx?.toString() || '0',
    formattedBalance: userStatus.balances?.lyx ? formatBalance(userStatus.balances.lyx) : '0',
    meetsRequirement: userStatus.balances?.lyx ? 
      ethers.BigNumber.from(userStatus.balances.lyx).gte(ethers.BigNumber.from(requirements.minLyxBalance)) : false,
    isLoading: false
  } : undefined;

  // Token verification with real blockchain data
  const tokenVerifications: Record<string, {
    balance: string;
    formattedBalance: string;
    decimals?: number;
    name?: string;
    symbol?: string;
    iconUrl?: string;
    meetsRequirement: boolean;
    isLoading: boolean;
    error?: string;
  }> = {};
  if (requirements.requiredTokens) {
    requirements.requiredTokens.forEach(token => {
      // 🎯 FIX: Use same tokenKey logic that matches data storage
      const tokenKey = token.tokenType === 'LSP8' && token.tokenId 
        ? `${token.contractAddress}-${token.tokenId}` // Unique key for specific LSP8 tokens
        : token.contractAddress; // Standard key for LSP7 and LSP8 collection verification
        
      const tokenData = userStatus.balances?.tokens?.[tokenKey];
      const metadata = tokenMetadata[token.contractAddress.toLowerCase()];
      
      // 🐛 DEBUG: Log metadata to see if iconUrl is being fetched
      console.log(`[RichRequirementsDisplay] 🔍 DEBUG - Token metadata for ${token.contractAddress}:`, metadata);
      console.log(`[RichRequirementsDisplay] 🔍 DEBUG - Available tokenMetadata keys:`, Object.keys(tokenMetadata));
      console.log(`[RichRequirementsDisplay] 🔍 DEBUG - isLoadingTokenMetadata:`, isLoadingTokenMetadata);
      
      // Prioritize enhanced metadata from userStatus.balances (which has classification info)
      const enhancedName = tokenData?.name || metadata?.name || token.name;
      const enhancedSymbol = tokenData?.symbol || metadata?.symbol || token.symbol;
      const enhancedDecimals = tokenData?.decimals ?? metadata?.decimals; // No fallback to 18
      const enhancedIconUrl = metadata?.icon; // Icon from GraphQL metadata
      
      tokenVerifications[tokenKey] = {
        balance: tokenData?.raw || '0',
        formattedBalance: tokenData?.formatted || '0',
        name: enhancedName,
        symbol: enhancedSymbol,
        decimals: enhancedDecimals,
        iconUrl: enhancedIconUrl,
        meetsRequirement: tokenData ? 
          ethers.BigNumber.from(tokenData.raw).gte(ethers.BigNumber.from(token.minAmount || '0')) : false,
        isLoading: isLoadingTokenMetadata && !metadata
      };
      
      console.log(`[RichRequirementsDisplay] 🔧 Token verification for ${token.contractAddress} (key: ${tokenKey}):`, {
        tokenType: token.tokenType,
        rawBalance: tokenData?.raw || '0',
        formattedBalance: tokenData?.formatted || '0',
        enhancedDecimals,
        meets: tokenVerifications[tokenKey].meetsRequirement,
        minAmount: token.minAmount,
        tokenData: tokenData ? { raw: tokenData.raw, formatted: tokenData.formatted, decimals: tokenData.decimals, name: tokenData.name, symbol: tokenData.symbol } : 'NO TOKEN DATA'
      });
    });
  }

  // Follower verification with real data
  const followerVerifications: Record<string, {
    type: 'minimum_followers' | 'followed_by' | 'following';
    value: string;
    userFollowerCount?: number;
    status: boolean;
    isLoading: boolean;
    error?: string;
  }> = {};
  if (requirements.followerRequirements) {
    requirements.followerRequirements.forEach(follower => {
      const key = `${follower.type}-${follower.value}`;
      // Prefer locally fetched verification state (e.g., follower counts) if available
      const localData = followerState.followerVerifications[key];
      followerVerifications[key] = {
        type: follower.type,
        value: follower.value,
        userFollowerCount: localData?.userFollowerCount,
        status: localData?.status ?? userStatus.followerStatus?.[key] ?? false,
        isLoading: localData ? localData.isLoading : false,
        error: localData?.error,
      };
    });
  }

  // ===== RENDER =====

  return (
    <Card className={`border-2 ${className}`}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center text-sm">
                <Shield className="h-4 w-4 mr-2" />
                {metadata.name} Required
              </CardTitle>
              <CardDescription className="text-xs">
                This post requires verification to comment
              </CardDescription>
            </div>
            
            {/* Connected Profile Status Bar */}
            {userStatus.connected && userStatus.address && (
              <div className="flex items-center space-x-2">
                {(() => {
                  const connectedProfile = socialProfiles[userStatus.address!.toLowerCase()];
                  return connectedProfile ? (
                    <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      {/* Profile Picture */}
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                        {connectedProfile.profileImage ? (
                          <img 
                            src={connectedProfile.profileImage} 
                            alt={connectedProfile.displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                            {connectedProfile.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      {/* Name and Username */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {connectedProfile.displayName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {connectedProfile.username}
                        </div>
                      </div>
                      {/* Verification Badge */}
                      {connectedProfile.isVerified && (
                        <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                          <CheckCircle className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {/* Disconnect Button */}
                      {onDisconnect && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onDisconnect}
                          className="h-auto p-1 opacity-60 hover:opacity-100 text-gray-500 hover:text-red-500"
                          title="Disconnect"
                        >
                          <XCircle size={14} />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      {/* Loading or fallback */}
                      {isLoadingSocialProfiles ? (
                        <>
                          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4"></div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-sm font-medium">
                            {userStatus.address!.charAt(2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {metadata.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {formatAddress(userStatus.address!)}
                            </div>
                          </div>
                          {/* Disconnect Button */}
                          {onDisconnect && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={onDisconnect}
                              className="h-auto p-1 opacity-60 hover:opacity-100 text-gray-500 hover:text-red-500"
                              title="Disconnect"
                            >
                              <XCircle size={14} />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </CardHeader>
      )}
      
      <CardContent className="space-y-3">
        {/* Requirements Section */}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Requirements
          </h4>
          
          {/* LYX Balance Requirement */}
          {requirements.minLyxBalance && (
            <div className={`flex items-center justify-between p-3 rounded-lg border min-h-[60px] ${
              getRequirementStyling(lyxVerification?.isLoading || false, lyxVerification?.meetsRequirement)
            }`}>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="font-medium text-sm">LYX Balance</div>
                  <div className="text-xs text-muted-foreground">
                    Required: {ethers.utils.formatEther(requirements.minLyxBalance)} LYX
                    {lyxVerification && ` • You have: ${lyxVerification.formattedBalance} LYX`}
                  </div>
                </div>
              </div>
              <div className="flex items-center">
                {getStatusIcon(lyxVerification?.isLoading || false, lyxVerification?.meetsRequirement)}
              </div>
            </div>
          )}
          
          {/* Token Requirements */}
          {requirements.requiredTokens && requirements.requiredTokens.length > 0 && (
            <>
              {requirements.requiredTokens.map((tokenReq, index) => {
                // Key for metadata lookup (simple, based on contract address)
                const metadataKey = tokenReq.tokenType === 'LSP8' && tokenReq.tokenId 
                  ? `${tokenReq.contractAddress}-${tokenReq.tokenId}` // Unique key for specific LSP8 tokens
                  : tokenReq.contractAddress; // Simple key for LSP7 and LSP8 collections for metadata
                  
                // Key for verification status lookup (unique per requirement for Issue B fix)
                const verificationKey = tokenReq.tokenType === 'LSP8' && tokenReq.tokenId 
                  ? `${tokenReq.contractAddress}-${tokenReq.tokenId}` // Unique key for specific LSP8 tokens
                  : `${tokenReq.contractAddress}-${tokenReq.minAmount}-${index}`; // Unique key per requirement for LSP7
                  
                const tokenData = tokenVerifications[metadataKey]; // Use metadata key for token info
                const verificationData = userStatus?.balances?.tokens?.[verificationKey]; // Use verification key for balance info
                
                // Compute if this specific requirement is met (for Issue B fix)
                const requirementMet = verificationData ? (() => {
                  const currentBalance = ethers.BigNumber.from(verificationData.raw || '0');
                  const requiredAmount = ethers.BigNumber.from(tokenReq.minAmount || '1');
                  return currentBalance.gte(requiredAmount);
                })() : tokenData?.meetsRequirement || false;
                let displayAmount: string;
                
                if (tokenReq.tokenType === 'LSP7') {
                  // Use stored decimals first (from CSV/configurator), then GraphQL as fallback
                  const storedDecimals = (tokenReq as any).decimals;
                  const graphqlDecimals = tokenData?.decimals;
                  const actualDecimals = storedDecimals !== undefined ? storedDecimals : graphqlDecimals;
                  
                  if (actualDecimals === undefined) {
                    // No decimals data available - show loading state
                    displayAmount = "Loading...";
                    console.log(`[RichRequirementsDisplay] ⚠️ No decimals data for LSP7 ${tokenReq.contractAddress}: stored=${storedDecimals}, graphql=${graphqlDecimals}`);
                  } else {
                    // Format using the actual decimals
                    displayAmount = ethers.utils.formatUnits(tokenReq.minAmount || '0', actualDecimals);
                    
                    console.log(`[RichRequirementsDisplay] 🔧 Formatting LSP7 ${tokenReq.contractAddress}: minAmount=${tokenReq.minAmount}, stored=${storedDecimals}, graphql=${graphqlDecimals}, used=${actualDecimals}, displayAmount=${displayAmount}`);
                    
                    // Clean up unnecessary decimals for whole numbers
                    if (parseFloat(displayAmount) === Math.floor(parseFloat(displayAmount))) {
                      displayAmount = Math.floor(parseFloat(displayAmount)).toString();
                    }
                  }
                } else {
                  // LSP8 tokens - always whole numbers
                  displayAmount = tokenReq.minAmount || '1';
                  // For LSP8 with specific token ID, show token ID in display
                  if (tokenReq.tokenId) {
                    displayAmount = `Token #${tokenReq.tokenId}`;
                  }
                }
                
                return (
                  <div key={index} className={`flex items-center justify-between p-3 rounded-lg border min-h-[60px] ${
                    getRequirementStyling(tokenData?.isLoading, requirementMet, tokenData?.error)
                  }`}>
                    <div className="flex items-center space-x-3">
                      {/* Token Icon or Fallback */}
                      {tokenData?.iconUrl ? (
                        <img 
                          src={tokenData.iconUrl} 
                          alt={`${tokenData.name || 'Token'} icon`}
                          className="w-8 h-8 rounded-full object-cover border border-gray-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : tokenData?.isLoading ? (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          {tokenReq.tokenType === 'LSP8' ? '🎨' : '🪙'}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-sm flex items-center space-x-2">
                          <span>{tokenData?.symbol || tokenReq.symbol || tokenReq.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {tokenReq.tokenType}{tokenReq.tokenId ? ` #${tokenReq.tokenId}` : ''}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {tokenReq.tokenType === 'LSP8' && tokenReq.tokenId ? (
                            // For specific LSP8 token IDs, show clear ownership status
                            <>
                              Specific Token ID: {tokenReq.tokenId}
                              {userStatus.connected && tokenData && (
                                <span className={`ml-2 font-medium ${tokenData.meetsRequirement ? 'text-green-600' : 'text-red-600'}`}>
                                  {tokenData.meetsRequirement ? '✅ You own this token' : '❌ You don\'t own this token'}
                                </span>
                              )}
                            </>
                          ) : (
                            // For LSP7 or LSP8 collection requirements
                            <>
                              Required: {displayAmount} {tokenReq.tokenType === 'LSP8' ? tokenData?.symbol || tokenReq.symbol || 'tokens' : ''}
                              {userStatus.connected && (verificationData || tokenData) && ` • You have: ${
                                // Apply the same smart detection for user balance display
                                (() => {
                                  if (tokenReq.tokenType === 'LSP8') {
                                    // LSP8 tokens are always whole numbers
                                    const balance = verificationData?.formatted || tokenData?.formattedBalance || '0';
                                    return Math.floor(parseFloat(balance) || 0).toString();
                                  } else {
                                    // For LSP7 tokens, always use the formatted balance
                                    // The GraphQL metadata and requirement decimals should be trusted
                                    return verificationData?.formatted || tokenData?.formattedBalance || '0';
                                  }
                                })()
                              } ${tokenData?.symbol || 'tokens'}`}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {getStatusIcon(tokenData?.isLoading, tokenData?.meetsRequirement, tokenData?.error)}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Follower Requirements */}
          {requirements.followerRequirements && requirements.followerRequirements.length > 0 && (
            <>
              {requirements.followerRequirements.map((followerReq, index) => {
                const reqKey = `${followerReq.type}-${followerReq.value}`;
                const reqData = followerVerifications[reqKey];
                
                if (followerReq.type === 'minimum_followers') {
                  return (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg border min-h-[60px] ${
                      getRequirementStyling(reqData?.isLoading, reqData?.status, reqData?.error)
                    }`}>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                          <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">Minimum Followers</div>
                          <div className="text-xs text-muted-foreground">
                            Required: {followerReq.value} followers
                            {reqData?.userFollowerCount !== undefined && ` • You have: ${reqData.userFollowerCount} followers`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {getStatusIcon(reqData?.isLoading, reqData?.status, reqData?.error)}
                      </div>
                    </div>
                  );
                } else {
                  // Address-based requirement with social profile
                  const socialProfile = socialProfiles[followerReq.value.toLowerCase()];
                  const iconClass = followerReq.type === 'followed_by'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-blue-600 dark:text-blue-400';
                  
                  return (
                    <div key={index} className={`p-3 rounded-lg border min-h-[80px] ${
                      getRequirementStyling(reqData?.isLoading, reqData?.status, reqData?.error)
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center flex-shrink-0">
                            {followerReq.type === 'followed_by' ? (
                              <UserCheck className={`h-4 w-4 ${iconClass}`} />
                            ) : (
                              <UserX className={`h-4 w-4 ${iconClass}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-1">
                              {followerReq.type === 'followed_by' ? 'Must be followed by' : 'Must follow'}
                            </div>
                            {/* Social Profile Display */}
                            {socialProfile ? (
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                                  {socialProfile.profileImage ? (
                                    <img 
                                      src={socialProfile.profileImage} 
                                      alt={socialProfile.displayName}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                                      {socialProfile.displayName.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1 min-w-0">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {socialProfile.displayName}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {socialProfile.username}
                                  </span>
                                </div>
                              </div>
                            ) : isLoadingSocialProfiles ? (
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
                                <div className="w-20 h-4 bg-gray-200 rounded animate-pulse" />
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground font-mono">
                                {followerReq.value.slice(0, 6)}...{followerReq.value.slice(-4)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center ml-3">
                          {getStatusIcon(reqData?.isLoading, reqData?.status, reqData?.error)}
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </>
          )}
        </div>

        {/* Connection Actions */}
        {(() => {
          const shouldShowConnectButton = !userStatus.connected;
          const shouldShowPreviewComplete = userStatus.connected && isPreviewMode;
          
          if (shouldShowConnectButton) {
            return (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Connect your {metadata.name} to verify requirements and comment.
                </div>
                <Button
                  onClick={onConnect}
                  disabled={disabled}
                  className="w-full"
                  size="sm"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Connect {metadata.name}
                </Button>
              </div>
            );
          }
          
          if (shouldShowPreviewComplete) {
            return (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  {metadata.name} connected successfully in preview mode.
                </div>
                <Button
                  disabled={true}
                  className="w-full"
                  size="sm"
                  variant="secondary"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Preview Complete ✓
                </Button>
              </div>
            );
          }
          
          return null;
        })()}

        {/* Overall Status */}
        {userStatus.connected && (
          <div className="text-xs">
            {(() => {
              // 🚀 NEW: Calculate if requirements are met based on fulfillment mode
              const requirementChecks = [];
              
              // Check LYX balance requirement
              if (lyxVerification) {
                requirementChecks.push(lyxVerification.meetsRequirement);
              }
              
              // Check token requirements
              if (requirements.requiredTokens) {
                requirements.requiredTokens.forEach((token, index) => {
                  // Use verification key for requirement checking (unique per requirement)
                  const verificationKey = token.tokenType === 'LSP8' && token.tokenId 
                    ? `${token.contractAddress}-${token.tokenId}` // Unique key for specific LSP8 tokens
                    : `${token.contractAddress}-${token.minAmount}-${index}`; // Unique key per requirement for LSP7
                  
                  // Check verification data first (from useUpTokenVerification), then fallback to metadata
                  const verificationData = userStatus?.balances?.tokens?.[verificationKey];
                  const metadataKey = token.tokenType === 'LSP8' && token.tokenId 
                    ? `${token.contractAddress}-${token.tokenId}` 
                    : token.contractAddress;
                  const tokenData = tokenVerifications[metadataKey];
                  
                  // Compute if this specific requirement is met
                  const requirementMet = verificationData ? (() => {
                    const currentBalance = ethers.BigNumber.from(verificationData.raw || '0');
                    const requiredAmount = ethers.BigNumber.from(token.minAmount || '1');
                    return currentBalance.gte(requiredAmount);
                  })() : tokenData?.meetsRequirement || false;
                  
                  requirementChecks.push(requirementMet);
                });
              }
              
              // Check follower requirements
              if (requirements.followerRequirements) {
                requirements.followerRequirements.forEach(follower => {
                  const key = `${follower.type}-${follower.value}`;
                  const reqData = followerVerifications[key];
                  requirementChecks.push(reqData?.status || false);
                });
              }
              
              // 🚀 NEW: Apply fulfillment mode logic
              let requirementsMet = false;
              let statusMessage = '';
              
              if (requirementChecks.length === 0) {
                requirementsMet = true;
                statusMessage = 'No requirements to verify';
              } else if (fulfillment === 'any') {
                // ANY mode: At least one requirement must be satisfied
                requirementsMet = requirementChecks.some(met => met === true);
                const metCount = requirementChecks.filter(met => met === true).length;
                statusMessage = requirementsMet 
                  ? `Requirements met (${metCount}/${requirementChecks.length}) - ready to comment!`
                  : `Need any 1 of ${requirementChecks.length} requirements`;
              } else {
                // ALL mode: All requirements must be satisfied (default behavior)
                requirementsMet = requirementChecks.every(met => met === true);
                const metCount = requirementChecks.filter(met => met === true).length;
                statusMessage = requirementsMet
                  ? 'All requirements met - ready to comment!'
                  : `Need all requirements (${metCount}/${requirementChecks.length} completed)`;
              }
              
              if (requirementsMet) {
                return (
                  <div className="flex items-center text-emerald-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {statusMessage}
                  </div>
                );
              } else {
                return (
                  <div className="flex items-center text-red-600">
                    <XCircle className="h-3 w-3 mr-1" />
                    {statusMessage}
                  </div>
                );
              }
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 