/**
 * Chat Session Hook - IRC Provisioning and Channel Management
 * 
 * This hook moves IRC provisioning and channel fetching from the chat modal
 * to the Curia app for better architecture and performance.
 * 
 * Benefits:
 * - Provisions IRC credentials once per session (not every modal open)
 * - Caches channel data to avoid repeated API calls
 * - Eliminates 2-3 second delay when opening chat modal
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authFetchJson } from '@/utils/authFetch';
import { provisionIrcUser, type IrcCredentials } from '@/utils/chat-api-client';
import type { ApiChatChannel } from '@/types/chatChannels';
import { toast } from 'sonner';

export interface ChatSessionData {
  ircCredentials: IrcCredentials;
  channels: ApiChatChannel[];
  defaultChannel: ApiChatChannel;
}

export interface UseChatSessionReturn {
  sessionData: ChatSessionData | null;
  isInitialized: boolean;
  isLoading: boolean;
  initError: string | null;
  retryCount: number;
  isRetrying: boolean;
  // Helper to get channel by ID
  getChannelById: (channelId: number) => ApiChatChannel | undefined;
  // Manual retry function
  retryInitialization: () => void;
}

/**
 * Initialize chat session with IRC provisioning and channel fetching
 * This runs once when the user is authenticated, not every modal open
 */
export function useChatSession(): UseChatSessionReturn {
  const { user, token } = useAuth();
  const [sessionData, setSessionData] = useState<ChatSessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  // Retry logic with exponential backoff (3 attempts total)
  const initializeSessionWithRetry = useCallback(async (attemptNumber = 1): Promise<void> => {
    try {
      setIsLoading(attemptNumber === 1);
      setIsRetrying(attemptNumber > 1);
      setRetryCount(attemptNumber);
      setInitError(null);
      
      console.log(`[Chat Session] Starting session initialization (attempt ${attemptNumber}/3)...`);
      
      // 1. Provision IRC credentials (moved from chat modal!)
      console.log('[Chat Session] Provisioning IRC user...');
      const ircCredentials = await provisionIrcUser(
        token!,
        process.env.NEXT_PUBLIC_CHAT_BASE_URL || '',
        process.env.NEXT_PUBLIC_CURIA_BASE_URL || ''
      );
      
      console.log('[Chat Session] IRC provisioning complete, fetching channels...');
      
      // 2. Fetch available channels for community
      const channels = await authFetchJson<ApiChatChannel[]>(
        `/api/communities/${user!.cid}/chat-channels`,
        { token }
      );
      
      console.log(`[Chat Session] Fetched ${channels.length} channels`);
      
      // 3. Identify default channel
      const defaultChannel = channels.find(ch => ch.is_default) || channels[0];
      
      if (!defaultChannel) {
        throw new Error('No chat channels available for community');
      }

      console.log('[Chat Session] Default channel:', defaultChannel.name);

      const newSessionData: ChatSessionData = {
        ircCredentials,
        channels,
        defaultChannel
      };

      setSessionData(newSessionData);
      setIsInitialized(true);
      
      console.log('[Chat Session] Session initialization complete!');
      
      // Success toast notification
      toast.success("Chat connected! 💬");
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize chat session';
      console.error(`[Chat Session] Attempt ${attemptNumber} failed:`, errorMessage);
      
      if (attemptNumber < 3) {
        // Retry with exponential backoff: 1s, 2s delays
        const delay = Math.pow(2, attemptNumber - 1) * 1000;
        console.log(`[Chat Session] Retrying in ${delay}ms...`);
        
        setTimeout(() => {
          initializeSessionWithRetry(attemptNumber + 1);
        }, delay);
      } else {
        // Final failure after 3 attempts
        console.error('[Chat Session] All retry attempts failed');
        setInitError(errorMessage);
        setIsInitialized(false);
        
        // Error toast notification
        toast.error("Chat connection failed. Please refresh the page to retry.", {
          duration: 10000, // Show longer for important errors
        });
      }
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [user?.cid, token]);

  // Initialize session on mount - with retry logic!
  useEffect(() => {
    if (!user || !token || !user.cid) {
      setIsInitialized(false);
      setSessionData(null);
      setRetryCount(0);
      setInitError(null);
      return;
    }
    
    initializeSessionWithRetry(1);
  }, [user?.userId, user?.cid, user, token, initializeSessionWithRetry]);

  // Helper function to get channel by ID
  const getChannelById = (channelId: number): ApiChatChannel | undefined => {
    return sessionData?.channels.find(ch => ch.id === channelId);
  };

  // Manual retry function - resets state and starts over
  const retryInitialization = useCallback(() => {
    console.log('[Chat Session] Manual retry initiated');
    setRetryCount(0);
    setInitError(null);
    setIsRetrying(false);
    setIsInitialized(false);
    setSessionData(null);
    
    if (user && token && user.cid) {
      initializeSessionWithRetry(1);
    }
  }, [user, token, initializeSessionWithRetry]);

  return {
    sessionData,
    isInitialized,
    isLoading,
    initError,
    retryCount,
    isRetrying,
    getChannelById,
    retryInitialization
  };
}