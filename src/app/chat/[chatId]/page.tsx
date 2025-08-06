'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import { authFetchJson } from '@/utils/authFetch';
import { ApiChatChannel } from '@/types/chatChannels';
import { ChatPage, LoadingState, ErrorState } from '@curia_/curia-chat-modal';
import { useChatSessionContext } from '@/contexts/ChatSessionContext';
import { useEffectiveTheme } from '@/hooks/useEffectiveTheme';

interface ChatPageProps {
  params: Promise<{ chatId: string }>;
}

export default function Page({ params }: ChatPageProps) {
  const [chatId, setChatId] = useState<string>('');
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const theme = useEffectiveTheme();
  const { 
    sessionData, 
    isInitialized, 
    isLoading: isSessionLoading, 
    initError, 
    retryCount, 
    isRetrying, 
    retryInitialization 
  } = useChatSessionContext();

  useEffect(() => {
    params.then(({ chatId }) => {
      setChatId(chatId);
    });
  }, [params]);

  // Fetch specific chat channel
  const { data: chatChannel, isLoading: isChannelLoading, error: channelError } = useQuery<ApiChatChannel>({
    queryKey: ['chatChannel', chatId],
    queryFn: async () => {
      if (!token || !user?.cid) throw new Error('No auth token');
      
      // First try to get from session data if available
      if (sessionData?.channels) {
        const existingChannel = sessionData.channels.find((ch: ApiChatChannel) => ch.id === parseInt(chatId));
        if (existingChannel) {
          return existingChannel;
        }
      }
      
      // Otherwise fetch from API
      const response = await authFetchJson<ApiChatChannel[]>(
        `/api/communities/${user.cid}/chat-channels`, 
        { token }
      );
      
      const channel = response.find(ch => ch.id === parseInt(chatId));
      if (!channel) {
        throw new Error('Chat channel not found');
      }
      
      return channel;
    },
    enabled: !!token && !!chatId && !!user?.cid,
  });

  const isLoading = isSessionLoading || isChannelLoading;
  const error = initError || channelError;

  // Navigation helper
  const handleClose = () => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('boardId');
    const homeUrl = params.toString() ? `/?${params.toString()}` : '/';
    router.push(homeUrl);
  };

  // Show loading state during session initialization, retries, or channel loading
  if (isLoading || isRetrying) {
    const message = isRetrying 
      ? `Retrying connection (${retryCount}/3)...`
      : "Loading chat...";
    
    return (
      <div className="h-screen w-full flex items-center justify-center flex-col space-y-4">
        <LoadingState />
        <div className="text-center">
          <p className="text-lg">{message}</p>
        </div>
      </div>
    );
  }

  // Show error state after all retries failed or channel not found
  if (error && (!isRetrying || retryCount >= 3)) {
    return (
      <ErrorState 
        error={typeof error === 'string' ? error : error.message || 'Failed to load chat'}
        onRetry={channelError ? () => window.location.reload() : retryInitialization}
        className="h-screen w-full flex items-center justify-center"
      />
    );
  }

  // Don't show page if not ready yet (still initializing)
  if (!isInitialized || !sessionData || !chatChannel) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <LoadingState />
        <div className="text-center">
          <p>Loading chat...</p>
        </div>
      </div>
    );
  }

  // Render the ChatPage component - this will fill the entire viewport cleanly
  return (
    <ChatPage
      ircCredentials={sessionData.ircCredentials}
      channel={chatChannel}
      chatBaseUrl={process.env.NEXT_PUBLIC_CHAT_BASE_URL}
      theme={theme}
      mode={chatChannel.is_single_mode ? 'single' : 'normal'}
      onClose={handleClose}
    />
  );
}