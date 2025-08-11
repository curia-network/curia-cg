"use strict";
/**
 * LUKSO Marketplace Links Utility
 *
 * Generates deterministic marketplace URLs for LSP7 and LSP8 tokens
 * Based on o5-lukso-marketplace.md and o5-lukso-marketplace-lsp8.md
 *
 * Supports:
 * - LSP7: UniversalSwaps (trade + info)
 * - LSP8: Universal.page (collection + item) + UniversalEverything (viewer)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_TOKENS = void 0;
exports.generateMarketplaceLinks = generateMarketplaceLinks;
exports.getPrimaryMarketplaceUrl = getPrimaryMarketplaceUrl;
exports.getMarketplaceLinksFromRequirement = getMarketplaceLinksFromRequirement;
exports.isValidAddress = isValidAddress;
exports.isValidMarketplaceUrl = isValidMarketplaceUrl;
const ethers_1 = require("ethers");
// ===== CONSTANTS =====
const LUKSO_CHAIN_ID = 42; // LUKSO mainnet (for reference)
// Marketplace base URLs
const UNIVERSAL_SWAPS_BASE = 'https://universalswaps.io';
const UNIVERSAL_SWAPS_INFO_BASE = 'https://info.universalswaps.io';
const UNIVERSAL_PAGE_BASE = 'https://universal.page';
const UNIVERSAL_EVERYTHING_BASE = 'https://universaleverything.io';
// ===== MAIN FUNCTIONS =====
/**
 * Generate comprehensive marketplace links for a token
 *
 * @param metadata - Token metadata with standard, address, and optional tokenId
 * @returns Object with all relevant marketplace URLs
 */
function generateMarketplaceLinks(metadata) {
    const addr = ethers_1.ethers.utils.getAddress(metadata.address);
    if (metadata.standard === 'LSP7') {
        return generateLSP7Links(addr);
    }
    else {
        return generateLSP8Links(addr, metadata.tokenId);
    }
}
/**
 * Get the primary marketplace URL (most important for acquisition)
 *
 * @param metadata - Token metadata
 * @returns Primary marketplace URL for token acquisition
 */
function getPrimaryMarketplaceUrl(metadata) {
    const links = generateMarketplaceLinks(metadata);
    return links.primary;
}
/**
 * Convert lock creation modal token requirement to marketplace links
 * This is the main integration point with our existing lock system
 *
 * @param requirement - Token requirement from lock configurator
 * @returns Marketplace links for the token
 */
function getMarketplaceLinksFromRequirement(requirement) {
    const metadata = {
        standard: requirement.tokenType,
        address: requirement.contractAddress,
        tokenId: requirement.tokenId
    };
    return generateMarketplaceLinks(metadata);
}
// ===== LSP7 MARKETPLACE INTEGRATION =====
/**
 * Generate LSP7 marketplace links (UniversalSwaps)
 */
function generateLSP7Links(checksumAddress) {
    const trade = `${UNIVERSAL_SWAPS_BASE}/tokens/lukso/${checksumAddress}`;
    const info = `${UNIVERSAL_SWAPS_INFO_BASE}/#/tokens/${checksumAddress}`;
    return {
        primary: trade, // Trade page is primary for LSP7
        trade,
        info
    };
}
// ===== LSP8 MARKETPLACE INTEGRATION =====
/**
 * Generate LSP8 marketplace links (Universal.page + UniversalEverything)
 */
function generateLSP8Links(checksumAddress, tokenId) {
    const collection = `${UNIVERSAL_PAGE_BASE}/collections/lukso/${checksumAddress}`;
    // If no tokenId, collection page is primary
    if (tokenId === undefined || tokenId === null) {
        return {
            primary: collection,
            collection
        };
    }
    // Generate item and viewer URLs for specific token
    const universalPageTokenId = formatTokenIdForUniversalPage(tokenId);
    const item = `${collection}/${universalPageTokenId}`;
    const bytes32TokenId = formatTokenIdAsBytes32(tokenId);
    const viewer = `${UNIVERSAL_EVERYTHING_BASE}/asset/${checksumAddress}/tokenId/${bytes32TokenId}`;
    return {
        primary: item, // Item page is primary when tokenId is specified
        collection,
        item,
        viewer
    };
}
// ===== LSP8 TOKEN ID FORMATTING =====
/**
 * Format token ID for Universal.page URLs
 * Universal.page accepts both decimal and 0x-prefixed hex in the path
 */
