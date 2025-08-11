/**
 * Token Marketplace Integration Utility
 * 
 * Bridges the marketplace links utility with our token requirement system
 * Provides backwards-compatible marketplace link access for existing and new locks
 */

import { 
  generateMarketplaceLinks, 
  getPrimaryMarketplaceUrl,
  type TokenMarketplaceLinks as UtilityMarketplaceLinks
} from './marketplaceLinks';
import { type TokenRequirement, type TokenMarketplaceLinks } from '../../types/gating';

// ===== BACKWARDS COMPATIBILITY FUNCTIONS =====

/**
 * Get marketplace links for a token requirement with fallback generation
 * 
 * @param requirement - Token requirement from lock configuration
 * @returns Marketplace links (stored or generated on-demand)
 */
export function getTokenMarketplaceLinks(requirement: TokenRequirement): TokenMarketplaceLinks {
  // Use stored links if available (new locks)
  if (requirement.marketplaceLinks) {
    return requirement.marketplaceLinks;
  }
  
  // Fallback: Generate links on-demand from utility (existing locks)
  const utilityLinks = generateMarketplaceLinks({
    standard: requirement.tokenType,
    address: requirement.contractAddress,
    tokenId: requirement.tokenId
  });
  
  // Convert utility format to our interface format
  return convertUtilityLinksToTokenLinks(utilityLinks);
}

/**
 * Get the primary marketplace URL for a token requirement
 * 
 * @param requirement - Token requirement from lock configuration
 * @returns Primary marketplace URL for token acquisition
 */
export function getTokenPrimaryMarketplaceUrl(requirement: TokenRequirement): string {
  // Check for stored custom URL first
  if (requirement.marketplaceLinks?.custom) {
    return requirement.marketplaceLinks.custom;
  }
  
  // Use stored primary URL if available
  if (requirement.marketplaceLinks?.primary) {
    return requirement.marketplaceLinks.primary;
  }
  
  // Fallback: Generate primary URL on-demand
  return getPrimaryMarketplaceUrl({
    standard: requirement.tokenType,
    address: requirement.contractAddress,
    tokenId: requirement.tokenId
  });
}

// ===== LOCK CREATION HELPERS =====

/**
 * Generate and attach marketplace links to a token requirement
 * Used during lock creation/editing to populate marketplace links
 * 
 * @param requirement - Token requirement to enhance
 * @returns Enhanced token requirement with marketplace links
 */
export function enhanceTokenRequirementWithMarketplace(
  requirement: TokenRequirement
): TokenRequirement {
  // Don't override existing marketplace links
  if (requirement.marketplaceLinks) {
    return requirement;
  }
  
  try {
    const utilityLinks = generateMarketplaceLinks({
      standard: requirement.tokenType,
      address: requirement.contractAddress,
      tokenId: requirement.tokenId
    });
    
    return {
      ...requirement,
      marketplaceLinks: convertUtilityLinksToTokenLinks(utilityLinks)
    };
  } catch (error) {
    console.warn('[Token Marketplace] Failed to generate marketplace links:', error);
    return requirement; // Return unchanged if generation fails
  }
}

/**
 * Enhance multiple token requirements with marketplace links
 * 
 * @param requirements - Array of token requirements
 * @returns Array of enhanced token requirements
 */
export function enhanceTokenRequirementsWithMarketplace(
  requirements: TokenRequirement[]
): TokenRequirement[] {
  return requirements.map(enhanceTokenRequirementWithMarketplace);
}

// ===== METADATA HELPERS =====

/**
 * Get effective token metadata with manual override support
 * 
 * @param requirement - Token requirement with potential manual metadata
 * @returns Effective metadata (manual overrides take precedence)
 */
export function getEffectiveTokenMetadata(requirement: TokenRequirement) {
  return {
    name: requirement.manualMetadata?.name ?? requirement.name,
    symbol: requirement.manualMetadata?.symbol ?? requirement.symbol,
    decimals: requirement.manualMetadata?.decimals ?? requirement.decimals,
    contractAddress: requirement.contractAddress,
    tokenType: requirement.tokenType,
    minAmount: requirement.minAmount,
    tokenId: requirement.tokenId
  };
}

/**
 * Check if a token requirement has any manual metadata overrides
 * 
 * @param requirement - Token requirement to check
 * @returns True if manual metadata is present
 */
export function hasManualMetadataOverrides(requirement: TokenRequirement): boolean {
  return !!(
    requirement.manualMetadata?.name ||
    requirement.manualMetadata?.symbol ||
    requirement.manualMetadata?.decimals !== undefined
  );
}

// ===== INTERNAL UTILITIES =====

/**
 * Convert marketplace utility links format to our token links format
 */
function convertUtilityLinksToTokenLinks(
  utilityLinks: UtilityMarketplaceLinks
): TokenMarketplaceLinks {
  return {
    primary: utilityLinks.primary,
    trade: utilityLinks.trade,
    info: utilityLinks.info,
    collection: utilityLinks.collection,
    item: utilityLinks.item,
    viewer: utilityLinks.viewer
    // custom is not set during generation, only through manual user input
  };
}

// ===== CSV INTEGRATION =====

/**
 * Generate marketplace links for CSV import token requirements
 * 
 * @param tokenType - LSP7 or LSP8
 * @param contractAddress - Token contract address
 * @param tokenId - Optional token ID for LSP8
 * @returns TokenMarketplaceLinks for CSV import
 */
export function generateMarketplaceLinksForCSV(
  tokenType: 'LSP7' | 'LSP8',
  contractAddress: string,
  tokenId?: string
): TokenMarketplaceLinks {
  const utilityLinks = generateMarketplaceLinks({
    standard: tokenType,
    address: contractAddress,
    tokenId
  });
  
  return convertUtilityLinksToTokenLinks(utilityLinks);
}

// ===== EXPORTS FOR COMPONENT USE =====

export {
  // Re-export types for convenience
  type TokenMarketplaceLinks,
  type TokenRequirement
};

// Re-export validation utilities from marketplace utility
export {
  isValidAddress,
  isValidMarketplaceUrl
} from './marketplaceLinks';
