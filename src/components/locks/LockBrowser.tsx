'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Clock, 
  Users, 
  TrendingUp,
  Grid3X3, 
  List, 
  Star,
  Loader2,
  SortAsc
} from 'lucide-react';
import { LockWithStats } from '@/types/locks';
import { LockCard } from './LockCard';
import { LockPreviewModal } from './LockPreviewModal';
import { LockEditModal } from './LockEditModal';
import { DeleteLockDialog } from './DeleteLockDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLocks, useLockManagement } from '@/hooks/useLockManagement';
import { toast } from '@/hooks/use-toast';

interface LockBrowserProps {
  onSelectLock?: (lock: LockWithStats) => void; // Optional - if provided, uses callback mode
  selectedLockId?: number; // For highlighting selected lock in callback mode
  className?: string;
}

type ViewMode = 'grid' | 'list';
type FilterMode = 'all' | 'mine' | 'public' | 'templates';
type SortMode = 'recent' | 'popular' | 'name' | 'usage';

interface LockFilters {
  search: string;
  filter: FilterMode;
  sort: SortMode;
  tags: string[];
}

export const LockBrowser: React.FC<LockBrowserProps> = ({
  onSelectLock,
  selectedLockId,
  className = ''
}) => {
  const { user } = useAuth();
  const currentUserId = user?.userId;
  
  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Modal State (only used when no onSelectLock callback provided)
  const [selectedLock, setSelectedLock] = useState<LockWithStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Dialog States
  const [editDialogLock, setEditDialogLock] = useState<LockWithStats | null>(null);
  const [deleteDialogLock, setDeleteDialogLock] = useState<LockWithStats | null>(null);
  
  // Determine if we're in callback mode or modal mode
  const useCallbackMode = Boolean(onSelectLock);
  
  // Filter State
  const [filters, setFilters] = useState<LockFilters>({
    search: '',
    filter: 'all',
    sort: 'recent',
    tags: []
  });
  
  // Data fetching with React Query
  const { 
    data: locks = [], 
    isLoading, 
    error,
    refetch 
  } = useLocks({
    search: filters.search,
    createdBy: filters.filter === 'mine' ? currentUserId : undefined,
    includeTemplates: filters.filter === 'all' || filters.filter === 'templates',
    includePublic: filters.filter === 'all' || filters.filter === 'public',
    tags: filters.tags.length > 0 ? filters.tags.join(',') : undefined,
  });

  // Lock management operations
  const {
    deleteLock,
    duplicateLock,
    isDeleting
  } = useLockManagement();
  
  // Handle lock selection (either callback or modal mode)
  const handleLockSelect = (lock: LockWithStats) => {
    if (useCallbackMode && onSelectLock) {
      // Callback mode - call the provided callback
      onSelectLock(lock);
    } else {
      // Modal mode - open preview modal
      setSelectedLock(lock);
      setIsModalOpen(true);
    }
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLock(null);
  };

  // Action handlers
  const handleEdit = (lock: LockWithStats) => {
    setEditDialogLock(lock);
  };

  const handleDuplicate = async (lock: LockWithStats) => {
    try {
      const newLock = await duplicateLock(lock.id);
      toast({
        title: 'Lock duplicated',
        description: `Lock duplicated as "${newLock.name}"`,
      });
    } catch (error) {
      toast({
        title: 'Failed to duplicate lock',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (lock: LockWithStats) => {
    setDeleteDialogLock(lock);
  };

  const handleDeleteConfirm = async (lock: LockWithStats) => {
    try {
      await deleteLock(lock.id);
      toast({
        title: 'Lock deleted',
        description: `Lock "${lock.name}" has been deleted`,
      });
    } catch (error) {
      toast({
        title: 'Failed to delete lock',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      throw error; // Re-throw to let dialog handle it
    }
  };
  
  // Filter and sort locks client-side for immediate UI feedback
  const processedLocks = useMemo(() => {
    const result = [...locks];
    
    // Apply client-side sorting for immediate feedback
    result.sort((a, b) => {
      switch (filters.sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'popular':
        case 'usage':
          return b.usageCount - a.usageCount;
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    
    return result;
  }, [locks, filters.sort]);
  
  // Update filters
  const updateFilter = (key: keyof LockFilters, value: string | FilterMode | SortMode | string[]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  // Get filter count for UI
  const getFilterCounts = () => {
    const total = locks.length;
    const mine = locks.filter(lock => lock.creatorUserId === currentUserId).length;
    const templates = locks.filter(lock => lock.isTemplate).length;
    const publicLocks = locks.filter(lock => lock.isPublic && !lock.isTemplate).length;
    
    return { total, mine, templates, public: publicLocks };
  };
  
  const filterCounts = getFilterCounts();
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Browse Locks</h2>
          <p className="text-sm text-muted-foreground">
            Choose an existing lock or create a new one
          </p>
        </div>
      </div>
      
      {/* Search and Controls */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search locks by name or description..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* View Mode Toggle - moved to filters row */}
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-muted-foreground">View</span>
            <div className="flex border rounded-md">
              <Button
                type="button"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Grid</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">List</span>
              </Button>
            </div>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-3">
          {/* Filter Tabs */}
          <div className="grid grid-cols-2 sm:flex sm:border sm:rounded-md gap-1 sm:gap-0">
            {[
              { key: 'all' as FilterMode, label: 'All', count: filterCounts.total, icon: null },
              { key: 'mine' as FilterMode, label: 'Mine', count: filterCounts.mine, icon: Users },
              { key: 'templates' as FilterMode, label: 'Templates', count: filterCounts.templates, icon: Star },
              { key: 'public' as FilterMode, label: 'Public', count: filterCounts.public, icon: null }
            ].map((tab, index) => (
              <Button
                type="button"
                key={tab.key}
                variant={filters.filter === tab.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateFilter('filter', tab.key)}
                className={`
                  flex items-center space-x-1 justify-center
                  sm:flex-none sm:border-0
                  ${index === 0 ? 'sm:rounded-r-none' : ''}
                  ${index > 0 && index < 3 ? 'sm:border-l sm:rounded-none' : ''}
                  ${index === 3 ? 'sm:border-l sm:rounded-l-none' : ''}
                `}
              >
                {tab.icon && <tab.icon className="h-3 w-3" />}
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {tab.count}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
          
          {/* Sort */}
          <div className="flex border rounded-md sm:flex-shrink-0">
            {[
              { key: 'recent' as SortMode, label: 'Recent', icon: Clock },
              { key: 'popular' as SortMode, label: 'Popular', icon: TrendingUp },
              { key: 'name' as SortMode, label: 'Name', icon: SortAsc }
            ].map((sort, index) => (
              <Button
                type="button"
                key={sort.key}
                variant={filters.sort === sort.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateFilter('sort', sort.key)}
                className={`
                  ${index === 0 ? '' : 'border-l rounded-l-none'}
                  ${index === 2 ? '' : 'rounded-r-none'}
                  flex items-center space-x-1 flex-1 sm:flex-none justify-center
                `}
              >
                {sort.icon && <sort.icon className="h-3 w-3" />}
                <span className="hidden sm:inline">{sort.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </Card>
      
      {/* Content */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-red-600 text-sm">
              {error instanceof Error ? error.message : 'Failed to load locks'}
            </p>
            <Button 
              type="button"
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              className="mt-2"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}
      
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading locks...</span>
        </div>
      )}
      
      {!isLoading && !error && processedLocks.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="font-medium mb-2">No locks found</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {filters.search.trim() || filters.filter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'No locks available yet'}
            </p>
            {(!filters.search.trim() && filters.filter === 'all') && (
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Create reusable locks on the dedicated{' '}
                  <a 
                    href="/locks" 
                    className="text-primary hover:underline font-medium"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Locks page
                  </a>
                </p>
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 max-w-sm">
                  💡 <strong>Tip:</strong> Create locks once, reuse them across multiple posts for consistent gating
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {!isLoading && !error && processedLocks.length > 0 && (
        <div className={
          viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        }>
          {processedLocks.map((lock) => (
            <LockCard
              key={lock.id}
              lock={lock}
              isSelected={useCallbackMode ? selectedLockId === lock.id : selectedLock?.id === lock.id}
              onSelect={() => handleLockSelect(lock)}
              variant={viewMode}
              showCreator={filters.filter !== 'mine'}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
      
      {/* Results Count */}
      {!isLoading && !error && processedLocks.length > 0 && (
        <div className="text-center text-sm text-muted-foreground pt-4 border-t">
          Showing {processedLocks.length} lock{processedLocks.length !== 1 ? 's' : ''}
          {filters.search.trim() && ` matching "${filters.search}"`}
        </div>
      )}
      
      {/* Lock Preview Modal - only shown in modal mode */}
      {!useCallbackMode && (
        <LockPreviewModal
          lock={selectedLock}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}

      {/* Management Dialogs */}
      <DeleteLockDialog
        lock={deleteDialogLock}
        isOpen={!!deleteDialogLock}
        onClose={() => setDeleteDialogLock(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />

      <LockEditModal
        lock={editDialogLock}
        isOpen={!!editDialogLock}
        onClose={() => setEditDialogLock(null)}
        onSave={() => {
          setEditDialogLock(null);
          toast({
            title: 'Lock updated',
            description: 'Your lock has been successfully updated',
          });
          refetch(); // Refresh the locks list
        }}
      />
    </div>
  );
}; 