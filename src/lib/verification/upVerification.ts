/**
 * Universal Profile Verification Functions
 * 
 * Shared verification logic for Universal Profile gating requirements.
 * Used by both the comments API and pre-verification API to ensure consistency.
 */

import { ethers } from 'ethers';
import { 
  TOKEN_FUNCTION_SELECTORS,
  TokenVerificationResult
} from '@/lib/verification';
import { PostSettings, TokenRequirement, FollowerRequirement } from '@/types/settings';
import { SettingsUtils } from '@/types/settings';

// LUKSO mainnet RPC configuration with working fallbacks only
const LUKSO_RPC_URLS = [
  process.env.NEXT_PUBLIC_LUKSO_MAINNET_RPC_URL,
  'https://rpc.mainnet.lukso.network', // Official LUKSO - works ✅
  'https://42.rpc.thirdweb.com'         // Thirdweb by Chain ID - works ✅
].filter(Boolean) as string[];

/**
 * Raw LUKSO RPC call helper - bypasses ethers.js HTTP compatibility issues
 * 
 * Note: We use raw fetch() calls instead of ethers.js providers due to 
 * Next.js runtime compatibility issues. Ethers v5 sets HTTP headers that
 * cause "Referrer 'client' is not a valid URL" errors in serverless environments.
 */
async function rawLuksoCall(method: string, params: unknown[] = []): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  };

  for (const rpcUrl of LUKSO_RPC_URLS) {
    try {
      console.log(`[rawLuksoCall] Trying ${method} on ${rpcUrl}`);
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const { result, error } = await res.json();
      if (error) {
        throw new Error(error.message || 'RPC error');
      }

      console.log(`[rawLuksoCall] Success: ${method} on ${rpcUrl}`);
      return result;
    } catch (error) {
      console.warn(`[rawLuksoCall] Failed ${method} on ${rpcUrl}:`, error);
    }
  }
  
  throw new Error(`All RPC endpoints failed for ${method}`);
}

/**
 * Verify LYX balance requirement using raw RPC calls
 * 
 * Uses eth_getBalance to check the Universal Profile's native LYX balance
 * against the minimum requirement set in the post's gating settings.
 */
export async function verifyLyxBalance(
  upAddress: string, 
  minBalance: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Get the Universal Profile's LYX balance using raw RPC call
    const balanceHex = await rawLuksoCall('eth_getBalance', [upAddress, 'latest']);
    
    // Convert hex balance to BigNumber for precise comparison (avoids floating point issues)
    const balance = ethers.BigNumber.from(balanceHex);
    const minBalanceBN = ethers.BigNumber.from(minBalance);
    
    if (balance.lt(minBalanceBN)) {
      const balanceEth = ethers.utils.formatEther(balance);
      const minBalanceEth = ethers.utils.formatEther(minBalance);
      return { 
        valid: false, 
        error: `Insufficient LYX balance. Required: ${minBalanceEth} LYX, Current: ${balanceEth} LYX` 
      };
    }

    console.log(`[verifyLyxBalance] Balance check passed: ${ethers.utils.formatEther(balance)} LYX >= ${ethers.utils.formatEther(minBalance)} LYX`);
    return { valid: true };

  } catch (error) {
    console.error('[verifyLyxBalance] Raw RPC balance check failed:', error);
    return { 
      valid: false, 
      error: 'Unable to verify LYX balance. Please check your connection and try again.' 
    };
  }
}

/**
 * Verify LSP7 token balance requirement using raw RPC calls
 * 
 * LSP7 tokens are fungible tokens (like ERC20) with balanceOf(address) function
 */
