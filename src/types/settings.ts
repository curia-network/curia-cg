import { GatingCategory, EthereumGatingRequirements } from './gating';

/**
 * Community-level settings for plugin access control and features
 */
export interface CommunitySettings {
  permissions?: {
    allowedRoles?: string[]; // Role IDs that can access the entire plugin
    // Future: allowedUsers?: string[]; // Individual user overrides
  };
  
  // Background customization settings for the entire community
  background?: {
    imageUrl: string;           // URL to the background image
    repeat: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' | 'space' | 'round';
    size: 'auto' | 'cover' | 'contain' | string; // CSS background-size values
    position: string;           // CSS background-position (e.g., 'center center', 'top left')
    attachment: 'scroll' | 'fixed' | 'local';
    opacity: number;            // 0-1, for overlay effect
    overlayColor?: string;      // Optional overlay color (hex)
    blendMode?: string;         // CSS mix-blend-mode
    forceTheme?: 'light' | 'dark' | null; // Force specific theme mode when this background is active (null = respect system)
  };

  // AI-powered features configuration
  ai?: {
    autoModeration?: {
      enabled?: boolean;             // Whether AI auto-moderation is enabled (default: false - opt-in)
      requiresRole?: string[];       // Optional: restrict to specific roles (defaults to all authenticated users)
      enforcementLevel?: 'strict' | 'moderate' | 'lenient'; // How strict the enforcement should be (default: moderate)
      customKnowledge?: string;      // Custom knowledge base text blob for community-specific context
      maxKnowledgeTokens?: number;   // Token limit for custom knowledge (default: env NEXT_PUBLIC_AI_MAX_KNOWLEDGE_TOKENS or 2000)
      blockViolations?: boolean;     // Whether to block posts with violations (default: true)
      lastUpdatedBy?: string;        // User ID who last updated the settings
      lastUpdatedAt?: string;        // When settings were last updated
    };
    
    // Future AI features can be added here as needed
  };
  
  // Future community-wide settings:
  // branding?: { customTheme: string; logoOverride: string };
  // features?: { enableNotifications: boolean; enableIntegrations: boolean };
  // moderation?: { globalModerationLevel: 'strict' | 'moderate' | 'permissive' };
}

/**
 * Board-level lock gating configuration for multi-lock support
 */
export interface BoardLockGating {
  lockIds: number[]; // Array of lock IDs that apply to this board
  fulfillment: 'any' | 'all'; // Whether user must pass ANY or ALL locks
  verificationDuration?: number; // Custom verification duration in hours (default: 4)
}

/**
 * Board-level settings for access control and features
 */
export interface BoardSettings {
  permissions?: {
    allowedRoles?: string[]; // Role IDs that can access this board (subset of community access)
    locks?: BoardLockGating; // Lock-based gating configuration for write access
    // Future: allowedUsers?: string[]; // Individual user overrides
  };
  
  // AI-powered features configuration at board level
  ai?: {
    autoModeration?: {
      enabled?: boolean;             // Whether AI auto-moderation is enabled for this board (default: false - opt-in)
      inheritCommunitySettings?: boolean; // Whether to inherit community AI settings (default: true)
      enforcementLevel?: 'strict' | 'moderate' | 'lenient'; // Board-specific enforcement level
      customKnowledge?: string;      // Board-specific knowledge base text blob
      maxKnowledgeTokens?: number;   // Token limit for custom knowledge (default: env NEXT_PUBLIC_AI_MAX_KNOWLEDGE_TOKENS or 2000)
      blockViolations?: boolean;     // Whether to block posts with violations (default: true)
      lastUpdatedBy?: string;        // User ID who last updated the settings
      lastUpdatedAt?: string;        // When settings were last updated
    };
  };
  
  // Future board-specific settings:
  // moderation?: { autoModerationLevel: 'strict' | 'moderate' | 'permissive' };
  // notifications?: { emailDigest: boolean; pushNotifications: boolean };
  // appearance?: { theme: string; customCSS: string };
}

/**
 * Universal Profile token requirement for post gating
 */
