'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Menu, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useBackground } from '@/contexts/BackgroundContext';
import { useCgLib } from '@/contexts/CgLibContext';
import { useEffectiveTheme } from '@/hooks/useEffectiveTheme';
import { authFetchJson } from '@/utils/authFetch';
import { ApiBoard } from '@/app/api/communities/[communityId]/boards/route';
import { ApiPost } from '@/app/api/posts/route';
import { ApiChatChannel } from '@/types/chatChannels';
import { CommunityInfoResponsePayload } from '@common-ground-dao/cg-plugin-lib';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { CommunityAccessGate } from '@/components/access/CommunityAccessGate';
import { MultiCommunityPresenceSidebar } from '@/components/presence/MultiCommunityPresenceSidebar';
import { MiniPresenceWidget } from '@/components/presence/MiniPresenceWidget';
import { checkBoardAccess, getUserRoles } from '@/lib/roleService';
import { AIChatBubble } from '@/components/ai/AIChatBubble';

interface MainLayoutWithSidebarProps {
  children: React.ReactNode;
}

export const MainLayoutWithSidebar: React.FC<MainLayoutWithSidebarProps> = ({ children }) => {
  const { user, isAuthenticated, token } = useAuth();
  const { activeBackground } = useBackground();
  const { cgInstance, isInitializing: isCgLibInitializing, initError: cgLibError } = useCgLib();
  
  // Enhanced sidebar state management with mini mode
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);  // Renamed for clarity
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false); // New: Right sidebar state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false); // New: Tablet detection
  const [isMiniMode, setIsMiniMode] = useState(false); // New: Mini widget mode (200x200px)
  
  // Use the effective theme from our theme orchestrator
  const theme = useEffectiveTheme();
  
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Determine if we should use frosted glass styling
  const hasActiveBackground = !!(activeBackground && activeBackground.imageUrl);

  // Enhanced screen size detection with mini mode
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Mini mode detection (Common Ground 200x200px minimized state)
      setIsMiniMode(width <= 250 && height <= 250);
      
      // Standard responsive breakpoints
      setIsMobile(width < 768 && !isMiniMode);        // md breakpoint  
      setIsTablet(width >= 768 && width < 1024 && !isMiniMode); // md to lg
      
      if (width >= 1024 && !isMiniMode) {
        setLeftSidebarOpen(false);  // Close mobile sidebar when screen becomes large
        setRightSidebarOpen(false); // Close mobile right sidebar too
      }
    };

    // Use ResizeObserver for more accurate detection
    const resizeObserver = new ResizeObserver(checkScreenSize);
    resizeObserver.observe(document.body);
    
    // Initial check
    checkScreenSize();
    
    // Fallback for older browsers
    window.addEventListener('resize', checkScreenSize);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkScreenSize);
    };
  }, [isMiniMode]);

  // Phase 2: Enhanced outside click handling for both sidebars
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if ((isMobile || isTablet) && (leftSidebarOpen || rightSidebarOpen)) {
        const target = event.target as Element;
        if (!target.closest('[data-sidebar]') && 
            !target.closest('[data-sidebar-trigger]') && 
            !target.closest('[data-right-sidebar]') && 
            !target.closest('[data-right-sidebar-trigger]')) {
          setLeftSidebarOpen(false);
          setRightSidebarOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMobile, isTablet, leftSidebarOpen, rightSidebarOpen]);

  // Phase 2: Prevent body scroll when any mobile sidebar is open
  useEffect(() => {
    if ((isMobile || isTablet) && (leftSidebarOpen || rightSidebarOpen)) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobile, isTablet, leftSidebarOpen, rightSidebarOpen]);

  const { data: communityInfo, isLoading: isLoadingCommunityInfo, error: communityInfoError } = useQuery<CommunityInfoResponsePayload | null>({
    queryKey: ['communityInfo', cgInstance?.getCommunityInfo !== undefined],
    queryFn: async () => {
      if (!cgInstance) throw new Error('CgInstance not available');
      const response = await cgInstance.getCommunityInfo();
      if (!response?.data) throw new Error('Failed to fetch community info data from CgLib.');
      return response.data;
    },
    enabled: !!cgInstance && !isCgLibInitializing,
  });

  const communityIdForBoards = communityInfo?.id || user?.cid;

  const { data: boardsList, isLoading: isLoadingBoards, error: boardsError } = useQuery<ApiBoard[]>({
    queryKey: ['boards', communityIdForBoards],
    queryFn: async () => {
      if (!communityIdForBoards || !token) throw new Error('Community context or token not available for fetching boards');
      return authFetchJson<ApiBoard[]>(`/api/communities/${communityIdForBoards}/boards`, { token });
    },
    enabled: !!isAuthenticated && !!token && !!communityIdForBoards && !!communityInfo,
  });

  // Filter boards based on user access permissions
  const { data: accessibleBoardsList, isLoading: isFilteringBoards } = useQuery<ApiBoard[]>({
    queryKey: ['accessibleBoards', boardsList, user?.userId, user?.roles],
    queryFn: async () => {
      if (!boardsList || !user || !communityIdForBoards) return [];
      
      // Admin override - admins can see all boards for management
      if (user.isAdmin) {
        console.log('[MainLayout] Admin user - showing all boards');
        return boardsList;
      }
      
      // Get user roles for permission checking
      const userRoles = await getUserRoles(user.roles);
      
      // Filter boards based on access permissions
      const accessibleBoards = await Promise.all(
        boardsList.map(async (board) => {
          const hasAccess = await checkBoardAccess(board, userRoles);
          return hasAccess ? board : null;
        })
      );
      
      // Remove null entries (boards user can't access)
      const filteredBoards = accessibleBoards.filter((board): board is ApiBoard => board !== null);
      
      console.log(`[MainLayout] Filtered boards: ${filteredBoards.length}/${boardsList.length} accessible`);
      return filteredBoards;
    },
    enabled: !!boardsList && !!user && !!communityIdForBoards,
  });

  // Fetch chat channels for the community
  const { data: chatChannelsList, isLoading: isLoadingChatChannels, error: chatChannelsError } = useQuery<ApiChatChannel[]>({
    queryKey: ['chatChannels', communityIdForBoards],
    queryFn: async () => {
      if (!communityIdForBoards || !token) throw new Error('Community context or token not available for fetching chat channels');
      return authFetchJson<ApiChatChannel[]>(`/api/communities/${communityIdForBoards}/chat-channels`, { token });
    },
    enabled: !!isAuthenticated && !!token && !!communityIdForBoards && !!communityInfo,
  });

  // Enhanced context detection for navigation and sidebar
  const navigationContext = React.useMemo(() => {
    // Post detail route detection
    if (pathname?.includes('/board/') && pathname?.includes('/post/')) {
      const pathParts = pathname.split('/');
      const boardId = pathParts[2];
      const postId = pathParts[4];
      return {
        type: 'post' as const,
        boardId,
        postId,
        isPostDetail: true
      };
    }
    
    // Board view detection
    const boardIdFromParams = searchParams?.get('boardId');
    if (boardIdFromParams) {
      return {
        type: 'board' as const,
        boardId: boardIdFromParams,
        postId: null,
        isPostDetail: false
      };
    }
    
    // Home/global view
    return {
      type: 'home' as const,
      boardId: null,
      postId: null,
      isPostDetail: false
    };
  }, [pathname, searchParams]);

  // Legacy compatibility
  const isPostDetailRoute = navigationContext.type === 'post';
  const currentBoardId = navigationContext.boardId;
  const currentPostId = navigationContext.postId;

  // PHASE 1: Enhanced board resolution for shared boards support
  // Use direct board API that handles both owned and shared boards
  const { data: currentBoard } = useQuery<ApiBoard>({
    queryKey: ['board', currentBoardId, communityIdForBoards],
    queryFn: async () => {
      if (!currentBoardId || !communityIdForBoards || !token) {
        throw new Error('Board ID, community ID, or token not available');
      }
      
      try {
        // Use direct board resolution endpoint that handles both owned and shared boards
        const response = await authFetchJson<{ board: ApiBoard }>(
          `/api/communities/${communityIdForBoards}/boards/${currentBoardId}`, 
          { token }
        );
        return response.board;
      } catch (error) {
        console.error('[MainLayout] Failed to resolve board info:', error);
        
        // Fallback: try to find in accessible boards list (for owned boards)
        const fallbackBoard = accessibleBoardsList?.find(board => board.id.toString() === currentBoardId);
        if (fallbackBoard) {
          console.log('[MainLayout] Using fallback board from accessible boards list');
          return fallbackBoard;
        }
        
        throw error;
      }
    },
    enabled: !!currentBoardId && !!communityIdForBoards && !!token,
    staleTime: 30000, // 30 seconds - boards don't change frequently
  });

  // Fetch current post info if in post detail route
  const { data: currentPost } = useQuery<ApiPost>({
    queryKey: ['post', currentPostId],
    queryFn: async () => {
      if (!token || !currentPostId) throw new Error('No auth token or post ID');
      return authFetchJson<ApiPost>(`/api/posts/${currentPostId}`, { token });
    },
    enabled: !!token && !!currentPostId && isPostDetailRoute,
  });

  // Function to get header title based on context
  const getHeaderTitle = () => {
    if (currentBoard) {
      return currentBoard.name;
    } else if (currentPost?.title) {
      // Eclipsed version of post title (max 25 characters for mobile)
      return currentPost.title.length > 25 
        ? `${currentPost.title.substring(0, 25)}...`
        : currentPost.title;
    }
    return 'Loading...';
  };

  // Navigation handlers
  const handleLogoClick = () => {
    // Always go to homepage, preserving current search params
    const params = new URLSearchParams();
    if (searchParams) {
      searchParams.forEach((value, key) => {
        // Preserve all params except boardId (going to home)
        if (key !== 'boardId') {
          params.set(key, value);
        }
      });
    }
    const homeUrl = params.toString() ? `/?${params.toString()}` : '/';
    console.log(`[Header] Navigating to home: ${homeUrl}`);
    router.push(homeUrl);
  };

  const handleBoardNameClick = () => {
    if (!currentBoard) return;
    
    if (isPostDetailRoute) {
      // On post detail page → navigate back to board
      const params = new URLSearchParams();
      if (searchParams) {
        searchParams.forEach((value, key) => {
          params.set(key, value);
        });
      }
      params.set('boardId', currentBoard.id.toString());
      const boardUrl = `/?${params.toString()}`;
      console.log(`[Header] Navigating back to board: ${boardUrl}`);
      router.push(boardUrl);
    } else {
      // Already in board view → scroll to top
      console.log(`[Header] Scrolling to top of board feed`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const showSidebar = isAuthenticated && communityInfo && accessibleBoardsList && chatChannelsList && !isLoadingCommunityInfo && !isLoadingBoards && !isFilteringBoards && !isLoadingChatChannels && !cgLibError && !communityInfoError && !boardsError && !chatChannelsError;

  // Handle mini mode (200x200px Common Ground minimized state)
  if (isMiniMode) {
    return (
      <div className="w-full h-full p-1">
        <MiniPresenceWidget onExpand={() => {
          // Force trigger resize detection to potentially exit mini mode
          // when Common Ground expands the iframe
          window.dispatchEvent(new Event('resize'));
        }} />
      </div>
    );
  }

  if (isCgLibInitializing || (isAuthenticated && (isLoadingCommunityInfo || (communityIdForBoards && isLoadingBoards && communityInfo) || isFilteringBoards))) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-slate-600 dark:text-slate-400">
            {isFilteringBoards ? 'Checking board permissions...' : 'Loading application data...'}
          </p>
        </div>
      </div>
    );
  }

  if (cgLibError || communityInfoError || boardsError) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col p-6">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-red-500 font-semibold">Error loading application data</p>
          {cgLibError && <p className="text-sm text-slate-600">CgLib Error: {cgLibError.message}</p>}
          {communityInfoError && <p className="text-sm text-slate-600">CommunityInfo Error: {(communityInfoError as Error).message}</p>}
          {boardsError && <p className="text-sm text-slate-600">Boards Error: {(boardsError as Error).message}</p>}
        </div>
      </div>
    );
  }

  // If not authenticated, just show children without access control
  if (!isAuthenticated) {
    return <div className="min-h-screen">{children}</div>;
  }

  // For authenticated users, wrap with access control
  return (
    <CommunityAccessGate theme={theme}>
      <div className="flex min-h-screen relative">
        {/* Phase 2: Enhanced backdrop overlay for MOBILE AND TABLET OVERLAYS */}
        {((isMobile && rightSidebarOpen) || (isMobile && leftSidebarOpen) || (isTablet && leftSidebarOpen) || (isTablet && rightSidebarOpen)) && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => {
              setLeftSidebarOpen(false);
              setRightSidebarOpen(false);
            }}
          />
        )}

        {/* Left Sidebar */}
        {showSidebar && communityInfo && accessibleBoardsList && chatChannelsList && (
          <div data-sidebar>
            <Sidebar 
              communityInfo={communityInfo} 
              boardsList={accessibleBoardsList}
              chatChannelsList={chatChannelsList}
              isOpen={leftSidebarOpen}
              isMobile={isMobile || isTablet}
              onClose={() => setLeftSidebarOpen(false)}
            />
          </div>
        )}

        {/* Main content area - Phase 2: Three-column layout */}
        <main className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300",
          showSidebar && !isMobile && !isTablet ? "lg:ml-0" : "ml-0"
        )}>
          {/* Phase 2: Enhanced mobile header with both sidebar toggles */}
          {showSidebar && (isMobile || isTablet) && (
            <header className={cn(
              "border-b px-4 py-3 flex items-center justify-between sticky top-0 z-30 backdrop-blur-xl lg:hidden",
              theme === 'dark' 
                ? 'bg-gradient-to-r from-slate-900/95 via-slate-900 to-slate-800/95 border-slate-700/40' 
                : 'bg-gradient-to-r from-white/95 via-white to-slate-50/95 border-slate-200/60'
            )}>
              {/* Left sidebar toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLeftSidebarOpen(true)}
                data-sidebar-trigger
                className="lg:hidden"
              >
                <Menu size={20} />
              </Button>
              
              {/* Center - Profile picture with dynamic context */}
              <div className="flex items-center space-x-2">
                {communityInfo?.smallLogoUrl && (
                  <button 
                    onClick={handleLogoClick}
                    className="relative transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded"
                  >
                    <div className="w-6 h-6 rounded overflow-hidden shadow-sm">
                                          <img 
                      src={communityInfo.smallLogoUrl} 
                      alt={communityInfo.title || 'Community Logo'}
                      className="object-cover w-full h-full"
                    />
                    </div>
                  </button>
                )}
                
                {/* Show slash and context only when we have board or post context */}
                {(currentBoard || currentPost) && (
                  <>
                    <span className={cn(
                      "text-lg font-light opacity-60",
                      theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                    )}>
                      /
                    </span>
                    {currentBoard ? (
                      <button
                        onClick={handleBoardNameClick}
                        className={cn(
                          "font-semibold truncate bg-gradient-to-r bg-clip-text text-transparent transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 py-0.5",
                          theme === 'dark' 
                            ? 'from-slate-100 to-slate-300' 
                            : 'from-slate-900 to-slate-700'
                        )}
                        title={isPostDetailRoute ? `Go back to ${currentBoard.name}` : `Scroll to top of ${currentBoard.name}`}
                      >
                        {currentBoard.name}
                      </button>
                    ) : (
                      <span className={cn(
                        "font-semibold truncate bg-gradient-to-r bg-clip-text text-transparent",
                        theme === 'dark' 
                          ? 'from-slate-100 to-slate-300' 
                          : 'from-slate-900 to-slate-700'
                      )}>
                        {getHeaderTitle()}
                      </span>
                    )}
                  </>
                )}
                
                {/* Fallback: show community title when no context */}
                {!currentBoard && !currentPost && (
                  <button
                    onClick={handleLogoClick}
                    className={cn(
                      "font-semibold truncate bg-gradient-to-r bg-clip-text text-transparent transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 py-0.5",
                      theme === 'dark' 
                        ? 'from-slate-100 to-slate-300' 
                        : 'from-slate-900 to-slate-700'
                    )}
                    title="Go to homepage"
                  >
                    {communityInfo?.title}
                  </button>
                )}
              </div>
              
              {/* Right sidebar toggle */}
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                  data-right-sidebar-trigger
                  className="lg:hidden"
                >
                  {rightSidebarOpen ? <X size={20} /> : <Users size={20} />}
                </Button>
              </div>
            </header>
          )}

          {/* Phase 2: Main content with right sidebar */}
          <div className="flex flex-1">
            {/* Page content */}
            <div className={cn(
              "flex-1 transition-all duration-300",
              // Add right padding/margin on large screens when sidebar is visible
              showSidebar && !isMobile && !isTablet && rightSidebarOpen && "lg:pr-64 xl:pr-72",
              showSidebar && !isMobile && !isTablet && "xl:pr-72" // Always account for sidebar on xl+
            )}>
              {children}
            </div>

            {/* Phase 2: Right Sidebar - Online Users */}
            {showSidebar && (
              <aside className={cn(
                "transition-all duration-300 border-l w-64 xl:w-72",
                hasActiveBackground
                  ? [
                      // Frosted glass when background is active
                      'backdrop-blur-md shadow-xl',
                      theme === 'dark' 
                        ? 'bg-slate-900/20 border-slate-700/30 shadow-slate-900/20' 
                        : 'bg-white/20 border-slate-200/30 shadow-slate-900/10'
                    ]
                  : [
                      // Original solid styling when no background
                      'shadow-lg',
                      theme === 'dark' 
                        ? 'bg-background border-slate-700/40' 
                        : 'bg-background border-slate-200/60'
                    ],
                // Large screen sticky positioning (fixed to right side)
                !isMobile && !isTablet && "lg:fixed lg:right-0 lg:top-0 lg:h-screen lg:z-30",
                !isMobile && !isTablet && rightSidebarOpen && "lg:block",
                !isMobile && !isTablet && !rightSidebarOpen && "lg:hidden xl:block", // xl+ always visible
                // Tablet: Hidden by default, overlay when toggled (same as mobile)
                isTablet && !rightSidebarOpen && "hidden",
                isTablet && rightSidebarOpen && "fixed right-0 top-0 h-full z-50 shadow-lg block",
                // Mobile: Hidden by default, overlay when toggled
                isMobile && !rightSidebarOpen && "hidden",
                isMobile && rightSidebarOpen && "fixed right-0 top-0 h-full z-50 shadow-lg block"
              )} data-right-sidebar>
                {/* Mobile and Tablet close button */}
                {(isMobile || isTablet) && rightSidebarOpen && (
                  <div className={cn(
                    "p-4 border-b flex justify-between items-center",
                    theme === 'dark' ? 'border-slate-700/40' : 'border-slate-200/60'
                  )}>
                    <span className={cn(
                      "font-medium",
                      theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
                    )}>
                      Online Users
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRightSidebarOpen(false)}
                    >
                      <X size={20} />
                    </Button>
                  </div>
                )}
                <div className="h-full overflow-y-auto flex flex-col">
                  <div className="flex-1">
                    <MultiCommunityPresenceSidebar 
                      navigationContext={navigationContext}
                      currentBoard={currentBoard}
                      currentPost={currentPost}
                    />
                  </div>
                </div>
              </aside>
            )}

            {/* Phase 2: Desktop toggle button for right sidebar */}
            {showSidebar && !isMobile && !isTablet && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                className={cn(
                  "fixed top-4 right-4 z-40 xl:hidden transition-all duration-300",
                  theme === 'dark' 
                    ? 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-600/40' 
                    : 'bg-white/80 hover:bg-slate-50/80 border-slate-200/60',
                  "backdrop-blur-sm border shadow-lg"
                )}
                data-right-sidebar-trigger
              >
                <Users size={16} />
              </Button>
            )}
          </div>
        </main>

        {/* AI Chat Bubble - Fixed positioning for authenticated users */}
        <AIChatBubble 
          context={{
            type: navigationContext.type as 'post' | 'comment' | 'general',
            boardId: currentBoard?.id,
            postId: currentPost?.id
          }}
        />
      </div>
    </CommunityAccessGate>
  );
}; 