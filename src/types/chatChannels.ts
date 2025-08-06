import { BoardSettings } from './settings';

/**
 * Chat channel settings extending board settings with IRC-specific options
 */
export interface ChatChannelSettings extends Omit<BoardSettings, 'ai'> {
  irc?: {
    autoconnect?: boolean;
    lockchannel?: boolean;
    nofocus?: boolean;
    welcomeMessage?: string;
    topic?: string;
  };
  ui?: {
    defaultTheme?: 'auto' | 'light' | 'dark';
    allowThemeSwitch?: boolean;
    showUserList?: boolean;
    allowMentions?: boolean;
  };
}

/**
 * API response interface for chat channels (mirrors ApiBoard structure)
 */
export interface ApiChatChannel {
  id: number;
  community_id: string;
  name: string;
  description: string | null;
  irc_channel_name: string;
  is_single_mode: boolean;
  is_default: boolean;
  settings: ChatChannelSettings;
  created_at: string;
  updated_at: string;
  // Computed fields:
  user_can_access?: boolean;  // Based on current user's roles (after community access)
  user_can_join?: boolean;    // Future: differentiate read vs join access
}

/**
 * Request interface for creating new chat channels
 */
export interface CreateChatChannelRequest {
  name: string;
  description?: string;
  irc_channel_name?: string; // Auto-generated if not provided
  is_single_mode?: boolean;
  is_default?: boolean;
  settings?: ChatChannelSettings;
}

/**
 * Request interface for updating existing chat channels
 */
export interface UpdateChatChannelRequest {
  name?: string;
  description?: string;
  irc_channel_name?: string;
  is_single_mode?: boolean;
  is_default?: boolean;
  settings?: ChatChannelSettings;
}

/**
 * Database row interface for chat_channels table
 */
export interface ChatChannelRow {
  id: number;
  community_id: string;
  name: string;
  description: string | null;
  irc_channel_name: string;
  is_single_mode: boolean;
  is_default: boolean;
  settings: string | Record<string, unknown>; // JSON or parsed object
  created_at: string;
  updated_at: string;
}