import { query } from '../db';
import { ApiChatChannel, CreateChatChannelRequest, UpdateChatChannelRequest, ChatChannelRow } from '../../types/chatChannels';
import { transformChannelRow, generateIrcChannelName, isIrcChannelNameUnique } from '../chatChannelPermissions';

/**
 * Centralized database query utilities for chat channels
 * Mirrors the pattern used in enrichedPosts.ts for consistency
 */
export class ChatChannelQueries {
  /**
   * Get all chat channels for a community, ordered by default first, then by name
   * @param communityId - The community ID
   * @returns Promise<ApiChatChannel[]> array of channels
   */
  static async getChannelsByCommunity(communityId: string): Promise<ApiChatChannel[]> {
    const result = await query(`
      SELECT id, community_id, name, description, irc_channel_name,
             is_single_mode, is_default, settings, created_at, updated_at
      FROM chat_channels 
      WHERE community_id = $1
      ORDER BY is_default DESC, name ASC
    `, [communityId]);
    
    return result.rows.map((row: ChatChannelRow) => transformChannelRow(row));
  }

  /**
   * Get a single chat channel by ID and community
   * @param channelId - The channel ID
   * @param communityId - The community ID
   * @returns Promise<ApiChatChannel | null> the channel or null if not found
   */
  static async getChannelById(channelId: number, communityId: string): Promise<ApiChatChannel | null> {
    const result = await query(`
      SELECT id, community_id, name, description, irc_channel_name,
             is_single_mode, is_default, settings, created_at, updated_at
      FROM chat_channels 
      WHERE id = $1 AND community_id = $2
    `, [channelId, communityId]);

    if (result.rows.length === 0) {
      return null;
    }

    return transformChannelRow(result.rows[0] as ChatChannelRow);
  }

  /**
   * Create a new chat channel
   * @param data - Channel creation data including community_id
   * @returns Promise<ApiChatChannel> the created channel
   */
  static async createChannel(data: CreateChatChannelRequest & { community_id: string }): Promise<ApiChatChannel> {
    const {
      community_id,
      name,
      description = null,
      irc_channel_name,
      is_single_mode = true,
      is_default = false,
      settings = {}
    } = data;

    // Auto-generate IRC channel name if not provided
    let finalIrcChannelName = irc_channel_name || generateIrcChannelName(name);
    
    // Ensure IRC channel name is unique by appending numbers if needed
    let counter = 1;
    const baseIrcChannelName = finalIrcChannelName;
    while (!(await isIrcChannelNameUnique(finalIrcChannelName, community_id))) {
      finalIrcChannelName = `${baseIrcChannelName}-${counter}`;
      counter++;
    }

    const result = await query(`
      INSERT INTO chat_channels (
        community_id, name, description, irc_channel_name, 
        is_single_mode, is_default, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *
    `, [
      community_id,
      name.trim(),
      description?.trim() || null,
      finalIrcChannelName,
      is_single_mode,
      is_default,
      JSON.stringify(settings)
    ]);

    return transformChannelRow(result.rows[0] as ChatChannelRow);
  }

  /**
   * Update an existing chat channel
   * @param channelId - The channel ID to update
   * @param communityId - The community ID (for security)
   * @param data - Update data
   * @returns Promise<ApiChatChannel | null> the updated channel or null if not found
   */
  static async updateChannel(
    channelId: number, 
    communityId: string, 
    data: UpdateChatChannelRequest
  ): Promise<ApiChatChannel | null> {
    const {
      name,
      description,
      irc_channel_name,
      is_single_mode,
      is_default,
      settings
    } = data;

    // If IRC channel name is being updated, ensure uniqueness
    if (irc_channel_name && !(await isIrcChannelNameUnique(irc_channel_name, communityId, channelId))) {
      throw new Error('IRC channel name already exists in this community');
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramCounter = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCounter++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramCounter++}`);
      values.push(description?.trim() || null);
    }
    if (irc_channel_name !== undefined) {
      updateFields.push(`irc_channel_name = $${paramCounter++}`);
      values.push(irc_channel_name);
    }
    if (is_single_mode !== undefined) {
      updateFields.push(`is_single_mode = $${paramCounter++}`);
      values.push(is_single_mode);
    }
    if (is_default !== undefined) {
      updateFields.push(`is_default = $${paramCounter++}`);
      values.push(is_default);
    }
    if (settings !== undefined) {
      updateFields.push(`settings = $${paramCounter++}`);
      values.push(JSON.stringify(settings));
    }

    // Always update the updated_at timestamp
    updateFields.push('updated_at = NOW()');

    // Add WHERE clause parameters
    values.push(channelId, communityId);

    const queryText = `
      UPDATE chat_channels 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCounter++} AND community_id = $${paramCounter++}
      RETURNING *
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return null;
    }

    return transformChannelRow(result.rows[0] as ChatChannelRow);
  }

  /**
   * Delete a chat channel
   * @param channelId - The channel ID to delete
   * @param communityId - The community ID (for security)
   * @returns Promise<boolean> true if deleted, false if not found
   */
  static async deleteChannel(channelId: number, communityId: string): Promise<boolean> {
    const result = await query(`
      DELETE FROM chat_channels 
      WHERE id = $1 AND community_id = $2
      RETURNING name
    `, [channelId, communityId]);

    return result.rows.length > 0;
  }

  /**
   * Check if a channel name is unique within a community
   * @param name - The channel name to check
   * @param communityId - The community ID
   * @param excludeChannelId - Optional channel ID to exclude from check
   * @returns Promise<boolean> true if unique, false if duplicate
   */
  static async isChannelNameUnique(
    name: string, 
    communityId: string, 
    excludeChannelId?: number
  ): Promise<boolean> {
    let queryText = `
      SELECT id FROM chat_channels 
      WHERE community_id = $1 AND LOWER(name) = LOWER($2)
    `;
    const params: (string | number)[] = [communityId, name];

    if (excludeChannelId) {
      queryText += ' AND id != $3';
      params.push(excludeChannelId);
    }

    const result = await query(queryText, params);
    return result.rows.length === 0;
  }

  /**
   * Get the default channel for a community
   * @param communityId - The community ID
   * @returns Promise<ApiChatChannel | null> the default channel or null if none
   */
  static async getDefaultChannel(communityId: string): Promise<ApiChatChannel | null> {
    const result = await query(`
      SELECT id, community_id, name, description, irc_channel_name,
             is_single_mode, is_default, settings, created_at, updated_at
      FROM chat_channels 
      WHERE community_id = $1 AND is_default = true
      LIMIT 1
    `, [communityId]);

    if (result.rows.length === 0) {
      return null;
    }

    return transformChannelRow(result.rows[0] as ChatChannelRow);
  }

  /**
   * Create a default "general" channel for a new community
   * @param communityId - The community ID
   * @returns Promise<ApiChatChannel> the created default channel
   */
  static async createDefaultChannel(communityId: string): Promise<ApiChatChannel> {
    return this.createChannel({
      community_id: communityId,
      name: 'General',
      description: 'General discussion channel',
      irc_channel_name: 'general',
      is_single_mode: true,
      is_default: true,
      settings: {
        permissions: {
          // No role restrictions - public to all community members
        },
        irc: {
          autoconnect: true,
          lockchannel: true,
          nofocus: true,
          welcomeMessage: 'Welcome to the general chat!'
        },
        ui: {
          defaultTheme: 'auto',
          allowThemeSwitch: true,
          showUserList: true,
          allowMentions: true
        }
      }
    });
  }
}