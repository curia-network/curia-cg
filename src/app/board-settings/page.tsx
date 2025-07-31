'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCgLib } from '@/contexts/CgLibContext';
import { useEffectiveTheme } from '@/hooks/useEffectiveTheme';
import { authFetchJson } from '@/utils/authFetch';
import { useCommunityData } from '@/hooks/useCommunityData';
import { CommunityInfoResponsePayload } from '@common-ground-dao/cg-plugin-lib';
// ApiCommunity removed - using centralized community data hook
import { ApiBoard } from '@/app/api/communities/[communityId]/boards/route';
import { BoardSettings, SettingsUtils } from '@/types/settings';
// Card components moved to CollapsibleSection
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Trash2, Settings, Shield, AlertTriangle, Lock, Brain } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BoardAccessForm } from '@/components/BoardAccessForm';
import { BoardLockGatingForm } from '@/components/BoardLockGatingForm';
import { BoardAIAutoModerationSettings } from '@/components/settings/BoardAIAutoModerationSettings';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';

interface DeleteBoardResponse {
  boardName: string;
  deletedPosts: number;
}

export default function BoardSettingsPage() {
  const { user, token } = useAuth();
  const { cgInstance } = useCgLib();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const boardId = searchParams?.get('boardId');
  const [boardName, setBoardName] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [boardSettings, setBoardSettings] = useState<BoardSettings>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);



  // Use the effective theme from our theme orchestrator
  const theme = useEffectiveTheme();

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

  // Fetch community info for role data
  const { data: communityInfo } = useQuery<CommunityInfoResponsePayload | null>({
    queryKey: ['communityInfo', cgInstance?.getCommunityInfo !== undefined],
    queryFn: async () => {
      if (!cgInstance) throw new Error('CgInstance not available');
      const response = await cgInstance.getCommunityInfo();
      if (!response?.data) throw new Error('Failed to fetch community info data from CgLib.');
      return response.data;
    },
    enabled: !!cgInstance,
  });

  // Fetch community settings using centralized hook
  const { data: communitySettings } = useCommunityData();

  // Fetch board data
  const {
    data: boardData,
    isLoading: isLoadingBoard,
  } = useQuery<ApiBoard, Error>({
    queryKey: ['board', boardId],
    queryFn: async () => {
      if (!boardId || !user?.cid || !token) throw new Error('Board ID, community, or token not available');
      const boards = await authFetchJson<ApiBoard[]>(`/api/communities/${user.cid}/boards`, { token });
      const board = boards.find(b => b.id.toString() === boardId);
      if (!board) throw new Error('Board not found');
      return board;
    },
    enabled: !!boardId && !!user?.cid && !!token,
  });

  // Initialize form data when board loads
  useEffect(() => {
    if (boardData) {
      setBoardName(boardData.name);
      setBoardDescription(boardData.description || '');
      setBoardSettings(boardData.settings || {});
    }
  }, [boardData]);

  // Track changes
  useEffect(() => {
    if (boardData) {
      const hasNameChange = boardName !== boardData.name;
      const hasDescChange = boardDescription !== (boardData.description || '');
      
      // More robust settings comparison
      const originalSettings = boardData.settings || {};
      const currentSettingsJson = JSON.stringify(boardSettings);
      const originalSettingsJson = JSON.stringify(originalSettings);
      const hasSettingsChange = currentSettingsJson !== originalSettingsJson;
      
      const hasAnyChanges = hasNameChange || hasDescChange || hasSettingsChange;
      
      setHasChanges(hasAnyChanges);
    }
  }, [boardName, boardDescription, boardSettings, boardData]);

  // Helper functions for generating section summaries - memoized to prevent re-render issues
  const getBoardDetailsSummary = useMemo(() => {
    if (!boardName) return 'Loading...';
    const descPreview = boardDescription ? 
      (boardDescription.length > 40 ? `${boardDescription.slice(0, 40)}...` : boardDescription) 
      : 'No description';
    return (
      <div className="text-right">
        <div className="font-medium">{boardName}</div>
        <div className="text-xs opacity-75">{descPreview}</div>
      </div>
    );
  }, [boardName, boardDescription]);

  const getVisibilityAccessSummary = useMemo(() => {
    const hasRoleRestrictions = SettingsUtils.hasPermissionRestrictions(boardSettings);
    if (!hasRoleRestrictions) {
      return <span className="text-emerald-600 dark:text-emerald-400">All members</span>;
    }
    
    const roleCount = boardSettings.permissions?.allowedRoles?.length || 0;
    return (
      <span className="text-amber-600 dark:text-amber-400">
        {roleCount === 1 ? '1 role only' : `${roleCount} roles only`}
      </span>
    );
  }, [boardSettings]);

  const getWriteAccessSummary = useMemo(() => {
    const hasLockGating = SettingsUtils.hasBoardLockGating(boardSettings);
    if (!hasLockGating) {
      return <span className="text-emerald-600 dark:text-emerald-400">No restrictions</span>;
    }
    
    const lockGating = SettingsUtils.getBoardLockGating(boardSettings);
    if (!lockGating) return <span className="text-emerald-600 dark:text-emerald-400">No restrictions</span>;
    
    const lockCount = lockGating.lockIds.length;
    const fulfillmentText = lockGating.fulfillment === 'any' ? 'ANY' : 'ALL';
    const durationText = `${lockGating.verificationDuration || 4}h`;
    
    return (
      <span className="text-amber-600 dark:text-amber-400">
        {lockCount} lock{lockCount !== 1 ? 's' : ''} ({fulfillmentText}) • {durationText}
      </span>
    );
  }, [boardSettings]);

  const updateBoardMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; settings: BoardSettings }) => {
      if (!token || !user?.cid || !boardId) throw new Error('Authentication or board ID required');
      
      const response = await authFetchJson(`/api/communities/${user.cid}/boards/${boardId}`, {
        method: 'PATCH',
        token,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      // Invalidate board data queries
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', user?.cid] });
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      
      // 🚀 NEW: Invalidate board verification status queries (all variations)
      queryClient.invalidateQueries({ queryKey: ['boardVerificationStatus', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boardVerificationStatus', boardId, user?.cid] });
      queryClient.invalidateQueries({ queryKey: ['boardVerificationStatus'] }); // Catch-all for partial matches
      
      // Invalidate all access-related queries to refresh UI filtering
      queryClient.invalidateQueries({ queryKey: ['accessibleBoards'] });
      queryClient.invalidateQueries({ queryKey: ['accessibleBoardsNewPost'] });
      queryClient.invalidateQueries({ queryKey: ['accessibleBoardsMove'] });
      
      // Remove cached data completely to force fresh queries
      queryClient.removeQueries({ queryKey: ['accessibleBoards'] });
      
      // Force refresh with a small delay to ensure proper sequencing
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['boards'] });
        queryClient.refetchQueries({ queryKey: ['accessibleBoards'] });
        // 🚀 NEW: Also refetch board verification status
        queryClient.refetchQueries({ queryKey: ['boardVerificationStatus'] });
      }, 100);
      
      setHasChanges(false);
      toast({
        title: "Board updated",
        description: "Board settings have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update board settings.",
        variant: "destructive",
      });
    },
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      if (!token || !user?.cid || !boardId) throw new Error('Authentication or board ID required');
      
      const url = `/api/communities/${user.cid}/boards/${boardId}${force ? '?force=true' : ''}`;
      const response = await authFetchJson<DeleteBoardResponse>(url, {
        method: 'DELETE',
        token,
      });
      return response;
    },
    onSuccess: (data: DeleteBoardResponse) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      toast({
        title: "Board deleted",
        description: `${data.boardName} has been deleted${data.deletedPosts > 0 ? ` along with ${data.deletedPosts} posts` : ''}.`,
      });
      router.push(buildUrl('/'));
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete board.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardName.trim()) return;
    
    updateBoardMutation.mutate({
      name: boardName.trim(),
      description: boardDescription.trim(),
      settings: boardSettings,
    });
  };

  const handleDelete = () => {
    deleteBoardMutation.mutate({ force: forceDelete });
    setShowDeleteDialog(false);
  };

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield size={48} className="mx-auto text-slate-400" />
          <div className="text-xl font-semibold text-slate-700 dark:text-slate-300">
            Admin Access Required
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Only administrators can access board settings.
          </p>
          <Link href={buildUrl('/')}>
            <Button variant="outline">Return to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!boardId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Settings size={48} className="mx-auto text-slate-400" />
          <div className="text-xl font-semibold text-slate-700 dark:text-slate-300">
            Board Not Found
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            No board ID provided in the URL.
          </p>
          <Link href={buildUrl('/')}>
            <Button variant="outline">Return to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoadingBoard) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading board settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 board-settings-page">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <Card variant="header" className="p-6">
          <div className="flex items-center space-x-4">
            <Link href={buildUrl('/', { boardId: boardId || '' })}>
              <Button variant="ghost" size="sm">
                <ArrowLeft size={16} className="mr-2" />
                Back to Board
              </Button>
            </Link>
            <div>
              <h1 className={cn(
                'text-2xl font-bold',
                theme === 'dark' ? 'text-slate-100' : 'text-slate-900'
              )}>
                Board Settings
              </h1>
              <p className={cn(
                'text-sm',
                theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
              )}>
                {boardData?.name || 'Loading...'}
              </p>
            </div>
          </div>
        </Card>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Board Details */}
          <CollapsibleSection
            title="Board Details"
            subtitle="Name, description, and basic information"
            icon={<Settings size={20} className="text-primary" />}
            defaultExpanded={true}
            summary={getBoardDetailsSummary}
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="boardName">Board Name</Label>
                <Input
                  id="boardName"
                  placeholder="e.g., General Discussion, Announcements, Support"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  required
                  disabled={updateBoardMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="boardDescription">Description (Optional)</Label>
                <Textarea
                  id="boardDescription"
                  placeholder="Briefly describe what this board is for..."
                  value={boardDescription}
                  onChange={(e) => setBoardDescription(e.target.value)}
                  rows={3}
                  disabled={updateBoardMutation.isPending}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Board Visibility & Access */}
          <CollapsibleSection
            title="Who Can See This Board"
            subtitle="Control board visibility using role-based permissions"
            icon={<Shield size={20} className="text-primary" />}
            defaultExpanded={true}
            summary={getVisibilityAccessSummary}
          >
            {communityInfo?.roles && communitySettings?.settings ? (
              <BoardAccessForm
                currentSettings={boardSettings}
                communitySettings={communitySettings.settings}
                communityRoles={communityInfo.roles}
                onSave={setBoardSettings}
                isLoading={updateBoardMutation.isPending}
                theme={theme}
                showSaveButton={false}
                autoSave={true}
              />
            ) : (
              <div className="space-y-4">
                <div className={cn(
                  "h-4 w-48 rounded animate-pulse",
                  theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
                )} />
                <div className={cn(
                  "h-20 w-full rounded animate-pulse",
                  theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
                )} />
              </div>
            )}
          </CollapsibleSection>

          {/* Lock-Based Write Access Requirements */}
          <CollapsibleSection
            title="Write Access Requirements"
            subtitle="Control who can post and comment using blockchain verification"
            icon={<Lock size={20} className="text-primary" />}
            defaultExpanded={true}
            summary={getWriteAccessSummary}
          >
                      <BoardLockGatingForm
            currentSettings={boardSettings}
            onSave={setBoardSettings}
            isLoading={updateBoardMutation.isPending}
            theme={theme}
            showSaveButton={false}
            autoSave={true}
          />
          </CollapsibleSection>

          {/* AI Auto-Moderation Settings */}
          {communitySettings?.settings && (
            <CollapsibleSection
              title="AI Auto-Moderation"
              subtitle="Board-specific AI content moderation settings"
              icon={<Brain size={20} className="text-primary" />}
              defaultExpanded={true}
              summary={<span className="text-sm text-muted-foreground">Configure AI settings</span>}
            >
              <BoardAIAutoModerationSettings
                currentSettings={boardSettings}
                communitySettings={communitySettings.settings}
                onSettingsChange={setBoardSettings}
                isLoading={updateBoardMutation.isPending}
                theme={theme}
              />
            </CollapsibleSection>
          )}

          {/* Save/Delete Actions */}
          <div className="flex justify-between items-center pt-8 mt-8 border-t border-border/50">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteBoardMutation.isPending}
              className="flex items-center"
            >
              <Trash2 size={16} className="mr-2" />
              Delete Board
            </Button>

            <Button
              type="submit"
              disabled={!hasChanges || updateBoardMutation.isPending}
              className="min-w-32"
            >
              {updateBoardMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} className="mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center text-destructive">
                <AlertTriangle size={20} className="mr-2" />
                Delete Board
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{boardData?.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="force-delete"
                  checked={forceDelete}
                  onCheckedChange={(checked) => setForceDelete(checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="force-delete"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Force delete (including all posts and comments)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Check this to delete the board even if it contains posts. All posts and comments will be permanently deleted.
                  </p>
                </div>
              </div>
              
              <div className={cn(
                "p-3 rounded-lg border text-sm",
                theme === 'dark' 
                  ? 'bg-amber-950/20 border-amber-800 text-amber-200' 
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              )}>
                <p className="font-medium">Warning:</p>
                <p>If this board contains posts and you don&apos;t check &quot;Force delete&quot;, the deletion will fail. Consider moving posts to another board first.</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleteBoardMutation.isPending}
              >
                {deleteBoardMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} className="mr-2" />
                    Delete Board
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 