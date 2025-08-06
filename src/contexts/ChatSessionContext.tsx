'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useChatSession } from '@/hooks/useChatSession';
import type { ChatSessionData } from '@/hooks/useChatSession';

interface ChatSessionContextType {
  sessionData: ChatSessionData | null;
  isInitialized: boolean;
  isLoading: boolean;
  initError: string | null;
  retryCount: number;
  isRetrying: boolean;
  retryInitialization: () => void;
}

const ChatSessionContext = createContext<ChatSessionContextType | null>(null);

interface ChatSessionProviderProps {
  children: ReactNode;
}

export function ChatSessionProvider({ children }: ChatSessionProviderProps) {
  const sessionState = useChatSession();

  return (
    <ChatSessionContext.Provider value={sessionState}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSessionContext(): ChatSessionContextType {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error('useChatSessionContext must be used within a ChatSessionProvider');
  }
  return context;
}