export async function verifyLSP7Balance(
  upAddress: string,
  requirement: TokenRequirement
): Promise<TokenVerificationResult> {
  try {
    console.log(`[verifyLSP7Balance] Checking LSP7 token ${requirement.contractAddress} for ${upAddress}`);

    // Manual ABI encoding for balanceOf(address) call
    const balanceOfSelector = TOKEN_FUNCTION_SELECTORS.LSP7_BALANCE_OF;
    const addressParam = upAddress.slice(2).padStart(64, '0'); // Remove 0x and pad to 32 bytes
    const callData = balanceOfSelector + addressParam;

    // Call balanceOf on the LSP7 token contract
    const balanceHex = await rawLuksoCall('eth_call', [
      {
        to: requirement.contractAddress,
        data: callData
      },
      'latest'
    ]);

    // Convert hex balance to BigNumber for comparison
    const balance = ethers.BigNumber.from(balanceHex);
    const minBalance = ethers.BigNumber.from(requirement.minAmount);

      if (balance.lt(minBalance)) {
    // Use actual token decimals for formatting, fallback to 18 if not provided
    const tokenDecimals = requirement.decimals ?? 18;
    const balanceFormatted = ethers.utils.formatUnits(balance, tokenDecimals);
    const minBalanceFormatted = ethers.utils.formatUnits(minBalance, tokenDecimals);
    
    return {
      valid: false,
      error: `Insufficient ${requirement.symbol || requirement.name} balance. Required: ${minBalanceFormatted}, Current: ${balanceFormatted}`,
      balance: balance.toString()
    };
  }

  // Use actual token decimals for logging, fallback to 18 if not provided
  const tokenDecimals = requirement.decimals ?? 18;
  console.log(`[verifyLSP7Balance] Token balance check passed: ${ethers.utils.formatUnits(balance, tokenDecimals)} >= ${ethers.utils.formatUnits(minBalance, tokenDecimals)}`);
  return { 
    valid: true,
    balance: balance.toString()
  };

  } catch (error) {
    console.error(`[verifyLSP7Balance] Failed to verify LSP7 token ${requirement.contractAddress}:`, error);
    return {
      valid: false,
      error: `Unable to verify ${requirement.symbol || requirement.name} balance. Please check your connection and try again.`,
    };
  }
}

/**
 * Verify LSP8 NFT ownership requirement using raw RPC calls
 * 
 * LSP8 tokens are NFTs (like ERC721) with balanceOf(address) and tokenOwnerOf(bytes32) functions
 * Supports both collection ownership (any NFT) and specific token ID ownership
 */
