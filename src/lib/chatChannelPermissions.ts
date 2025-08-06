import { ChatChannelSettings, ApiChatChannel, ChatChannelRow } from '../types/chatChannels';
import { query } from './db';

/**
 * Determines if a user can access a specific chat channel based on their roles and admin status
 * @param userRoles - Array of role IDs that the user has
 * @param channelSettings - Channel settings object containing permissions
 * @param isAdmin - Whether the user has admin privileges
 * @returns boolean indicating if user can access the channel
 */
export function canUserAccessChatChannel(
  userRoles: string[] | undefined, 
  channelSettings: ChatChannelSettings | Record<string, unknown>, 
  isAdmin: boolean = false
): boolean {
  // Admins can access everything
  if (isAdmin) {
    return true;
  }
  
  // Type guard to check if settings has the expected structure
  const permissions = channelSettings && typeof channelSettings === 'object' && 'permissions' in channelSettings
    ? (channelSettings as ChatChannelSettings).permissions
    : undefined;
  
  // If no permission restrictions exist, channel is public to all community members
  if (!permissions?.allowedRoles || 
      !Array.isArray(permissions.allowedRoles) ||
      permissions.allowedRoles.length === 0) {
    return true;
  }
  
  // If user has no roles, they can't access gated channels
  if (!userRoles || userRoles.length === 0) {
    return false;
  }
  
  // Check if user has any of the required roles for this channel
  const allowedRoles = permissions.allowedRoles;
  return userRoles.some(userRole => allowedRoles.includes(userRole));
}

/**
 * Filters an array of chat channels to only include those the user can access
 * @param channels - Array of channel objects with settings
 * @param userRoles - Array of role IDs that the user has
 * @param isAdmin - Whether the user has admin privileges
 * @returns Filtered array of accessible channels
 */
export function filterAccessibleChatChannels<T extends { settings: ChatChannelSettings | Record<string, unknown> }>(
  channels: T[], 
  userRoles: string[] | undefined, 
  isAdmin: boolean = false
): T[] {
  return channels.filter(channel => 
    canUserAccessChatChannel(userRoles, channel.settings, isAdmin)
  );
}

/**
 * Gets accessible chat channel IDs for use in SQL queries
 * @param channels - Array of channel objects with id and settings
 * @param userRoles - Array of role IDs that the user has  
 * @param isAdmin - Whether the user has admin privileges
 * @returns Array of channel IDs that the user can access
 */
export function getAccessibleChatChannelIds(
  channels: Array<{ id: number; settings: ChatChannelSettings | Record<string, unknown> }>, 
  userRoles: string[] | undefined, 
  isAdmin: boolean = false
): number[] {
  return channels
    .filter(channel => canUserAccessChatChannel(userRoles, channel.settings, isAdmin))
    .map(channel => channel.id);
}

/**
 * Resolves a chat channel by ID and community, checking if it exists and belongs to the community
 * @param channelId - The channel ID to resolve
 * @param communityId - The community ID to check against
 * @returns The channel data if found and belongs to community, null otherwise
 */
export async function resolveChannel(channelId: number, communityId: string): Promise<ApiChatChannel | null> {
  try {
    const result = await query(`
      SELECT id, community_id, name, description, irc_channel_name,
             is_single_mode, is_default, settings, created_at, updated_at
      FROM chat_channels 
      WHERE id = $1 AND community_id = $2
    `, [channelId, communityId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as ChatChannelRow;
    return transformChannelRow(row);
  } catch (error) {
    console.error(`[chatChannelPermissions] Error resolving channel ${channelId}:`, error);
    return null;
  }
}

/**
 * Transforms a database row into an ApiChatChannel object
 * @param row - Raw database row from chat_channels table
 * @returns Transformed ApiChatChannel object
 */
export function transformChannelRow(row: ChatChannelRow): ApiChatChannel {
  return {
    id: row.id,
    community_id: row.community_id,
    name: row.name,
    description: row.description,
    irc_channel_name: row.irc_channel_name,
    is_single_mode: row.is_single_mode,
    is_default: row.is_default,
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Auto-generates an IRC channel name from a display name
 * @param displayName - The human-readable channel name
 * @returns URL-safe IRC channel name
 */
export function generateIrcChannelName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
}

/**
 * Checks if an IRC channel name is unique within a community
 * @param ircChannelName - The IRC channel name to check
 * @param communityId - The community to check within
 * @param excludeChannelId - Optional channel ID to exclude from check (for updates)
 * @returns Promise<boolean> indicating if the name is unique
 */
export async function isIrcChannelNameUnique(
  ircChannelName: string, 
  communityId: string, 
  excludeChannelId?: number
): Promise<boolean> {
  try {
    let queryText = `
      SELECT id FROM chat_channels 
      WHERE community_id = $1 AND LOWER(irc_channel_name) = LOWER($2)
    `;
    const params: (string | number)[] = [communityId, ircChannelName];

    if (excludeChannelId) {
      queryText += ' AND id != $3';
      params.push(excludeChannelId);
    }

    const result = await query(queryText, params);
    return result.rows.length === 0;
  } catch (error) {
    console.error('[chatChannelPermissions] Error checking IRC channel name uniqueness:', error);
    return false;
  }
}