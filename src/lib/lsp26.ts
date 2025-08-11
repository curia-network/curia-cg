import { ethers } from 'ethers';

export const LSP26_REGISTRY_ADDRESS = '0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA';

export const LSP26_ABI = [
  'function followerCount(address addr) view returns (uint256)',
  'function isFollowing(address follower, address addr) view returns (bool)',
  'function follow(address addr) external',
  'function unfollow(address addr) external',
  'event Follow(address indexed follower, address indexed addr)',
  'event Unfollow(address indexed follower, address indexed addr)'
];

export interface LSP26VerificationResult {
  success: boolean;
  followerCount?: number;
  isFollowedBy?: boolean;
  isFollowing?: boolean;
  error?: string;
}

export interface FollowerRequirement {
  type: 'minimum_followers' | 'followed_by' | 'following';
  value: string; // For minimum_followers: count, for others: UP address
  description?: string; // Human-readable description
}

// Get LUKSO RPC URL using the same pattern as existing code
const getLuksoRpcUrl = (): string => {
  return process.env.NEXT_PUBLIC_LUKSO_MAINNET_RPC_URL || 'https://rpc.mainnet.lukso.network';
};

export class LSP26Registry {
  private contract: ethers.Contract;
  private provider: ethers.providers.JsonRpcProvider;

  constructor() {
    const rpcUrl = getLuksoRpcUrl();
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(LSP26_REGISTRY_ADDRESS, LSP26_ABI, this.provider);
  }

