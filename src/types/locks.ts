/**
 * Lock System Types
 * 
 * TypeScript interfaces for the gating locks system that provides
 * reusable, user-friendly gating configurations
 */

import { GatingCategory } from './gating';

/**
 * Database representation of a gating lock
 */
export interface Lock {
  id: number;
  name: string;
  description?: string;
  icon?: string; // Emoji or icon identifier  
  color?: string; // Hex color code for theming
  gatingConfig: LockGatingConfig; // Complete gating configuration
  creatorUserId: string;
  communityId: string;
  isTemplate: boolean; // Curated community template
  isPublic: boolean; // Shareable within community
  tags: string[]; // For categorization and search
  usageCount: number; // Analytics
  successRate: number; // 0-1, percentage who pass verification
  avgVerificationTime: number; // Seconds
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * Gating configuration stored in locks
 * Reuses the exact same format as posts.settings.responsePermissions
 */
export interface LockGatingConfig {
  categories: GatingCategory[];
  requireAll?: boolean; // If true, user must satisfy ALL categories
  requireAny?: boolean; // If true, user must satisfy ANY category (default)
}

/**
 * Lock creation/update request
 */
export interface CreateLockRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  gatingConfig: LockGatingConfig;
  tags?: string[];
  isPublic?: boolean;
}

export interface UpdateLockRequest extends Partial<CreateLockRequest> {
  id: number;
}

/**
 * Lock with additional computed properties for UI
 */
export interface LockWithStats extends Lock {
  postsUsingLock: number; // From lock_stats view
  canEdit: boolean; // Based on user permissions
  canDelete: boolean; // Based on user permissions
  isOwned: boolean; // Created by current user
}

/**
 * Lock selection for post creation
 */
export interface LockSelection {
  lockId: number | null;
  customGating?: LockGatingConfig; // For posts that don't use locks
}

/**
 * Lock template categories for organization
 */
export interface LockTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: LockTemplateCategory;
  gatingConfig: LockGatingConfig;
}

export type LockTemplateCategory = 
  | 'ethereum' // ETH holders, ENS, ERC tokens
  | 'lukso' // LYX holders, UP tokens, followers  
  | 'social' // EFP requirements, follower counts
  | 'nft' // NFT collection ownership
  | 'mixed' // Multiple blockchain requirements
  | 'custom'; // User-created

/**
 * Lock analytics data
 */
export interface LockAnalytics {
  lockId: number;
  totalUses: number;
  totalAttempts: number;
  successfulVerifications: number;
  failedVerifications: number;
  avgVerificationTime: number;
  popularityRank: number; // Within community
  recentActivity: LockActivity[];
}

export interface LockActivity {
  type: 'created' | 'applied' | 'verified' | 'failed';
  timestamp: string;
  userId?: string;
  postId?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Lock search and filtering
 */
export interface LockSearchParams {
  communityId: string;
  query?: string; // Search in name/description
  tags?: string[]; // Filter by tags
  category?: LockTemplateCategory; // Filter by category
  creatorUserId?: string; // Filter by creator
  isTemplate?: boolean; // Only templates
  isPublic?: boolean; // Only public locks
  sortBy?: LockSortBy;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type LockSortBy = 
  | 'name'
  | 'created_at'
  | 'updated_at'
  | 'usage_count'
  | 'success_rate'
  | 'avg_verification_time';

export interface LockSearchResponse {
  locks: LockWithStats[];
  total: number;
  hasMore: boolean;
}

/**
 * Lock validation results
 */
export interface LockValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Lock permission context
 */
export interface LockPermissions {
  canCreate: boolean;
  canEdit: (lock: Lock) => boolean;
  canDelete: (lock: Lock) => boolean;
  canUse: (lock: Lock) => boolean;
  canCreateTemplate: boolean;
}

/**
 * Quick lock presets for common use cases
 */
export interface QuickLock {
  id: string;
  name: string;
  description: string;
  icon: string;
  gatingConfig: LockGatingConfig;
  estimatedSetupTime: number; // Minutes
}

/**
 * Lock builder state for multi-step creation wizard
 */
export interface LockBuilderState {
  step: LockBuilderStep;
  selectedTemplate: any | null; // eslint-disable-line @typescript-eslint/no-explicit-any -- Template from template system (Phase 2) - TODO: proper type after integration
  metadata: Partial<CreateLockRequest>;
  requirements: GatingRequirement[]; // Flat list of all requirements
  fulfillmentMode: 'any' | 'all'; // Whether to require ANY or ALL ecosystems (global fulfillment)
  ecosystemFulfillment: Record<EcosystemType, 'any' | 'all'>; // 🚀 NEW: Per-ecosystem fulfillment modes
  validation: LockValidationResult;
  previewMode: boolean;
  
  // Navigation state for requirement configuration screens
  currentScreen: RequirementBuilderScreen;
  selectedRequirementType?: RequirementType;
  editingRequirementId?: string;
  
