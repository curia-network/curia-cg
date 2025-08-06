'use client';

import React from 'react';
import { ChatModal, useChatModal } from '@curia_/curia-chat-modal';
import { useEffectiveTheme } from '@/hooks/useEffectiveTheme';
import { useChatSessionContext } from '@/contexts/ChatSessionContext';
import { ChatLoadingModal } from '@/components/chat/ChatLoadingModal';
import { ChatErrorModal } from '@/components/chat/ChatErrorModal';

export function ChatModalWrapper() {
  const { isChatOpen, selectedChannelId, closeChat } = useChatModal();
  const { 
    sessionData, 
    isInitialized, 
    isLoading, 
    initError, 
    retryCount, 
    isRetrying, 
    retryInitialization 
  } = useChatSessionContext();
  const theme = useEffectiveTheme();
  
  // Don't render anything if modal is closed
  if (!isChatOpen) {
    return null;
  }

  // Show loading state during initialization or retries
  if (isLoading || isRetrying) {
    const message = isRetrying 
      ? `Retrying connection (${retryCount}/3)...`
      : "Connecting to chat...";
    
    return (
      <ChatLoadingModal 
        message={message}
        onClose={closeChat}
      />
    );
  }

  // Show error state after all retries failed
  if (initError && !isRetrying && retryCount >= 3) {
    return (
      <ChatErrorModal 
        error={initError}
        retryCount={retryCount}
        onRetry={retryInitialization}
        onClose={closeChat}
      />
    );
  }

  // Don't show modal if not ready yet (still initializing)
  if (!isInitialized || !sessionData) {
    return null;
  }

  // Determine which channel to show
  const targetChannel = selectedChannelId 
    ? sessionData.channels.find((ch: any) => ch.id === selectedChannelId)
    : sessionData.defaultChannel;

  if (!targetChannel) {
    console.error('[ChatModalWrapper] Invalid channel selection:', selectedChannelId);
    return (
      <ChatErrorModal 
        error="Selected chat channel not found. Please try again."
        onRetry={() => closeChat()}
        onClose={closeChat}
      />
    );
  }

  return (
    <ChatModal
      // Pass pre-provisioned data - no API calls in modal!
      ircCredentials={sessionData.ircCredentials}
      channel={targetChannel}
      chatBaseUrl={process.env.NEXT_PUBLIC_CHAT_BASE_URL} // 🎯 Prop drilling the env var!
      theme={theme}
      mode={targetChannel.is_single_mode ? 'single' : 'normal'}
      onClose={closeChat}
    />
  );
}