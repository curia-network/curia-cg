import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, authFetchJson } from '@/utils/authFetch';
import { LockWithStats, LockListResponse, UpdateLockRequest } from '@/types/locks';

interface LockFilters {
  search?: string;
  createdBy?: string;
  tags?: string;
  includeTemplates?: boolean;
  includePublic?: boolean;
}

// Get all locks with filtering
export const useLocks = (filters?: LockFilters) => {
  return useQuery({
    queryKey: ['locks', filters],
    queryFn: async (): Promise<LockWithStats[]> => {
      const params = new URLSearchParams();
      
      if (filters?.search?.trim()) {
        params.append('search', filters.search.trim());
      }
      
      if (filters?.createdBy) {
        params.append('createdBy', filters.createdBy);
      }
      
      if (filters?.tags?.trim()) {
        params.append('tags', filters.tags.trim());
      }
      
      if (filters?.includeTemplates !== undefined) {
        params.append('includeTemplates', filters.includeTemplates.toString());
      }
      
      if (filters?.includePublic !== undefined) {
        params.append('includePublic', filters.includePublic.toString());
      }
      
      const response = await authFetchJson<LockListResponse>(`/api/locks?${params}`);
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Get single lock by ID
export const useLock = (lockId: number | null) => {
  return useQuery({
    queryKey: ['locks', lockId],
    queryFn: async (): Promise<LockWithStats> => {
      if (!lockId) throw new Error('Lock ID is required');
      const response = await authFetchJson<{ success: boolean; data: LockWithStats }>(`/api/locks/${lockId}`);
      return response.data;
    },
    enabled: !!lockId,
    staleTime: 5 * 60 * 1000,
  });
};

// Rename lock mutation
export const useRenameLock = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lockId, name }: { lockId: number; name: string }) => {
      const response = await authFetchJson<{ success: boolean; data: LockWithStats }>(`/api/locks/${lockId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim() }),
      });
      return response.data;
    },
    onSuccess: (updatedLock) => {
      // Update the specific lock in cache
      queryClient.setQueryData(['locks', updatedLock.id], updatedLock);
      
      // Invalidate the locks list to refresh it
      queryClient.invalidateQueries({ queryKey: ['locks'], exact: false });
    },
    onError: (error) => {
      console.error('Failed to rename lock:', error);
    }
  });
};

// Delete lock mutation
export const useDeleteLock = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (lockId: number) => {
      await authFetch(`/api/locks/${lockId}`, { 
        method: 'DELETE' 
      });
      return lockId;
    },
    onSuccess: (deletedLockId) => {
      // Remove the lock from cache
      queryClient.removeQueries({ queryKey: ['locks', deletedLockId] });
      
      // Invalidate the locks list to refresh it
      queryClient.invalidateQueries({ queryKey: ['locks'], exact: false });
    },
    onError: (error) => {
      console.error('Failed to delete lock:', error);
    }
  });
};

// Full lock update mutation (comprehensive editing)
export const useUpdateLock = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ lockId, updates }: { lockId: number; updates: Omit<UpdateLockRequest, 'id'> }) => {
      const response = await authFetchJson<{ success: boolean; data: LockWithStats }>(`/api/locks/${lockId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return response.data;
    },
    onSuccess: (updatedLock) => {
      // Update the specific lock in cache
      queryClient.setQueryData(['locks', updatedLock.id], updatedLock);
      
      // Invalidate the locks list to refresh it
      queryClient.invalidateQueries({ queryKey: ['locks'], exact: false });
      
      console.log(`[useLockManagement] Lock updated successfully: ${updatedLock.name}`);
    },
    onError: (error) => {
      console.error('Failed to update lock:', error);
    }
  });
};

// Duplicate lock mutation
export const useDuplicateLock = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sourceLockId: number) => {
      // Get source lock data
      const sourceResponse = await authFetchJson<{ success: boolean; data: LockWithStats }>(`/api/locks/${sourceLockId}`);
      const sourceLock = sourceResponse.data;
      
      // Get existing locks to generate unique name
      const locksData = queryClient.getQueryData<LockWithStats[]>(['locks']) || [];
      const existingNames = locksData.map(lock => lock.name.toLowerCase());
      
      // Generate unique name
      let candidateName = `${sourceLock.name} (Copy)`;
      let counter = 1;
      
      while (existingNames.includes(candidateName.toLowerCase())) {
        candidateName = `${sourceLock.name} (Copy ${counter})`;
        counter++;
      }
      
      // Create duplicate with modified data
      const duplicateData = {
        name: candidateName,
        description: sourceLock.description,
        icon: sourceLock.icon,
        color: sourceLock.color,
        gatingConfig: sourceLock.gatingConfig,
        tags: [...(sourceLock.tags || []), 'duplicated'].filter(Boolean),
        isPublic: false // Duplicates start as private
      };
      
      const response = await authFetchJson<{ success: boolean; data: LockWithStats }>('/api/locks', {
        method: 'POST',
        body: JSON.stringify(duplicateData),
      });
      
      return response.data;
    },
    onSuccess: (newLock) => {
      // Add the new lock to cache
      queryClient.setQueryData(['locks', newLock.id], newLock);
      
      // Invalidate the locks list to refresh it
      queryClient.invalidateQueries({ queryKey: ['locks'], exact: false });
    },
    onError: (error) => {
      console.error('Failed to duplicate lock:', error);
    }
  });
};

// Helper hook for lock management operations
export const useLockManagement = () => {
  const renameMutation = useRenameLock();
  const updateMutation = useUpdateLock();
  const deleteMutation = useDeleteLock();
  const duplicateMutation = useDuplicateLock();
  
  return {
    // Mutations
    renameLock: renameMutation.mutateAsync,
    updateLock: updateMutation.mutateAsync,
    deleteLock: deleteMutation.mutateAsync,
    duplicateLock: duplicateMutation.mutateAsync,
    
    // Loading states
    isRenaming: renameMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
    
    // Error states
    renameError: renameMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
    duplicateError: duplicateMutation.error,
    
    // Reset functions
    resetRenameError: renameMutation.reset,
    resetUpdateError: updateMutation.reset,
    resetDeleteError: deleteMutation.reset,
    resetDuplicateError: duplicateMutation.reset,
  };
}; 