/**
 * Channel Selection Hook - Helper for opening specific chat channels
 * 
 * Provides convenient methods for opening chat channels by ID or opening
 * the default channel. Works in conjunction with useChatSession.
 */

import { useCallback } from 'react';
import { useChatModal } from '@curia_/curia-chat-modal';
import { useChatSession } from './useChatSession';
import type { ApiChatChannel } from '@/types/chatChannels';

export interface UseChannelSelectionReturn {
  // Open specific channel by ID
  openChannelById: (channelId: number) => void;
  // Open default channel
  openDefaultChannel: () => void;
  // Available channels for this community
  availableChannels: ApiChatChannel[];
  // The default channel
  defaultChannel: ApiChatChannel | undefined;
  // Whether session is ready for channel opening
  isReady: boolean;
}

/**
 * Helper hook for opening specific chat channels
 * Integrates with useChatSession for data and useChatModal for UI state
 */
export function useChannelSelection(): UseChannelSelectionReturn {
  const { openChat } = useChatModal();
  const { sessionData, isInitialized } = useChatSession();

  // Helper to open specific channel by ID
  const openChannelById = useCallback((channelId: number) => {
    if (!sessionData) {
      console.warn('[Channel Selection] Session not ready, cannot open channel');
      return;
    }
    
    const channel = sessionData.channels.find(ch => ch.id === channelId);
    if (!channel) {
      console.warn(`[Channel Selection] Channel ${channelId} not found`);
      return;
    }

    console.log(`[Channel Selection] Opening channel: ${channel.name}`);
    openChat(channelId); // Pass channel ID to context
  }, [sessionData, openChat]);

  // Helper to open default channel
  const openDefaultChannel = useCallback(() => {
    if (!sessionData?.defaultChannel) {
      console.warn('[Channel Selection] No default channel available');
      return;
    }

    console.log(`[Channel Selection] Opening default channel: ${sessionData.defaultChannel.name}`);
    openChat(); // No ID = default channel
  }, [sessionData, openChat]);

  return {
    openChannelById,
    openDefaultChannel,
    availableChannels: sessionData?.channels || [],
    defaultChannel: sessionData?.defaultChannel,
    isReady: isInitialized && !!sessionData
  };
}