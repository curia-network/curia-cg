import { ChatLayout } from '@curia_/curia-chat-modal';
import { Providers } from '../providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Suspense } from 'react';

interface ChatLayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: ChatLayoutProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Providers>
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center">Loading chat...</div>}>
          <ChatLayout>
            {children}
          </ChatLayout>
        </Suspense>
      </Providers>
    </ThemeProvider>
  );
}