function formatTokenIdForUniversalPage(tokenId) {
    // If already 0x hex, use as-is (ensure proper hex format)
    if (typeof tokenId === 'string' && tokenId.startsWith('0x')) {
        return ensureValidHex32(tokenId);
    }
    // For numbers (bigint or number), convert to decimal string
    if (typeof tokenId === 'bigint' || typeof tokenId === 'number') {
        return String(tokenId);
    }
    // For decimal strings, use as-is
    if (typeof tokenId === 'string' && /^\d+$/.test(tokenId)) {
        return tokenId;
    }
    // For other strings (labels), convert to bytes32 hex
    return ensureValidHex32(stringToBytes32Hex(tokenId));
}
/**
 * Format token ID as 32-byte hex for UniversalEverything viewer
 */
function formatTokenIdAsBytes32(tokenId) {
    // If already 0x hex, ensure it's padded to 32 bytes
    if (typeof tokenId === 'string' && tokenId.startsWith('0x')) {
        return ensureValidHex32(tokenId);
    }
    // For numbers, convert to hex and pad
    if (typeof tokenId === 'bigint' || typeof tokenId === 'number') {
        const n = BigInt(tokenId);
        return '0x' + n.toString(16).padStart(64, '0');
    }
    // For decimal strings, convert to BigInt then hex
    if (typeof tokenId === 'string' && /^\d+$/.test(tokenId)) {
        const n = BigInt(tokenId);
        return '0x' + n.toString(16).padStart(64, '0');
    }
    // For other strings, convert to UTF-8 bytes then hex
    return ensureValidHex32(stringToBytes32Hex(tokenId));
}
/**
 * Convert string to 32-byte hex representation
 */
function stringToBytes32Hex(text) {
    const bytes = new TextEncoder().encode(text);
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    // Pad to 32 bytes (64 hex chars) and truncate if longer
    return '0x' + hex.padStart(64, '0').slice(0, 64);
}
/**
 * Ensure hex string is valid and properly formatted as 32 bytes
 */
function ensureValidHex32(hex) {
    const clean = hex.toLowerCase().startsWith('0x') ? hex.slice(2) : hex;
    // Validate hex characters
    if (!/^[0-9a-f]*$/i.test(clean)) {
        throw new Error(`Invalid hex string for tokenId: ${hex}`);
    }
    // Pad to 32 bytes (64 hex characters)
    return '0x' + clean.padStart(64, '0').slice(-64);
}
// ===== VALIDATION HELPERS =====
/**
 * Validate that an address is a valid Ethereum address
 */
function isValidAddress(address) {
    try {
        ethers_1.ethers.utils.getAddress(address);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Validate marketplace URL format
 */
function isValidMarketplaceUrl(url) {
    try {
        const urlObj = new URL(url);
        // Require HTTPS for security
        return urlObj.protocol === 'https:';
    }
    catch {
        return false;
    }
}
// ===== UTILITY EXPORTS FOR TESTING =====
exports.TEST_TOKENS = {
    // Real LUKSO tokens for testing
    LSP7_FISH: {
        standard: 'LSP7',
        address: '0xf76253bddf123543716092e77fc08ba81d63ff38',
        name: 'Fish',
        symbol: 'FISH'
    },
    LSP7_JAN: {
        standard: 'LSP7',
        address: '0xf4272e04412f38ec7e4d2e0bc3c63db8e281533a',
        name: 'Jan Buy',
        symbol: 'JAN'
    },
    LSP8_BASED_COLLECTION: {
        standard: 'LSP8',
        address: '0x2b2eb8848d04c003231e4b905d5db6ebc0c02fa4',
        name: 'Based Baristas',
        symbol: 'BASED'
    },
    LSP8_BASED_SPECIFIC: {
        standard: 'LSP8',
        address: '0x2b2eb8848d04c003231e4b905d5db6ebc0c02fa4',
        tokenId: 4222,
        name: 'Based Baristas #4222'
    },
    LSP8_BASED_HEX: {
        standard: 'LSP8',
        address: '0x2b2eb8848d04c003231e4b905d5db6ebc0c02fa4',
        tokenId: '0x000000000000000000000000000000000000000000000000000000000000107e',
        name: 'Based Baristas #4222 (hex)'
    }
};
