'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

import { Home, LayoutDashboard, Settings, ChevronRight, ChevronDown, Plus, X, Lock, Shield, Bell, Handshake, Share2, BarChart3, Trophy, MessageSquare } from 'lucide-react';
import { CommunityInfoResponsePayload } from '@common-ground-dao/cg-plugin-lib';
import { ApiBoard } from '@/app/api/communities/[communityId]/boards/route';
import { ApiChatChannel } from '@/types/chatChannels';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useBackground } from '@/contexts/BackgroundContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSearchParams, usePathname } from 'next/navigation';
import { SettingsUtils } from '@/types/settings';
import { useSharedBoards } from '@/hooks/useSharedBoards';
import { useEffectiveTheme } from '@/hooks/useEffectiveTheme';

interface SidebarProps {
  communityInfo: CommunityInfoResponsePayload | null;
  boardsList: ApiBoard[] | null;
  chatChannelsList: ApiChatChannel[] | null;
  isOpen?: boolean;
  isMobile?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  communityInfo, 
  boardsList, 
  chatChannelsList, 
  isOpen = true, 
  isMobile = false, 
  onClose 
}) => {
  const { user } = useAuth();
  const { activeBackground } = useBackground();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [adminSectionExpanded, setAdminSectionExpanded] = useState(false);
  
  // Use the effective theme from our theme orchestrator
  const theme = useEffectiveTheme();
  
  // Determine if we should use frosted glass styling
  const hasActiveBackground = !!(activeBackground && activeBackground.imageUrl);
  
  // Fetch shared boards data
  const { data: sharedBoards, isLoading: sharedBoardsLoading } = useSharedBoards(communityInfo?.id);

  useEffect(() => {
    setMounted(true);
    
    // Get background color from URL params for Common Ground compatibility
    const cgBgColor = searchParams?.get('cg_bg_color') || '#ffffff';
    
    // Set CSS custom properties for dynamic theming
    document.documentElement.style.setProperty('--cg-bg', cgBgColor);
  }, [searchParams]);

  if (!mounted || !communityInfo) {
    return (
      <aside className={cn(
        "w-64 h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-r border-slate-200/60 dark:border-slate-700/60",
        isMobile ? "fixed top-0 left-0 z-50" : "sticky top-0"
      )}>
        <div className="space-y-4 animate-pulse">
          <div className="w-10 h-10 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-xl" />
          <div className="space-y-2">
            <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
          </div>
        </div>
      </aside>
    );
  }

  const currentBoardId = searchParams?.get('boardId');
  const currentChatId = pathname?.includes('/chat/') ? pathname.split('/chat/')[1]?.split('?')[0] : null;
  const isLocksPage = pathname === '/locks';
  const isCreateBoardPage = pathname === '/create-board';
  const isWhatsNewPage = pathname === '/whats-new';
  const isPartnershipsPage = pathname === '/partnerships';
  const isAdminDashboardPage = pathname === '/admin-dashboard';
  const isLeaderboardPage = pathname === '/leaderboard';
  const isHome = !currentBoardId && !currentChatId && !isLocksPage && !isCreateBoardPage && !isWhatsNewPage && !isPartnershipsPage && !isAdminDashboardPage && !isLeaderboardPage;

  // Helper function to preserve existing URL params
  const buildUrl = (path: string, additionalParams: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    
    // Preserve existing params
    if (searchParams) {
      searchParams.forEach((value, key) => {
        params.set(key, value);
      });
    }
    
    // Add/override with new params
    Object.entries(additionalParams).forEach(([key, value]) => {
      params.set(key, value);
    });
    
    return `${path}?${params.toString()}`;
  };

  // Helper function for Home link - removes boardId to ensure we go to actual home
  const buildHomeUrl = () => {
    const params = new URLSearchParams();
    
    // Preserve existing params except boardId
    if (searchParams) {
      searchParams.forEach((value, key) => {
        if (key !== 'boardId') {
          params.set(key, value);
        }
      });
    }
    
    // Always include communityId
    params.set('communityId', communityInfo.id);
    
    return `/?${params.toString()}`;
  };

  // Helper component for board icon with gating indicators
  const BoardIcon: React.FC<{ board: ApiBoard; isActive: boolean }> = ({ board, isActive }) => {
    const hasRoleGating = SettingsUtils.hasPermissionRestrictions(board.settings);
    const hasLockGating = SettingsUtils.hasBoardLockGating(board.settings);
    
    return (
      <div className="relative">
        {/* Main board icon */}
        <div className={cn(
          'p-1.5 rounded-lg transition-all duration-200',
          isActive
            ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700 dark:bg-slate-700/50 dark:text-slate-400 dark:group-hover:bg-slate-600/50 dark:group-hover:text-slate-300'
        )}>
          <LayoutDashboard size={16} />
        </div>
        
        {/* Gating indicators - positioned as overlays */}
        {(hasRoleGating || hasLockGating) && (
          <div className="absolute -top-1 -right-1 flex flex-col gap-0.5">
            {/* Role gating (visibility restricted) */}
            {hasRoleGating && (
              <div className="flex items-center justify-center w-3 h-3 rounded-full border transition-all duration-200 bg-orange-500/90 border-white text-orange-100 dark:border-slate-800" title="Visibility restricted to certain roles">
                <Shield size={8} strokeWidth={2.5} />
              </div>
            )}
            
            {/* Lock gating (write access restricted) */}
            {hasLockGating && (
              <div className="flex items-center justify-center w-3 h-3 rounded-full border transition-all duration-200 bg-blue-500/90 border-white text-blue-100 dark:border-slate-800" title="Write access requires verification">
                <Lock size={8} strokeWidth={2.5} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Helper component for chat channel icon
  const ChatIcon: React.FC<{ channel: ApiChatChannel; isActive: boolean }> = ({ channel, isActive }) => {
    // Use lightning emoji for default channels (typically named after the community)
    const isDefaultChannel = channel.is_default || channel.name === communityInfo?.title;
    
    return (
      <div className={cn(
        'p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center',
        isActive
          ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300'
          : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700 dark:bg-slate-700/50 dark:text-slate-400 dark:group-hover:bg-slate-600/50 dark:group-hover:text-slate-300'
      )}>
        {isDefaultChannel ? (
          <span className="text-[16px] leading-none">⚡</span>
        ) : (
          <MessageSquare size={16} />
        )}
      </div>
    );
  };

  // Conditional styling: frosted glass when background is active, solid when not
  const sidebarBg = cn(
    'transition-all duration-300',
    hasActiveBackground 
      ? [
          // Frosted glass effect when background image is active
          'backdrop-blur-md border-r shadow-xl',
          theme === 'dark' 
            ? 'bg-slate-900/20 border-slate-700/30 shadow-slate-900/20' 
            : 'bg-white/20 border-slate-200/30 shadow-slate-900/10'
        ]
      : [
          // Original solid styling when no background
          'bg-gradient-to-br border-r shadow-xl shadow-slate-900/5',
          theme === 'dark'
            ? 'from-slate-900/95 via-slate-900 to-slate-800/95 border-slate-700/40'
            : 'from-white/95 via-white to-slate-50/95 border-slate-200/60'
        ]
  );

  return (
    <aside className={cn(
      'w-64 h-screen flex flex-col transition-transform duration-300',
      sidebarBg,
      // Mobile positioning and animation
      isMobile ? [
        'fixed top-0 left-0 z-50',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      ] : 'sticky top-0'
    )}>
      {/* Mobile close button */}
      {isMobile && (
        <div className="lg:hidden flex justify-end p-4 pb-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X size={20} />
          </Button>
        </div>
      )}

      {/* Community Header - Sleek & Seamless */}
      <div className={cn("p-6 relative", isMobile && "pt-2")}>
        <div className="flex items-center space-x-4">
          {communityInfo.smallLogoUrl ? (
            <div className="relative group">
              {/* Logo with beautiful shadow and hover effect */}
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-slate-900/20 dark:shadow-slate-900/40 ring-1 ring-slate-200/60 dark:ring-slate-700/60 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-slate-900/30 group-hover:scale-105">
                <img
                  src={communityInfo.smallLogoUrl}
                  alt={`${communityInfo.title} logo`}
                  className="object-cover w-full h-full"
                />
                {/* Subtle shine overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary/20 to-primary/10 opacity-0 group-hover:opacity-50 transition-all duration-300 blur-sm -z-10" />
            </div>
          ) : (
            <div className="relative group">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary/80 to-primary/60 shadow-lg shadow-primary/20 dark:shadow-primary/30 flex items-center justify-center transition-all duration-300 group-hover:shadow-xl group-hover:shadow-primary/40 group-hover:scale-105">
                <span className="text-lg font-bold text-white">
                  {communityInfo.title.charAt(0)}
                </span>
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary/40 to-primary/20 opacity-0 group-hover:opacity-70 transition-all duration-300 blur-sm -z-10" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate bg-gradient-to-r bg-clip-text text-transparent from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300">
              {communityInfo.title}
            </h1>
            <p className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
              Community
            </p>
          </div>
        </div>
        
        {/* Beautiful subtle drop shadow */}
        <div className="absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent dark:via-slate-700/80" />
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-b from-transparent to-slate-100/20 dark:to-slate-900/20 pointer-events-none" />
      </div>

      {/* Navigation Section - Conditional styling based on background */}
      <nav className={cn(
        "flex-1 px-3 py-4 space-y-1 overflow-y-auto",
        hasActiveBackground
          ? [
              // Frosted glass when background is active
              'backdrop-blur-sm',
              theme === 'dark' 
                ? 'bg-slate-950/10 shadow-inner shadow-slate-950/10' 
                : 'bg-slate-50/10 shadow-inner shadow-slate-200/10'
            ]
          : [
              // Original solid styling when no background
              theme === 'dark' 
                ? 'bg-gradient-to-b from-slate-950/70 to-slate-900/80 shadow-inner shadow-slate-950/20' 
                : 'bg-gradient-to-b from-slate-50/90 to-slate-100/70 shadow-inner shadow-slate-200/30'
            ]
      )}>
        {/* Home Link */}
        <Link
          href={buildHomeUrl()}
          className={cn(
            'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
            isHome
              ? theme === 'dark'
                ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 shadow-lg shadow-blue-500/10'
                : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 shadow-lg shadow-blue-500/10'
              : theme === 'dark'
                ? hasActiveBackground 
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                : hasActiveBackground
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
          )}
        >
          <div className={cn(
            'p-1.5 rounded-lg mr-3 transition-all duration-200',
            isHome
              ? theme === 'dark'
                ? 'bg-blue-500/20 text-blue-300'
                : 'bg-blue-500/10 text-blue-600'
              : theme === 'dark'
                ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
          )}>
            <Home size={16} />
          </div>
          <span className="flex-1">Home</span>
          {isHome && (
            <ChevronRight size={14} className="opacity-60" />
          )}
          
          {/* Active indicator */}
          {isHome && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-xl" />
          )}
        </Link>

        {/* What's New Link */}
        <Link
          href={buildUrl('/whats-new')}
          className={cn(
            'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
            isWhatsNewPage
              ? theme === 'dark'
                ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-300 shadow-lg shadow-orange-500/10'
                : 'bg-gradient-to-r from-orange-500/10 to-red-500/10 text-orange-700 shadow-lg shadow-orange-500/10'
              : theme === 'dark'
                ? hasActiveBackground 
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                : hasActiveBackground
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
          )}
        >
          <div className={cn(
            'p-1.5 rounded-lg mr-3 transition-all duration-200',
            isWhatsNewPage
              ? theme === 'dark'
                ? 'bg-orange-500/20 text-orange-300'
                : 'bg-orange-500/10 text-orange-600'
              : theme === 'dark'
                ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
          )}>
            <Bell size={16} />
          </div>
          <span className="flex-1">What&apos;s New</span>
          
          {/* NEW Badge */}
          <div className={cn(
            'px-1.5 py-0.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200',
            theme === 'dark'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
          )}>
            NEW
          </div>
          
          {isWhatsNewPage && (
            <ChevronRight size={14} className="opacity-60 ml-2" />
          )}
          
          {/* Active indicator */}
          {isWhatsNewPage && (
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-red-500/5 rounded-xl" />
          )}
        </Link>

        {/* Leaderboard Link */}
        <Link
          href={buildUrl('/leaderboard')}
          className={cn(
            'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
            isLeaderboardPage
              ? theme === 'dark'
                ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-300 shadow-lg shadow-yellow-500/10'
                : 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10 text-yellow-700 shadow-lg shadow-yellow-500/10'
              : theme === 'dark'
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
          )}
        >
          <div className={cn(
            'p-1.5 rounded-lg mr-3 transition-all duration-200',
            isLeaderboardPage
              ? theme === 'dark'
                ? 'bg-yellow-500/20 text-yellow-300'
                : 'bg-yellow-500/10 text-yellow-600'
              : theme === 'dark'
                ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
          )}>
            <Trophy size={16} />
          </div>
          <span className="flex-1">Leaderboard</span>
          {isLeaderboardPage && (
            <ChevronRight size={14} className="opacity-60" />
          )}
          
          {/* Active indicator */}
          {isLeaderboardPage && (
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-amber-500/5 rounded-xl" />
          )}
        </Link>

        {/* Chats Section */}
        {chatChannelsList && chatChannelsList.length > 0 && (
          <div className="pt-6 pb-2">
            <h3 className={cn(
              'px-3 text-xs font-semibold uppercase tracking-wider mb-3',
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            )}>
              Chats
            </h3>
            <div className="space-y-1">
              {chatChannelsList.map((channel) => {
                const isActive = currentChatId === channel.id.toString();
                return (
                  <div key={channel.id} className="relative group">
                    <Link
                      href={buildUrl('/chat/' + channel.id.toString())}
                      className={cn(
                        'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
                        isActive
                          ? theme === 'dark'
                            ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 shadow-lg shadow-blue-500/10'
                            : 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-700 shadow-lg shadow-blue-500/10'
                          : theme === 'dark'
                            ? hasActiveBackground 
                              ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                              : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                            : hasActiveBackground
                              ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                      )}
                    >
                      <div className="mr-3">
                        <ChatIcon channel={channel} isActive={isActive} />
                      </div>
                      <span className="flex-1 truncate pr-8">{channel.name}</span>
                      {isActive && (
                        <ChevronRight size={14} className="opacity-60" />
                      )}
                      
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-xl" />
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Boards Section */}
        {boardsList && boardsList.length > 0 && (
          <div className="pt-6 pb-2">
            <h3 className={cn(
              'px-3 text-xs font-semibold uppercase tracking-wider mb-3',
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            )}>
              Boards
            </h3>
            <div className="space-y-1">
              {boardsList.map((board) => {
                const isActive = currentBoardId === board.id.toString();
                return (
                  <div key={board.id} className="relative group">
                    <Link
                      href={buildUrl('/', { communityId: communityInfo.id, boardId: board.id.toString() })}
                      className={cn(
                        'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
                        isActive
                          ? theme === 'dark'
                            ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-lg shadow-emerald-500/10'
                            : 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 shadow-lg shadow-emerald-500/10'
                          : theme === 'dark'
                            ? hasActiveBackground 
                              ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                              : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                            : hasActiveBackground
                              ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                      )}
                    >
                      <div className="mr-3">
                        <BoardIcon board={board} isActive={isActive} />
                      </div>
                      <span className="flex-1 truncate pr-8">{board.name}</span>
                      {isActive && (
                        <ChevronRight size={14} className="opacity-60" />
                      )}
                      
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-xl" />
                      )}
                    </Link>
                    
                    {/* Board Settings Button - Admin Only - Desktop Only */}
                    {user?.isAdmin && !isMobile && (
                      <Link
                        href={buildUrl('/board-settings', { boardId: board.id.toString() })}
                        className={cn(
                          'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 z-10',
                          theme === 'dark'
                            ? hasActiveBackground
                              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
                            : hasActiveBackground
                              ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/40'
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/80'
                        )}
                        onClick={(e) => e.stopPropagation()}
                        title={`Settings for ${board.name}`}
                      >
                        <Settings size={14} />
                      </Link>
                    )}
                  </div>
                );
              })}
              
              {/* Create Board Link - Admin Only */}
              {user?.isAdmin && (
                <Link
                  href={buildUrl('/create-board')}
                  className={cn(
                    'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mt-1 relative overflow-hidden',
                    isCreateBoardPage
                      ? theme === 'dark'
                        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-300 shadow-lg shadow-green-500/10'
                        : 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-700 shadow-lg shadow-green-500/10'
                      : theme === 'dark'
                        ? hasActiveBackground
                          ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/30 border border-slate-700/50'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-700/50'
                        : hasActiveBackground
                          ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/40 border border-slate-200/60'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200/60'
                  )}
                >
                  <div className={cn(
                    'p-1.5 rounded-lg mr-3 transition-all duration-200',
                    isCreateBoardPage
                      ? theme === 'dark'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-green-500/10 text-green-600'
                      : theme === 'dark'
                        ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                        : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                  )}>
                    <Plus size={16} />
                  </div>
                  <span className="flex-1">Create Board</span>
                  {isCreateBoardPage && (
                    <ChevronRight size={14} className="opacity-60" />
                  )}
                  
                  {/* Active indicator */}
                  {isCreateBoardPage && (
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5 rounded-xl" />
                  )}
                </Link>
              )}
              
              {/* Show "+ Shared Board" here only if there are no shared boards */}
              {user?.isAdmin && (!sharedBoards || sharedBoards.length === 0) && (
                <Link
                  href={buildUrl('/shared-boards')}
                  className={cn(
                    'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mt-1 relative overflow-hidden',
                    theme === 'dark'
                      ? hasActiveBackground
                        ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/30 border border-slate-700/50'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-700/50'
                      : hasActiveBackground
                        ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/40 border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200/60'
                  )}
                  title="Add Shared Board"
                >
                  <div className={cn(
                    'p-1.5 rounded-lg mr-3 transition-all duration-200',
                    theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                      : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                  )}>
                    <Plus size={16} />
                  </div>
                  <span className="flex-1">Shared Boards</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {!boardsList && (
          <div className="pt-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-10 rounded-xl animate-pulse',
                  theme === 'dark' 
                    ? 'bg-gradient-to-r from-slate-800/50 to-slate-700/30' 
                    : 'bg-gradient-to-r from-slate-200/50 to-slate-100/30'
                )}
              />
            ))}
          </div>
        )}

        {boardsList?.length === 0 && (
          <div className="pt-6">
            <h3 className={cn(
              'px-3 text-xs font-semibold uppercase tracking-wider mb-3',
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            )}>
              Boards
            </h3>
            <p className={cn(
              'px-3 py-4 text-sm rounded-xl text-center mb-2',
              theme === 'dark' 
                ? 'text-slate-400 bg-slate-800/30' 
                : 'text-slate-500 bg-slate-100/50'
            )}>
              No boards available
            </p>
            
            {/* Create Board Link - Admin Only */}
            {user?.isAdmin && (
              <Link
                href={buildUrl('/create-board')}
                className={cn(
                  'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
                  isCreateBoardPage
                    ? theme === 'dark'
                      ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-300 shadow-lg shadow-green-500/10'
                      : 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-700 shadow-lg shadow-green-500/10'
                    : theme === 'dark'
                      ? hasActiveBackground
                        ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/30 border border-slate-700/50'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-700/50'
                      : hasActiveBackground
                        ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/40 border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200/60'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-lg mr-3 transition-all duration-200',
                  isCreateBoardPage
                    ? theme === 'dark'
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-green-500/10 text-green-600'
                    : theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                      : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                )}>
                  <Plus size={16} />
                </div>
                <span className="flex-1">Create Board</span>
                {isCreateBoardPage && (
                  <ChevronRight size={14} className="opacity-60" />
                )}
                
                {/* Active indicator */}
                {isCreateBoardPage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5 rounded-xl" />
                )}
              </Link>
            )}
            
            {/* Show "+ Shared Board" here only if there are no shared boards and we're in empty boards section */}
            {user?.isAdmin && (!sharedBoards || sharedBoards.length === 0) && (
              <Link
                href={buildUrl('/shared-boards')}
                className={cn(
                  'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mt-1 relative overflow-hidden',
                  theme === 'dark'
                    ? hasActiveBackground
                      ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/30 border border-slate-700/50'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-700/50'
                    : hasActiveBackground
                      ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/40 border border-slate-200/60'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200/60'
                )}
                title="Add Shared Board"
              >
                <div className={cn(
                  'p-1.5 rounded-lg mr-3 transition-all duration-200',
                  theme === 'dark'
                    ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                    : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                )}>
                  <Plus size={16} />
                </div>
                <span className="flex-1">Shared Boards</span>
              </Link>
            )}
          </div>
        )}

        {/* Shared Boards Section */}
        {sharedBoards && sharedBoards.length > 0 && (
          <div className="pt-6 pb-2">
            <h3 className={cn(
              'px-3 text-xs font-semibold uppercase tracking-wider mb-3',
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            )}>
              Shared Boards
            </h3>
            <div className="space-y-1">
              {sharedBoards.map((sharedBoard) => {
                const isActive = currentBoardId === sharedBoard.source_board_id.toString();
                return (
                  <div key={sharedBoard.id} className="relative group">
                    <Link
                      href={buildUrl('/', { 
                        communityId: communityInfo.id, 
                        boardId: sharedBoard.source_board_id.toString(),
                        // Add source community context for shared boards
                        sourceCommunityId: sharedBoard.source_community_id
                      })}
                      className={cn(
                        'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
                        isActive
                          ? theme === 'dark'
                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 shadow-lg shadow-cyan-500/10'
                            : 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-700 shadow-lg shadow-cyan-500/10'
                          : theme === 'dark'
                            ? hasActiveBackground 
                              ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                              : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                            : hasActiveBackground
                              ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                      )}
                    >
                      <div className="mr-3">
                        <div className="relative">
                          {/* Community logo with shared indicator */}
                          <div className="relative">
                            <Avatar className={cn(
                              'w-8 h-8 border-2 transition-all duration-200',
                              isActive
                                ? theme === 'dark'
                                  ? 'border-cyan-300/50'
                                  : 'border-cyan-600/50'
                                : theme === 'dark'
                                  ? 'border-slate-600/50 group-hover:border-slate-500/50'
                                  : 'border-slate-300/50 group-hover:border-slate-400/50'
                            )}>
                              {sharedBoard.source_community_logo_url && (
                                <AvatarImage 
                                  src={sharedBoard.source_community_logo_url} 
                                  alt={sharedBoard.source_community_name}
                                  className="object-cover"
                                />
                              )}
                              <AvatarFallback className={cn(
                                'text-xs font-semibold transition-all duration-200',
                                isActive
                                  ? theme === 'dark'
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'bg-cyan-500/10 text-cyan-600'
                                  : theme === 'dark'
                                    ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                                    : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                              )}>
                                {sharedBoard.source_community_name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            
                            {/* Shared indicator */}
                            <div className={cn(
                              'absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-all duration-200',
                              theme === 'dark'
                                ? 'bg-cyan-500/90 border-slate-800 text-cyan-100'
                                : 'bg-cyan-500/90 border-white text-cyan-100'
                            )} title={`Shared from ${sharedBoard.source_community_name}`}>
                              <Share2 size={8} strokeWidth={2.5} />
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="truncate pr-2">{sharedBoard.board_name}</span>
                          {isActive && (
                            <ChevronRight size={14} className="opacity-60 flex-shrink-0" />
                          )}
                        </div>
                        <div className={cn(
                          'text-xs truncate',
                          theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                        )}>
                          from {sharedBoard.source_community_name}
                        </div>
                      </div>
                      
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 rounded-xl" />
                      )}
                    </Link>
                  </div>
                );
              })}
              
              {/* Add Shared Board Link - Admin Only - at bottom of shared boards section */}
              {user?.isAdmin && (
                <Link
                  href={buildUrl('/shared-boards')}
                  className={cn(
                    'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mt-1 relative overflow-hidden',
                    theme === 'dark'
                      ? hasActiveBackground
                        ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/30 border border-slate-700/50'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-slate-700/50'
                      : hasActiveBackground
                        ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/40 border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200/60'
                  )}
                  title="Add Shared Board"
                >
                  <div className={cn(
                    'p-1.5 rounded-lg mr-3 transition-all duration-200',
                    theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                      : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                  )}>
                    <Plus size={16} />
                  </div>
                  <span className="flex-1">Shared Boards</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Shared Boards Loading State */}
        {sharedBoardsLoading && (
          <div className="pt-6 space-y-2">
            <h3 className={cn(
              'px-3 text-xs font-semibold uppercase tracking-wider mb-3',
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            )}>
              Shared Boards
            </h3>
            {[1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-12 rounded-xl animate-pulse',
                  theme === 'dark' 
                    ? 'bg-gradient-to-r from-slate-800/50 to-slate-700/30' 
                    : 'bg-gradient-to-r from-slate-200/50 to-slate-100/30'
                )}
              />
            ))}
          </div>
        )}

        {/* Locks Section */}
        <div className="pt-6 pb-2">
          <h3 className={cn(
            'px-3 text-xs font-semibold uppercase tracking-wider mb-3',
            theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
          )}>
            Access Control
          </h3>
          <Link
            href={buildUrl('/locks')}
            className={cn(
              'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden',
              isLocksPage
                ? theme === 'dark'
                  ? 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-300 shadow-lg shadow-violet-500/10'
                  : 'bg-gradient-to-r from-violet-500/10 to-purple-500/10 text-violet-700 shadow-lg shadow-violet-500/10'
                : theme === 'dark'
                  ? hasActiveBackground 
                    ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                    : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                  : hasActiveBackground
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            )}
          >
            <div className={cn(
              'p-1.5 rounded-lg mr-3 transition-all duration-200',
              isLocksPage
                ? theme === 'dark'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'bg-violet-500/10 text-violet-600'
                : theme === 'dark'
                  ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                  : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
            )}>
              <Lock size={16} />
            </div>
            <span className="flex-1">Locks</span>
            
            {/* NEW Badge */}
            <div className={cn(
              'px-1.5 py-0.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200',
              theme === 'dark'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
            )}>
              NEW
            </div>
            
            {isLocksPage && (
              <ChevronRight size={14} className="opacity-60 ml-2" />
            )}
            
            {/* Active indicator */}
            {isLocksPage && (
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-purple-500/5 rounded-xl" />
            )}
          </Link>
        </div>
      </nav>

      {/* Subtle divider between content and chrome sections */}
      <div className={cn(
        'h-px mx-3',
        theme === 'dark' 
          ? 'bg-gradient-to-r from-transparent via-slate-600/40 to-transparent' 
          : 'bg-gradient-to-r from-transparent via-slate-300/50 to-transparent'
      )} />

      {/* Footer Section - Admin Links */}
      {user?.isAdmin && (
        <div className={cn(
          'border-t backdrop-blur-sm',
          theme === 'dark' 
            ? 'border-slate-700/40 bg-slate-900/50' 
            : 'border-slate-200/60 bg-white/50'
        )}>
          {/* Admin Section Toggle Header */}
          <button
            onClick={() => setAdminSectionExpanded(!adminSectionExpanded)}
            className={cn(
              'group flex items-center w-full px-3 py-3 text-sm font-medium transition-all duration-200',
              theme === 'dark'
                ? hasActiveBackground
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                : hasActiveBackground
                  ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/20'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/40'
            )}
          >
            <div className={cn(
              'p-1.5 rounded-lg mr-3 transition-all duration-200',
              theme === 'dark'
                ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
            )}>
              <Settings size={16} />
            </div>
            <span className="flex-1 text-left">Admin</span>
            <ChevronDown 
              size={14} 
              className={cn(
                'transition-transform duration-200',
                adminSectionExpanded ? 'transform rotate-180' : ''
              )} 
            />
          </button>

          {/* Collapsible Admin Links */}
          <div className={cn(
            'overflow-hidden transition-all duration-200',
            adminSectionExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
          )}>
            <div className="p-3 pt-0 space-y-1">
              {/* Admin Dashboard Link */}
              <Link
                href={buildUrl('/admin-dashboard')}
                className={cn(
                  'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full relative overflow-hidden',
                  isAdminDashboardPage
                    ? theme === 'dark'
                      ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 shadow-lg shadow-blue-500/10'
                      : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 shadow-lg shadow-blue-500/10'
                    : theme === 'dark'
                      ? hasActiveBackground 
                        ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                      : hasActiveBackground
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-lg mr-3 transition-all duration-200',
                  isAdminDashboardPage
                    ? theme === 'dark'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-blue-500/10 text-blue-600'
                    : theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                      : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                )}>
                  <BarChart3 size={16} />
                </div>
                <span className="flex-1 text-sm font-medium">Dashboard</span>
                {isAdminDashboardPage && (
                  <ChevronRight size={14} className="opacity-60" />
                )}
                
                {/* Active indicator */}
                {isAdminDashboardPage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-xl" />
                )}
              </Link>
              
              {/* Partnerships Link */}
              <Link
                href={buildUrl('/partnerships')}
                className={cn(
                  'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full relative overflow-hidden',
                  isPartnershipsPage
                    ? theme === 'dark'
                      ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 shadow-lg shadow-indigo-500/10'
                      : 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-700 shadow-lg shadow-indigo-500/10'
                    : theme === 'dark'
                      ? hasActiveBackground 
                        ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                      : hasActiveBackground
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-lg mr-3 transition-all duration-200',
                  isPartnershipsPage
                    ? theme === 'dark'
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-indigo-500/10 text-indigo-600'
                    : theme === 'dark'
                      ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                      : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                )}>
                  <Handshake size={16} />
                </div>
                <span className="flex-1 text-sm font-medium">Partnerships</span>
                {isPartnershipsPage && (
                  <ChevronRight size={14} className="opacity-60" />
                )}
                
                {/* Active indicator */}
                {isPartnershipsPage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-xl" />
                )}
              </Link>
              
              {/* Community Settings Link */}
              <Link
                href={buildUrl('/community-settings')}
                className={cn(
                  'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full',
                  theme === 'dark'
                    ? hasActiveBackground 
                      ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                      : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                    : hasActiveBackground
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-lg mr-3 transition-all duration-200',
                  theme === 'dark'
                    ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                    : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
                )}>
                  <Settings size={16} />
                </div>
                <span className="flex-1 text-sm font-medium">Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Footer Section - User Profile Link */}
      <div className={cn(
        'p-3 border-t backdrop-blur-sm space-y-1',
        theme === 'dark' 
          ? 'border-slate-700/40 bg-slate-900/50' 
          : 'border-slate-200/60 bg-white/50'
      )}>
        {/* User Profile Link */}
        <Link
          href={buildUrl(`/profile/${user?.userId}`)}
          className={cn(
            'group flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full relative overflow-hidden',
            pathname === `/profile/${user?.userId}`
              ? theme === 'dark'
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-lg shadow-emerald-500/10'
                : 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 shadow-lg shadow-emerald-500/10'
              : theme === 'dark'
                ? hasActiveBackground 
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/30'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                : hasActiveBackground
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/40'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
          )}
        >
          <Avatar className={cn(
            'w-7 h-7 mr-3 transition-all duration-200 border-2',
            pathname === `/profile/${user?.userId}`
              ? theme === 'dark'
                ? 'border-emerald-300/50'
                : 'border-emerald-600/50'
              : theme === 'dark'
                ? 'border-slate-600/50 group-hover:border-slate-500/50'
                : 'border-slate-300/50 group-hover:border-slate-400/50'
          )}>
            <AvatarImage 
              src={user?.picture || undefined} 
              alt={user?.name || 'User profile'}
              className="object-cover"
            />
            <AvatarFallback className={cn(
              'text-xs font-semibold transition-all duration-200',
              pathname === `/profile/${user?.userId}`
                ? theme === 'dark'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-emerald-500/10 text-emerald-600'
                : theme === 'dark'
                  ? 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
                  : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/50 group-hover:text-slate-700'
            )}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 text-sm font-medium">My Profile</span>
          {pathname === `/profile/${user?.userId}` && (
            <ChevronRight size={14} className="opacity-60" />
          )}
          
          {/* Active indicator */}
          {pathname === `/profile/${user?.userId}` && (
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-xl" />
          )}
        </Link>
      </div>
    </aside>
  );
}; 