  // CSV upload state
  showCSVUpload: boolean;
}

export type RequirementBuilderScreen = 
  | 'requirements'  // Main requirements list
  | 'picker'        // Requirement type picker  
  | 'configure';    // Configure specific requirement

export type LockBuilderStep = 
  | 'metadata' // Template selection and basic info
  | 'requirements' // Requirements list + picker + configurators  
  | 'preview' // Preview and test with wallets
  | 'save'; // Final save step

/**
 * User-friendly requirement descriptions for UI
 */
export interface RequirementDescription {
  type: string;
  title: string;
  description: string;
  icon: string;
  complexity: 'simple' | 'moderate' | 'advanced';
  estimatedTime: number; // Minutes for users to verify
  examples: string[];
}

/**
 * Lock recommendation engine data
 */
export interface LockRecommendation {
  lock: Lock;
  score: number; // 0-1, relevance score
  reason: string; // Why this lock is recommended
  confidence: number; // 0-1, confidence in recommendation
}

export interface LockRecommendationContext {
  postTitle?: string;
  postContent?: string;
  postTags?: string[];
  boardId?: number;
  userHistory?: number[]; // Lock IDs previously used
  communityTrends?: number[]; // Popular lock IDs in community
}

/**
 * Utility type for lock operations
 */
export type LockOperation = 
  | 'create'
  | 'read' 
  | 'update'
  | 'delete'
  | 'apply'
  | 'clone'
  | 'share'
  | 'analyze';

/**
 * API response types
 */
export interface LockApiResponse<T = Lock> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LockListResponse extends LockApiResponse<LockWithStats[]> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

/**
 * Lock migration utilities for converting existing gated posts
 */
export interface LockMigrationCandidate {
  postId: number;
  gatingConfig: LockGatingConfig;
  matchingLocks: Lock[]; // Existing locks with identical config
  shouldCreateNewLock: boolean;
  suggestedLockName?: string;
}

export interface LockMigrationResult {
  postsProcessed: number;
  locksCreated: number;
  postsLinked: number;
  errors: string[];
}

/**
 * Individual gating requirement structure
 */
export interface GatingRequirement {
  id: string;
  type: RequirementType;
  category: RequirementCategory;
  config: RequirementConfig;
  isValid: boolean;
  displayName: string; // Human-readable name for the requirement
}

export type RequirementCategory = 'token' | 'social' | 'identity';

/**
 * Ecosystem types for requirement fulfillment (actual gating categories)
 */
export type EcosystemType = 'universal_profile' | 'ethereum_profile';

export type RequirementType = 
  // Token requirements
  | 'lyx_balance'
  | 'lsp7_token'
  | 'lsp8_nft'
  | 'eth_balance'
  | 'erc20_token'
  | 'erc721_nft'
  | 'erc1155_token'
  // Social requirements
  | 'up_follower_count'
  | 'up_must_follow'
  | 'up_must_be_followed_by'
  | 'efp_follower_count'
  | 'efp_must_follow'
  | 'efp_must_be_followed_by'
  // Identity requirements
  | 'ens_domain'
  | 'ens_pattern';

/**
 * Requirement configuration (type-specific)
 */
export type RequirementConfig = 
  | LyxBalanceConfig
  | LSP7TokenConfig
  | LSP8NFTConfig
  | EthBalanceConfig
  | ERC20TokenConfig
  | ERC721NFTConfig
  | ERC1155TokenConfig
  | UPFollowerCountConfig
  | UPMustFollowConfig
  | UPMustBeFollowedByConfig
  | EFPFollowerCountConfig
  | EFPMustFollowConfig
  | EFPMustBeFollowedByConfig
  | ENSDomainConfig
  | ENSPatternConfig;

// Token requirement configs
export interface LyxBalanceConfig {
  minAmount: string; // Wei amount
}

export interface LSP7TokenConfig {
  contractAddress: string;
  minAmount: string;
  name?: string;
  symbol?: string;
  decimals?: number; // Store actual decimals for proper amount handling
}

export interface LSP8NFTConfig {
  contractAddress: string;
  minAmount?: string;
  tokenId?: string;
  name?: string;
  symbol?: string;
}

export interface EthBalanceConfig {
  minAmount: string; // Wei amount
}

export interface ERC20TokenConfig {
  contractAddress: string;
  minAmount: string;
  decimals?: number;
  name?: string;
  symbol?: string;
}

export interface ERC721NFTConfig {
  contractAddress: string;
  minCount?: number;
  name?: string;
  symbol?: string;
}

export interface ERC1155TokenConfig {
  contractAddress: string;
  tokenId: string;
  minAmount: string;
  name?: string;
}

// Social requirement configs
export interface UPFollowerCountConfig {
  minCount: number;
}

export interface UPMustFollowConfig {
  address: string;
  profileName?: string;
  profileImage?: string;
  username?: string;
  bio?: string;
  isVerified?: boolean;
}

export interface UPMustBeFollowedByConfig {
  address: string;
  profileName?: string;
  profileImage?: string;
  username?: string;
  bio?: string;
  isVerified?: boolean;
}

export interface EFPFollowerCountConfig {
  minCount: number;
}

export interface EFPMustFollowConfig {
  address: string;
  ensName?: string;
  displayName?: string;
  avatar?: string;
  followers?: number;
  following?: number;
  isVerified?: boolean;
}

export interface EFPMustBeFollowedByConfig {
  address: string;
  ensName?: string;
  displayName?: string;
  avatar?: string;
  followers?: number;
  following?: number;
  isVerified?: boolean;
}

// Identity requirement configs
export interface ENSDomainConfig {
  requiresENS: boolean;
}

export interface ENSPatternConfig {
  patterns: string[]; // e.g., ["*.eth", "vitalik.eth"]
} 