export interface TokenRequirement {
  contractAddress: string; // LSP7 or LSP8 contract address
  tokenType: 'LSP7' | 'LSP8'; // Token standard type
  minAmount?: string; // Minimum amount in wei (for LSP7 tokens)
  tokenId?: string; // Specific token ID (for LSP8 NFTs)
  name?: string; // Human-readable token name for UI
  symbol?: string; // Token symbol for UI
  decimals?: number; // Token decimals for proper formatting (LSP7 only)
}

/**
 * Universal Profile follower requirement for post gating (LSP26)
 */
export interface FollowerRequirement {
  type: 'minimum_followers' | 'followed_by' | 'following';
  value: string; // For minimum_followers: count, for others: UP address
  description?: string; // Human-readable description
}

/**
 * Universal Profile gating requirements
 */
export interface UPGatingRequirements {
  minLyxBalance?: string; // Minimum LYX balance in wei
  requiredTokens?: TokenRequirement[]; // Required token holdings
  followerRequirements?: FollowerRequirement[]; // LSP26 follower requirements
}

/**
 * Post-level settings for response gating and features
 * Supports both legacy upGating format and new multi-category format
 */
export interface PostSettings {
  responsePermissions?: {
    // Legacy format (backward compatibility)
    upGating?: {
      enabled: boolean; // Whether UP gating is active for this post
      requirements: UPGatingRequirements; // What UP requirements must be met
    };
    
    // New multi-category format
    categories?: GatingCategory[];
    requireAll?: boolean; // If true, user must satisfy ALL categories
    requireAny?: boolean; // If true, user must satisfy ANY category (default)
    
    // Future gating types (legacy approach - will be migrated to categories):
    // socialGating?: { requiredFollows: string[]; }; // LSP26 follow requirements
    // nftGating?: { collections: string[]; }; // NFT collection ownership
    // credentialGating?: { requiredCredentials: string[]; }; // Verifiable credentials
  };
  // Future post-specific settings:
  // moderation?: { requireApproval: boolean; autoFlag: string[]; };
  // visibility?: { hiddenFromFeed: boolean; pinned: boolean; };
}

/**
 * Helper type for settings validation
 */
export interface SettingsValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Get the default maximum knowledge tokens from environment variable
 */
const getDefaultMaxKnowledgeTokens = (): number => {
  const envValue = process.env.NEXT_PUBLIC_AI_MAX_KNOWLEDGE_TOKENS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 2000; // Fallback default
};

/**
 * Common settings utilities
 */
