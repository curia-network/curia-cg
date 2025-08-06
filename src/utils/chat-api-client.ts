/**
 * Chat API client for IRC user provisioning and channel management
 * Moved from curia-chat-modal package to curia app for better architecture
 */

import { authFetchJson } from './authFetch';

export interface IrcCredentials {
  success: boolean;
  ircUsername: string;
  ircPassword: string;
  networkName: string;
}

/**
 * Call the IRC user provisioning endpoint to get credentials for The Lounge
 * This endpoint validates JWT, creates/updates Soju IRC user, and returns login credentials
 * MOVED FROM: curia-chat-modal package to improve architecture
 */
export async function provisionIrcUser(
  authToken: string,
  chatBaseUrl?: string,
  curiaBaseUrl?: string
): Promise<IrcCredentials> {
  // Use curiaBaseUrl for API calls, fallback to relative path for same-origin
  const endpoint = curiaBaseUrl ? `${curiaBaseUrl}/api/irc-user-provision` : '/api/irc-user-provision';
  
  try {
    console.log('[Chat Session] Starting IRC user provisioning...');
    
    const credentials = await authFetchJson<IrcCredentials>(endpoint, {
      method: 'POST',
      token: authToken,
    });

    console.log('[Chat Session] IRC provisioning successful');
    
    if (!credentials.success) {
      throw new Error('IRC provisioning failed: Invalid response format');
    }

    return credentials;
  } catch (error) {
    console.error('[Chat Session] IRC provisioning error:', error instanceof Error ? error.message : error);
    
    // Re-throw with more context for better error handling
    if (error instanceof Error) {
      throw new Error(`IRC provisioning failed: ${error.message}`);
    }
    throw new Error('IRC provisioning failed: Unknown error');
  }
}