export async function verifyLSP8Ownership(
  upAddress: string,
  requirement: TokenRequirement
): Promise<TokenVerificationResult> {
  try {
    console.log(`[verifyLSP8Ownership] Checking LSP8 NFT ${requirement.contractAddress} for ${upAddress}`);

    // Check if this is a specific token ID requirement
    if (requirement.tokenId) {
      console.log(`[verifyLSP8Ownership] Verifying ownership of specific token ID: ${requirement.tokenId}`);
      
      // Manual ABI encoding for tokenOwnerOf(bytes32 tokenId) call
      const tokenOwnerOfSelector = TOKEN_FUNCTION_SELECTORS.LSP8_TOKEN_OWNER_OF;
      
      // Convert tokenId to bytes32 (LSP8 uses bytes32 instead of uint256)
      let tokenIdBytes32: string;
      if (requirement.tokenId.startsWith('0x')) {
        // Already hex, pad to 32 bytes
        tokenIdBytes32 = requirement.tokenId.slice(2).padStart(64, '0');
      } else {
        // Convert number to hex and pad to 32 bytes
        const tokenIdBN = ethers.BigNumber.from(requirement.tokenId);
        tokenIdBytes32 = tokenIdBN.toHexString().slice(2).padStart(64, '0');
      }
      
      const callData = tokenOwnerOfSelector + tokenIdBytes32;

      // Call tokenOwnerOf on the LSP8 NFT contract
      const ownerHex = await rawLuksoCall('eth_call', [
        {
          to: requirement.contractAddress,
          data: callData
        },
        'latest'
      ]);

      // Extract the owner address from the response
      const owner = ethers.utils.getAddress('0x' + (ownerHex as string).slice(-40));
      const ownsSpecificToken = owner.toLowerCase() === upAddress.toLowerCase();
      
      if (!ownsSpecificToken) {
        return {
          valid: false,
          error: `Does not own specific ${requirement.symbol || requirement.name} NFT with token ID ${requirement.tokenId}`,
          balance: '0'
        };
      }

      console.log(`[verifyLSP8Ownership] ✅ Specific token ownership verified: ${upAddress} owns token ID ${requirement.tokenId}`);
      return {
        valid: true,
        balance: '1' // Owns the specific token
      };
      
    } else {
      // Collection ownership check - existing logic
      console.log(`[verifyLSP8Ownership] Verifying collection ownership (any NFT from collection)`);
      
      // Manual ABI encoding for balanceOf(address) call
      const balanceOfSelector = TOKEN_FUNCTION_SELECTORS.LSP8_BALANCE_OF;
      const addressParam = upAddress.slice(2).padStart(64, '0'); // Remove 0x and pad to 32 bytes
      const callData = balanceOfSelector + addressParam;

      // Call balanceOf on the LSP8 NFT contract
      const balanceHex = await rawLuksoCall('eth_call', [
        {
          to: requirement.contractAddress,
          data: callData
        },
        'latest'
      ]);

      // Convert hex balance to number (for NFTs, this is the count of tokens owned)
      const nftCount = ethers.BigNumber.from(balanceHex);
      const minRequired = ethers.BigNumber.from(requirement.minAmount || '1'); // Default to 1 NFT if not specified

      if (nftCount.lt(minRequired)) {
        return {
          valid: false,
          error: `Insufficient ${requirement.symbol || requirement.name} NFTs. Required: ${minRequired.toString()}, Current: ${nftCount.toString()}`,
          balance: nftCount.toString()
        };
      }

      console.log(`[verifyLSP8Ownership] ✅ Collection ownership verified: owns ${nftCount.toString()} NFTs >= ${minRequired.toString()} required`);
      return {
        valid: true,
        balance: nftCount.toString()
      };
    }

  } catch (error) {
    console.error(`[verifyLSP8Ownership] Failed to verify LSP8 NFT ${requirement.contractAddress}:`, error);
    
    // Provide more specific error message
    const errorMessage = requirement.tokenId 
      ? `Unable to verify ownership of specific ${requirement.symbol || requirement.name} NFT (ID: ${requirement.tokenId}). Please check your connection and try again.`
      : `Unable to verify ${requirement.symbol || requirement.name} NFT ownership. Please check your connection and try again.`;
      
    return {
      valid: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify LSP26 follower requirements using proper ethers.js ABI encoding
 */
export async function verifyFollowerRequirements(
  upAddress: string,
  requirements: FollowerRequirement[]
): Promise<{ valid: boolean; error?: string }> {
  try {
    console.log(`[verifyFollowerRequirements] Checking ${requirements.length} follower requirements for ${upAddress}`);

    const LSP26_REGISTRY_ADDRESS = '0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA';
    
    // Use proper ethers.js Interface for ABI encoding
    const LSP26_ABI = [
      'function followerCount(address addr) view returns (uint256)',
      'function isFollowing(address follower, address addr) view returns (bool)'
    ];
    const iface = new ethers.utils.Interface(LSP26_ABI);

    for (const requirement of requirements) {
      let callData: string;
      let isValid = false;

      switch (requirement.type) {
        case 'minimum_followers': {
          // Call followerCount(address) on LSP26 registry using proper ABI encoding
          callData = iface.encodeFunctionData('followerCount', [upAddress]);
          
          const followerCountHex = await rawLuksoCall('eth_call', [
            {
              to: LSP26_REGISTRY_ADDRESS,
              data: callData
            },
            'latest'
          ]);

          // Decode the result using ethers
          const [followerCount] = iface.decodeFunctionResult('followerCount', followerCountHex as string);
          const followerCountNum = followerCount.toNumber();
          const requiredCount = parseInt(requirement.value, 10);
          
          isValid = followerCountNum >= requiredCount;
          
          if (!isValid) {
            return {
              valid: false,
              error: `Insufficient followers. Required: ${requiredCount}, Current: ${followerCountNum}`
            };
          }
          
          console.log(`[verifyFollowerRequirements] Follower count check passed: ${followerCountNum} >= ${requiredCount}`);
          break;
        }

        case 'followed_by': {
          // 🎯 SELF-FOLLOW AUTO-PASS: If user is the person who must do the following, auto-pass
          if (requirement.value.toLowerCase() === upAddress.toLowerCase()) {
            console.log(`[verifyFollowerRequirements] ✅ Auto-pass: User IS the required follower (${upAddress})`);
            return { valid: true };
          }

          // Call isFollowing(followerAddress, targetAddress) - check if requirement.value follows upAddress
          callData = iface.encodeFunctionData('isFollowing', [requirement.value, upAddress]);
          
          const isFollowedByHex = await rawLuksoCall('eth_call', [
            {
              to: LSP26_REGISTRY_ADDRESS,
              data: callData
            },
            'latest'
          ]);

          // Decode the boolean result
          const [isFollowedByResult] = iface.decodeFunctionResult('isFollowing', isFollowedByHex as string);
          isValid = Boolean(isFollowedByResult);
          
          if (!isValid) {
            return {
              valid: false,
              error: `Not followed by required profile: ${requirement.value.slice(0, 6)}...${requirement.value.slice(-4)}`
            };
          }
          
          console.log(`[verifyFollowerRequirements] Followed-by check passed: ${requirement.value} follows ${upAddress}`);
          break;
        }

        case 'following': {
          // 🎯 SELF-FOLLOW AUTO-PASS: If user is the person they must follow, auto-pass
          if (requirement.value.toLowerCase() === upAddress.toLowerCase()) {
            console.log(`[verifyFollowerRequirements] ✅ Auto-pass: User IS the person they must follow (${upAddress})`);
            return { valid: true };
          }

          // Call isFollowing(followerAddress, targetAddress) - check if upAddress follows requirement.value
          callData = iface.encodeFunctionData('isFollowing', [upAddress, requirement.value]);
          
          const isFollowingHex = await rawLuksoCall('eth_call', [
            {
              to: LSP26_REGISTRY_ADDRESS,
              data: callData
            },
            'latest'
          ]);

          // Decode the boolean result
          const [isFollowingResult] = iface.decodeFunctionResult('isFollowing', isFollowingHex as string);
          isValid = Boolean(isFollowingResult);
          
          if (!isValid) {
            return {
              valid: false,
              error: `Not following required profile: ${requirement.value.slice(0, 6)}...${requirement.value.slice(-4)}`
            };
          }
          
          console.log(`[verifyFollowerRequirements] Following check passed: ${upAddress} follows ${requirement.value}`);
          break;
        }

        default:
          return {
            valid: false,
            error: `Unknown follower requirement type: ${requirement.type}`
          };
      }
    }

    console.log(`[verifyFollowerRequirements] All ${requirements.length} follower requirements met`);
    return { valid: true };

  } catch (error) {
    console.error('[verifyFollowerRequirements] Error verifying follower requirements:', error);
    return { 
      valid: false, 
      error: 'Failed to verify follower requirements. Please check your connection and try again.' 
    };
  }
}

/**
 * Verify token requirements for both LSP7 and LSP8 tokens
 * 
 * @param upAddress - Universal Profile address to verify
 * @param requirements - Array of token requirements to check
 * @param fulfillment - Fulfillment mode: "any" (OR logic) or "all" (AND logic). Defaults to "all" for backward compatibility.
 */
export async function verifyTokenRequirements(
  upAddress: string,
  requirements: TokenRequirement[],
  fulfillment: "any" | "all" = "all"
): Promise<{ valid: boolean; error?: string }> {
  try {
    console.log(`[verifyTokenRequirements] Checking ${requirements.length} token requirements for ${upAddress} with fulfillment mode: ${fulfillment}`);

    // Process all token requirements in parallel for better performance
    const verificationPromises = requirements.map(async (requirement) => {
      if (requirement.tokenType === 'LSP7') {
        return await verifyLSP7Balance(upAddress, requirement);
      } else if (requirement.tokenType === 'LSP8') {
        return await verifyLSP8Ownership(upAddress, requirement);
      } else {
        return {
          valid: false,
          error: `Unsupported token type: ${requirement.tokenType}. Only LSP7 and LSP8 are supported.`
        };
      }
    });

    const results = await Promise.all(verificationPromises);

    // 🚀 NEW: Apply fulfillment logic instead of hardcoded "all" requirement
    const validResults = results.filter(result => result.valid);
    const failedResults = results.filter(result => !result.valid);

    if (fulfillment === 'any') {
      // ANY mode: At least one token requirement must pass
      if (validResults.length > 0) {
        console.log(`[verifyTokenRequirements] ✅ ANY mode satisfied: ${validResults.length}/${requirements.length} token requirements met`);
        return { valid: true };
      } else {
        console.log(`[verifyTokenRequirements] ❌ ANY mode failed: 0/${requirements.length} token requirements met`);
        
        // For ANY mode, show the first error as representative
        const firstError = failedResults.length > 0 ? failedResults[0].error : 'No token requirements satisfied';
        return { valid: false, error: firstError };
      }
    } else {
      // ALL mode: All token requirements must pass (original behavior)
      if (validResults.length === requirements.length) {
        console.log(`[verifyTokenRequirements] ✅ ALL mode satisfied: ${validResults.length}/${requirements.length} token requirements met`);
        return { valid: true };
      } else {
        console.log(`[verifyTokenRequirements] ❌ ALL mode failed: ${validResults.length}/${requirements.length} token requirements met`);
        
        // For ALL mode, show the first failure
        const firstFailure = failedResults.find(result => !result.valid);
        return { valid: false, error: firstFailure?.error || 'Not all token requirements satisfied' };
      }
    }

  } catch (error) {
    console.error('[verifyTokenRequirements] Error verifying token requirements:', error);
    return { valid: false, error: 'Failed to verify token requirements' };
  }
}

/**
 * Verify all Universal Profile gating requirements
 * 
 * This is the main verification function that orchestrates all requirement checks.
 * Used by both the comments API and pre-verification API.
 * 
 * @param upAddress - Universal Profile address to verify
 * @param postSettings - Post settings containing gating requirements  
 * @param fulfillment - Fulfillment mode: "any" (OR logic) or "all" (AND logic). Defaults to "all" for backward compatibility.
 */
export async function verifyPostGatingRequirements(
  upAddress: string,
  postSettings: PostSettings,
  fulfillment: "any" | "all" = "all"
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if gating is enabled
    if (!SettingsUtils.hasUPGating(postSettings)) {
      return { valid: true }; // No gating requirements
    }

    const requirements = SettingsUtils.getUPGatingRequirements(postSettings);
    if (!requirements) {
      return { valid: true }; // No specific requirements
    }

    console.log(`[verifyPostGatingRequirements] Using fulfillment mode: ${fulfillment}`);

    // 🚀 NEW: Collect all requirement results instead of early returns
    const requirementResults: Array<{ valid: boolean; error?: string }> = [];
    
    // Verify LYX balance requirement
    if (requirements.minLyxBalance) {
      const lyxResult = await verifyLyxBalance(upAddress, requirements.minLyxBalance);
      requirementResults.push(lyxResult);
      console.log(`[verifyPostGatingRequirements] LYX balance check: ${lyxResult.valid ? '✅' : '❌'} ${lyxResult.error || ''}`);
    }

    // Verify token requirements (LSP7/LSP8)
    if (requirements.requiredTokens && requirements.requiredTokens.length > 0) {
      const tokenResult = await verifyTokenRequirements(upAddress, requirements.requiredTokens, fulfillment);
      requirementResults.push(tokenResult);
      console.log(`[verifyPostGatingRequirements] Token requirements check: ${tokenResult.valid ? '✅' : '❌'} ${tokenResult.error || ''}`);
    }

    // Verify follower requirements (LSP26)
    if (requirements.followerRequirements && requirements.followerRequirements.length > 0) {
      const followerResult = await verifyFollowerRequirements(upAddress, requirements.followerRequirements);
      requirementResults.push(followerResult);
      console.log(`[verifyPostGatingRequirements] Follower requirements check: ${followerResult.valid ? '✅' : '❌'} ${followerResult.error || ''}`);
    }

    // 🚀 NEW: Apply fulfillment logic
    if (requirementResults.length === 0) {
      return { valid: true }; // No requirements to check
    }

    const validResults = requirementResults.filter(result => result.valid);
    const failedResults = requirementResults.filter(result => !result.valid);

    if (fulfillment === 'any') {
      // ANY mode: At least one requirement must pass
      if (validResults.length > 0) {
        console.log(`[verifyPostGatingRequirements] ✅ ANY mode satisfied: ${validResults.length}/${requirementResults.length} requirements met`);
        return { valid: true };
      } else {
        console.log(`[verifyPostGatingRequirements] ❌ ANY mode failed: 0/${requirementResults.length} requirements met`);
        return { 
          valid: false, 
          error: failedResults.length > 0 ? failedResults[0].error : 'No requirements satisfied'
        };
      }
    } else {
      // ALL mode: All requirements must pass (default behavior)
      if (validResults.length === requirementResults.length) {
        console.log(`[verifyPostGatingRequirements] ✅ ALL mode satisfied: ${validResults.length}/${requirementResults.length} requirements met`);
        return { valid: true };
      } else {
        console.log(`[verifyPostGatingRequirements] ❌ ALL mode failed: ${validResults.length}/${requirementResults.length} requirements met`);
        return { 
          valid: false, 
          error: failedResults.length > 0 ? failedResults[0].error : 'Not all requirements satisfied'
        };
      }
    }

  } catch (error) {
    console.error('[verifyPostGatingRequirements] Error verifying requirements:', error);
    return { valid: false, error: 'Failed to verify post requirements' };
  }
} 