  /**
   * Get the follower count for a given Universal Profile address
   */
  async getFollowerCount(address: string): Promise<number> {
    try {
      if (!ethers.utils.isAddress(address)) {
        throw new Error('Invalid address format');
      }

      console.log(`[LSP26Registry] Getting follower count for ${address}`);
      const count = await this.contract.followerCount(address);
      const followerCount = count.toNumber();
      
      console.log(`[LSP26Registry] Follower count for ${address}: ${followerCount}`);
      return followerCount;
    } catch (error) {
      console.error(`[LSP26Registry] Error getting follower count for ${address}:`, error);
      throw new Error(`Failed to get follower count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if one address is following another
   * @param follower - The address that might be following
   * @param target - The address being followed
   */
  async isFollowing(follower: string, target: string): Promise<boolean> {
    try {
      if (!ethers.utils.isAddress(follower) || !ethers.utils.isAddress(target)) {
        throw new Error('Invalid address format');
      }

      console.log(`[LSP26Registry] Checking if ${follower} follows ${target}`);
      const following = await this.contract.isFollowing(follower, target);
      
      console.log(`[LSP26Registry] ${follower} ${following ? 'follows' : 'does not follow'} ${target}`);
      return following;
    } catch (error) {
      console.error(`[LSP26Registry] Error checking follow relationship:`, error);
      throw new Error(`Failed to check follow relationship: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify a single follower requirement for a user
   */
  async verifyFollowerRequirement(
    userAddress: string,
    requirement: FollowerRequirement
  ): Promise<LSP26VerificationResult> {
    try {
      console.log(`[LSP26Registry] Verifying follower requirement:`, requirement);

      switch (requirement.type) {
        case 'minimum_followers': {
          const followerCount = await this.getFollowerCount(userAddress);
          const minimumRequired = parseInt(requirement.value, 10);
          const success = followerCount >= minimumRequired;
          
          return {
            success,
            followerCount,
            error: success ? undefined : `Insufficient followers: ${followerCount} < ${minimumRequired}`
          };
        }

        case 'followed_by': {
          const requiredFollower = requirement.value;
          const isFollowedBy = await this.isFollowing(requiredFollower, userAddress);
          
          return {
            success: isFollowedBy,
            isFollowedBy,
            error: isFollowedBy ? undefined : `Not followed by required profile: ${requiredFollower}`
          };
        }

        case 'following': {
          const requiredTarget = requirement.value;
          const isFollowing = await this.isFollowing(userAddress, requiredTarget);
          
          return {
            success: isFollowing,
            isFollowing,
            error: isFollowing ? undefined : `Not following required profile: ${requiredTarget}`
          };
        }

        default:
          throw new Error(`Unknown follower requirement type: ${(requirement as FollowerRequirement).type}`);
      }
    } catch (error) {
      console.error(`[LSP26Registry] Error verifying follower requirement:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown verification error'
      };
    }
  }

  /**
   * Verify multiple follower requirements for a user (all must pass)
   */
  async verifyFollowerRequirements(
    userAddress: string,
    requirements: FollowerRequirement[]
  ): Promise<{ success: boolean; results: LSP26VerificationResult[]; errors: string[] }> {
    try {
      console.log(`[LSP26Registry] Verifying ${requirements.length} follower requirements for ${userAddress}`);

      // Verify all requirements in parallel for performance
      const results = await Promise.all(
        requirements.map(req => this.verifyFollowerRequirement(userAddress, req))
      );

      const allSuccess = results.every(result => result.success);
      const errors = results.filter(result => !result.success).map(result => result.error!);

      console.log(`[LSP26Registry] Follower verification complete. Success: ${allSuccess}`);
      if (errors.length > 0) {
        console.log(`[LSP26Registry] Follower verification errors:`, errors);
      }

      return {
        success: allSuccess,
        results,
        errors
      };
    } catch (error) {
      console.error(`[LSP26Registry] Error verifying follower requirements:`, error);
      return {
        success: false,
        results: [],
        errors: [error instanceof Error ? error.message : 'Unknown verification error']
      };
    }
  }

  /**
   * Get detailed follower information for a user (useful for UI display)
   */
  async getFollowerInfo(userAddress: string): Promise<{
    followerCount: number;
    error?: string;
  }> {
    try {
      const followerCount = await this.getFollowerCount(userAddress);
      return { followerCount };
    } catch (error) {
      console.error(`[LSP26Registry] Error getting follower info:`, error);
      return {
        followerCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance for global use
export const lsp26Registry = new LSP26Registry();

// Utility functions for easy access
export const getFollowerCount = (address: string): Promise<number> => 
  lsp26Registry.getFollowerCount(address);

export const isFollowing = (follower: string, target: string): Promise<boolean> => 
  lsp26Registry.isFollowing(follower, target);

export const verifyFollowerRequirements = (userAddress: string, requirements: FollowerRequirement[]) =>
  lsp26Registry.verifyFollowerRequirements(userAddress, requirements);

// === TRANSACTION FUNCTIONS FOR FOLLOW ACTIONS ===

/**
 * Execute a follow transaction on the LSP26 registry
 * @param targetAddress - The Universal Profile address to follow
 * @param signer - Connected ethers signer (should be connected to user's UP)
 * @returns Transaction object
 */
export async function followProfile(
  targetAddress: string, 
  signer: ethers.Signer
): Promise<ethers.ContractTransaction> {
  try {
    // 1. Validate inputs
    if (!ethers.utils.isAddress(targetAddress)) {
      throw new Error('Invalid target address format');
    }

    // 2. Create contract instance with signer for transactions
    const contract = new ethers.Contract(LSP26_REGISTRY_ADDRESS, LSP26_ABI, signer);
    
    // 3. Gas estimation
    const gasEstimate = await contract.estimateGas.follow(targetAddress);
    const gasLimit = gasEstimate.mul(110).div(100); // 10% buffer for safety
    
    console.log(`[LSP26] Following ${targetAddress} with gas limit: ${gasLimit.toString()}`);
    
    // 4. Execute follow transaction
    const tx = await contract.follow(targetAddress, { gasLimit });
    
    console.log(`[LSP26] Follow transaction submitted: ${tx.hash}`);
    return tx;
    
  } catch (error: any) {
    console.error('[LSP26] Follow transaction failed:', error);
    
    // Enhanced error handling for specific cases
    if (error.code === 'INSUFFICIENT_FUNDS' || error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient LYX for gas fees');
    }
    if (error.message?.includes('User denied') || error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction cancelled by user');
    }
    if (error.message?.includes('already following')) {
      throw new Error('Already following this profile');
    }
    
    // Generic error fallback
    throw new Error(error.message || 'Failed to follow profile');
  }
}

/**
 * Check if user has sufficient balance for a follow transaction
 * @param signer - Connected ethers signer
 * @param targetAddress - Address to follow (for gas estimation)
 * @returns boolean indicating if balance is sufficient
 */
export async function checkSufficientBalance(
  signer: ethers.Signer,
  targetAddress: string
): Promise<boolean> {
  try {
    const contract = new ethers.Contract(LSP26_REGISTRY_ADDRESS, LSP26_ABI, signer);
    
    // Get current balance
    const balance = await signer.getBalance();
    
    // Estimate gas for follow transaction
    const gasEstimate = await contract.estimateGas.follow(targetAddress);
    const gasPrice = await signer.getGasPrice();
    
    // Calculate required balance (gas * gasPrice)
    const requiredBalance = gasEstimate.mul(gasPrice);
    
    console.log(`[LSP26] Balance check - Required: ${ethers.utils.formatEther(requiredBalance)} LYX, Available: ${ethers.utils.formatEther(balance)} LYX`);
    
    return balance.gte(requiredBalance);
  } catch (error) {
    console.error('[LSP26] Balance check failed:', error);
    // If we can't check, assume they don't have enough to be safe
    return false;
  }
}

// Convenience function that matches existing naming pattern
export const getFollowingStatus = (follower: string, target: string): Promise<boolean> => 
  isFollowing(follower, target); 