export const SettingsUtils = {
  /**
   * Validates if a settings object conforms to the schema
   */
  validateCommunitySettings: (settings: unknown): SettingsValidationResult => {
    const errors: string[] = [];
    
    if (settings && typeof settings !== 'object') {
      errors.push('Settings must be an object');
      return { isValid: false, errors };
    }
    
    const settingsObj = settings as Record<string, unknown>;
    const permissions = settingsObj?.permissions as Record<string, unknown> | undefined;
    const ai = settingsObj?.ai as Record<string, unknown> | undefined;
    
    if (permissions?.allowedRoles) {
      if (!Array.isArray(permissions.allowedRoles)) {
        errors.push('allowedRoles must be an array');
      } else if (!permissions.allowedRoles.every((role: unknown) => typeof role === 'string')) {
        errors.push('All allowedRoles must be strings');
      }
    }
    
    // Validate AI settings
    if (ai) {
      if (ai.postImprovement && typeof ai.postImprovement !== 'object') {
        errors.push('ai.postImprovement must be an object');
      }
      
      if (ai.autoModeration && typeof ai.autoModeration !== 'object') {
        errors.push('ai.autoModeration must be an object');
      } else if (ai.autoModeration) {
        const autoMod = ai.autoModeration as Record<string, unknown>;
        
        if (autoMod.enabled !== undefined && typeof autoMod.enabled !== 'boolean') {
          errors.push('ai.autoModeration.enabled must be a boolean');
        }
        
        if (autoMod.enforcementLevel !== undefined && 
            !['strict', 'moderate', 'lenient'].includes(autoMod.enforcementLevel as string)) {
          errors.push('ai.autoModeration.enforcementLevel must be "strict", "moderate", or "lenient"');
        }
        
        if (autoMod.customKnowledge !== undefined && typeof autoMod.customKnowledge !== 'string') {
          errors.push('ai.autoModeration.customKnowledge must be a string');
        }
        
        if (autoMod.maxKnowledgeTokens !== undefined && 
            (typeof autoMod.maxKnowledgeTokens !== 'number' || autoMod.maxKnowledgeTokens <= 0)) {
          errors.push('ai.autoModeration.maxKnowledgeTokens must be a positive number');
        }
        
        if (autoMod.blockViolations !== undefined && typeof autoMod.blockViolations !== 'boolean') {
          errors.push('ai.autoModeration.blockViolations must be a boolean');
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  },

  validateBoardSettings: (settings: unknown): SettingsValidationResult => {
    const errors: string[] = [];
    
    if (settings && typeof settings !== 'object') {
      errors.push('Settings must be an object');
      return { isValid: false, errors };
    }
    
    const settingsObj = settings as Record<string, unknown>;
    const permissions = settingsObj?.permissions as Record<string, unknown> | undefined;
    
    if (permissions?.allowedRoles) {
      if (!Array.isArray(permissions.allowedRoles)) {
        errors.push('allowedRoles must be an array');
      } else if (!permissions.allowedRoles.every((role: unknown) => typeof role === 'string')) {
        errors.push('All allowedRoles must be strings');
      }
    }

    // Validate lock gating configuration
    if (permissions?.locks) {
      const locks = permissions.locks as Record<string, unknown>;
      
      if (!Array.isArray(locks.lockIds)) {
        errors.push('locks.lockIds must be an array');
      } else if (!locks.lockIds.every((id: unknown) => typeof id === 'number')) {
        errors.push('All lock IDs must be numbers');
      }
      
      if (locks.fulfillment && !['any', 'all'].includes(locks.fulfillment as string)) {
        errors.push('locks.fulfillment must be "any" or "all"');
      }
      
      if (locks.verificationDuration && (typeof locks.verificationDuration !== 'number' || locks.verificationDuration <= 0)) {
        errors.push('locks.verificationDuration must be a positive number');
      }
    }
    
    return { isValid: errors.length === 0, errors };
  },

  validatePostSettings: (settings: unknown): SettingsValidationResult => {
    const errors: string[] = [];
    
    if (settings && typeof settings !== 'object') {
      errors.push('Settings must be an object');
      return { isValid: false, errors };
    }
    
    const settingsObj = settings as Record<string, unknown>;
    const responsePermissions = settingsObj?.responsePermissions as Record<string, unknown> | undefined;
    const upGating = responsePermissions?.upGating as Record<string, unknown> | undefined;
    const categories = responsePermissions?.categories as unknown[] | undefined;
    
    if (upGating) {
      if (typeof upGating.enabled !== 'boolean') {
        errors.push('upGating.enabled must be a boolean');
      }
      
      const requirements = upGating.requirements as Record<string, unknown> | undefined;
      if (requirements) {
        // Validate minLyxBalance
        if (requirements.minLyxBalance && typeof requirements.minLyxBalance !== 'string') {
          errors.push('minLyxBalance must be a string (wei amount)');
        }
        
        // Validate requiredTokens
        if (requirements.requiredTokens) {
          if (!Array.isArray(requirements.requiredTokens)) {
            errors.push('requiredTokens must be an array');
          } else {
            requirements.requiredTokens.forEach((token: unknown, index: number) => {
              if (!token || typeof token !== 'object') {
                errors.push(`requiredTokens[${index}] must be an object`);
                return;
              }
              
              const tokenObj = token as Record<string, unknown>;
              if (typeof tokenObj.contractAddress !== 'string') {
                errors.push(`requiredTokens[${index}].contractAddress must be a string`);
              }
              if (!['LSP7', 'LSP8'].includes(tokenObj.tokenType as string)) {
                errors.push(`requiredTokens[${index}].tokenType must be 'LSP7' or 'LSP8'`);
              }
              if (tokenObj.minAmount && typeof tokenObj.minAmount !== 'string') {
                errors.push(`requiredTokens[${index}].minAmount must be a string (wei amount)`);
              }
              if (tokenObj.tokenId && typeof tokenObj.tokenId !== 'string') {
                errors.push(`requiredTokens[${index}].tokenId must be a string`);
              }
            });
          }
        }
      }
    }

    // 🚀 NEW: Validate multi-category gating format
    if (categories) {
      if (!Array.isArray(categories)) {
        errors.push('categories must be an array');
      } else {
        categories.forEach((category: unknown, index: number) => {
          if (!category || typeof category !== 'object') {
            errors.push(`categories[${index}] must be an object`);
            return;
          }
          
          const categoryObj = category as Record<string, unknown>;
          
          // Validate type
          if (typeof categoryObj.type !== 'string') {
            errors.push(`categories[${index}].type must be a string`);
          }
          
          // Validate enabled
          if (typeof categoryObj.enabled !== 'boolean') {
            errors.push(`categories[${index}].enabled must be a boolean`);
          }
          
          // 🚀 NEW: Validate fulfillment field
          if (categoryObj.fulfillment !== undefined) {
            if (!['any', 'all'].includes(categoryObj.fulfillment as string)) {
              errors.push(`categories[${index}].fulfillment must be "any" or "all"`);
            }
          }
          
          // Validate requirements exist (category-specific validation could be added later)
          if (categoryObj.requirements === undefined) {
            errors.push(`categories[${index}].requirements is required`);
          }
        });
      }
    }
    
    return { isValid: errors.length === 0, errors };
  },

  /**
   * Creates empty default settings
   */
  getDefaultCommunitySettings: (): CommunitySettings => ({}),
  getDefaultBoardSettings: (): BoardSettings => ({}),
  getDefaultPostSettings: (): PostSettings => ({}),

  /**
   * Checks if settings have any restrictions configured
   */
  hasPermissionRestrictions: (settings: CommunitySettings | BoardSettings): boolean => {
    return !!(settings?.permissions?.allowedRoles?.length);
  },

  // ===== BOARD LOCK GATING UTILITIES =====

  /**
   * Checks if board has lock-based gating enabled
   */
  hasBoardLockGating: (settings: BoardSettings): boolean => {
    return !!(settings?.permissions?.locks?.lockIds?.length);
  },

  /**
   * Gets board lock gating configuration
   */
  getBoardLockGating: (settings: BoardSettings): BoardLockGating | null => {
    if (!SettingsUtils.hasBoardLockGating(settings)) {
      return null;
    }
    return settings.permissions!.locks!;
  },

  /**
   * Gets default board lock gating configuration
   */
  getDefaultBoardLockGating: (): BoardLockGating => ({
    lockIds: [],
    fulfillment: 'any',
    verificationDuration: 4 // 4 hours default
  }),

  /**
   * Checks if board has any access restrictions (role or lock based)
   */
  hasBoardAccessRestrictions: (settings: BoardSettings): boolean => {
    return SettingsUtils.hasPermissionRestrictions(settings) || SettingsUtils.hasBoardLockGating(settings);
  },

  /**
   * Checks if post has Universal Profile gating enabled
   */
  hasUPGating: (settings: PostSettings): boolean => {
    return !!(settings?.responsePermissions?.upGating?.enabled);
  },

  /**
   * Gets UP gating requirements from post settings
   */
  getUPGatingRequirements: (settings: PostSettings): UPGatingRequirements | null => {
    if (!SettingsUtils.hasUPGating(settings)) {
      return null;
    }
    return settings.responsePermissions!.upGating!.requirements;
  },

  // ===== ETHEREUM GATING UTILITIES =====

  /**
   * Checks if post has Ethereum Profile gating enabled (via multi-category format)
   */
  hasEthereumGating: (settings: PostSettings): boolean => {
    const categories = SettingsUtils.getGatingCategories(settings);
    return categories.some(cat => cat.type === 'ethereum_profile' && cat.enabled);
  },

  /**
   * Gets Ethereum gating requirements from post settings
   */
  getEthereumGatingRequirements: (settings: PostSettings): EthereumGatingRequirements | null => {
    const categories = SettingsUtils.getGatingCategories(settings);
    const ethCategory = categories.find(cat => cat.type === 'ethereum_profile' && cat.enabled);
    
    if (!ethCategory) {
      return null;
    }
    
    return ethCategory.requirements as EthereumGatingRequirements;
  },

  /**
   * Gets the Ethereum gating category from post settings
   */
  getEthereumGatingCategory: (settings: PostSettings): GatingCategory | null => {
    const categories = SettingsUtils.getGatingCategories(settings);
    return categories.find(cat => cat.type === 'ethereum_profile' && cat.enabled) || null;
  },

  // ===== MULTI-CATEGORY UTILITIES =====

  /**
   * Checks if post uses the new multi-category gating format
   */
  hasMultiCategoryGating: (settings: PostSettings): boolean => {
    return !!(settings?.responsePermissions?.categories?.length);
  },

  /**
   * Checks if post has any form of gating (legacy or multi-category)
   */
  hasAnyGating: (settings: PostSettings): boolean => {
    return SettingsUtils.hasUPGating(settings) || 
           SettingsUtils.hasEthereumGating(settings) || 
           SettingsUtils.hasMultiCategoryGating(settings);
  },

  /**
   * Gets all gating categories from post settings (converts legacy format if needed)
   */
  getGatingCategories: (settings: PostSettings): GatingCategory[] => {
    // If using new multi-category format, return it directly
    if (SettingsUtils.hasMultiCategoryGating(settings)) {
      return settings.responsePermissions!.categories!;
    }

    // Convert legacy UP gating to category format
    if (SettingsUtils.hasUPGating(settings)) {
      const upGating = settings.responsePermissions!.upGating!;
      return [{
        type: 'universal_profile',
        enabled: upGating.enabled,
        requirements: upGating.requirements
      }];
    }

    return [];
  },

  /**
   * Converts legacy upGating format to new multi-category format
   */
  migrateLegacyToCategories: (settings: PostSettings): PostSettings => {
    // If already using categories, return as-is
    if (SettingsUtils.hasMultiCategoryGating(settings)) {
      return settings;
    }

    // If no gating at all, return as-is
    if (!SettingsUtils.hasUPGating(settings)) {
      return settings;
    }

    // Convert UP gating to category format
    const upGating = settings.responsePermissions!.upGating!;
    const newSettings: PostSettings = {
      ...settings,
      responsePermissions: {
        ...settings.responsePermissions,
        categories: [{
          type: 'universal_profile',
          enabled: upGating.enabled,
          requirements: upGating.requirements
        }],
        requireAny: true, // Default behavior
        // Keep legacy format for backward compatibility
        upGating
      }
    };

    return newSettings;
  },

  /**
   * Converts multi-category format back to legacy format (for backward compatibility)
   */
  extractLegacyFormat: (settings: PostSettings): PostSettings => {
    if (!SettingsUtils.hasMultiCategoryGating(settings)) {
      return settings;
    }

    // Find the Universal Profile category
    const categories = settings.responsePermissions!.categories!;
    const upCategory = categories.find(cat => cat.type === 'universal_profile');

    if (!upCategory) {
      return settings;
    }

    // Extract UP gating to legacy format
    const newSettings: PostSettings = {
      ...settings,
      responsePermissions: {
        ...settings.responsePermissions,
        upGating: {
          enabled: upCategory.enabled,
          requirements: upCategory.requirements as UPGatingRequirements
        }
      }
    };

    return newSettings;
  },

  /**
   * Gets the display mode for gating categories
   */
  getGatingDisplayMode: (settings: PostSettings): 'legacy' | 'multi-category' | 'none' => {
    if (SettingsUtils.hasMultiCategoryGating(settings)) {
      return 'multi-category';
    }
    if (SettingsUtils.hasUPGating(settings)) {
      return 'legacy';
    }
    return 'none';
  },

    // ===== AI AUTO-MODERATION UTILITIES =====

  /**
   * Checks if AI auto-moderation is enabled for the community
   * Default is FALSE (opt-in)
   */
  isAIAutoModerationEnabled: (settings: CommunitySettings, userRoles?: string[]): boolean => {
    const aiConfig = settings?.ai?.autoModeration;
    
    // If no AI config exists, default to DISABLED (opt-in)
    if (!aiConfig) {
      return false;
    }
    
    // If explicitly disabled, return false
    if (aiConfig.enabled === false) {
      return false;
    }
    
    // Must be explicitly enabled
    if (aiConfig.enabled !== true) {
      return false;
    }
    
    // Check role restrictions if specified
    if (aiConfig.requiresRole && aiConfig.requiresRole.length > 0 && userRoles) {
      const hasRequiredRole = aiConfig.requiresRole.some(role => userRoles.includes(role));
      if (!hasRequiredRole) {
        return false;
      }
    }
    
    return true;
  },

  /**
   * Checks if AI auto-moderation is enabled for a specific board
   * Takes into account both community and board-level settings
   */
  isAIAutoModerationEnabledForBoard: (
    communitySettings: CommunitySettings, 
    boardSettings: BoardSettings,
    userRoles?: string[]
  ): boolean => {
    const boardAIConfig = boardSettings?.ai?.autoModeration;
    
    // If board has explicit settings and doesn't inherit community settings
    if (boardAIConfig && boardAIConfig.inheritCommunitySettings === false) {
      // Use board-specific settings only
      if (boardAIConfig.enabled === false) {
        return false;
      }
      
      if (boardAIConfig.enabled !== true) {
        return false;
      }
      
      // Board-level role restrictions would go here if implemented
      return true;
    }
    
    // Default: inherit from community settings
    return SettingsUtils.isAIAutoModerationEnabled(communitySettings, userRoles);
  },

  /**
   * Gets aggregated AI auto-moderation configuration from community and board settings
   */
  getAIAutoModerationConfig: (
    communitySettings: CommunitySettings, 
    boardSettings?: BoardSettings
  ) => {
    const communityAIConfig = communitySettings?.ai?.autoModeration;
    const boardAIConfig = boardSettings?.ai?.autoModeration;
    
    // If board has explicit settings and doesn't inherit community settings
    if (boardAIConfig && boardAIConfig.inheritCommunitySettings === false) {
      return {
        enabled: boardAIConfig.enabled === true,
        enforcementLevel: boardAIConfig.enforcementLevel || 'moderate',
        customKnowledge: boardAIConfig.customKnowledge || '',
        maxKnowledgeTokens: boardAIConfig.maxKnowledgeTokens || getDefaultMaxKnowledgeTokens(),
        blockViolations: boardAIConfig.blockViolations !== false, // Default true
        source: 'board' as const
      };
    }
    
    // Use community settings (with potential board overrides)
    const baseConfig = {
      enabled: communityAIConfig?.enabled === true,
      enforcementLevel: communityAIConfig?.enforcementLevel || 'moderate',
      customKnowledge: communityAIConfig?.customKnowledge || '',
      maxKnowledgeTokens: communityAIConfig?.maxKnowledgeTokens || getDefaultMaxKnowledgeTokens(),
      blockViolations: communityAIConfig?.blockViolations !== false, // Default true
      source: 'community' as const
    };
    
    // Apply board-level overrides if they exist and inherit is true
    if (boardAIConfig && boardAIConfig.inheritCommunitySettings !== false) {
      return {
        ...baseConfig,
        enforcementLevel: boardAIConfig.enforcementLevel || baseConfig.enforcementLevel,
        customKnowledge: boardAIConfig.customKnowledge !== undefined 
          ? `${baseConfig.customKnowledge}\n\n--- Board-Specific Context ---\n${boardAIConfig.customKnowledge}`.trim()
          : baseConfig.customKnowledge,
        blockViolations: boardAIConfig.blockViolations !== undefined 
          ? boardAIConfig.blockViolations 
          : baseConfig.blockViolations,
        source: 'combined' as const
      };
    }
    
    return baseConfig;
  },

  /**
   * Gets default AI auto-moderation configuration
   */
  getDefaultAIAutoModerationConfig: () => ({
    enabled: false, // Opt-in
    enforcementLevel: 'moderate' as const,
    customKnowledge: '',
    maxKnowledgeTokens: getDefaultMaxKnowledgeTokens(),
    blockViolations: true
  })
}; 