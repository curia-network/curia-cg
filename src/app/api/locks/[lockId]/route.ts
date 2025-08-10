import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, RouteContext } from '@/lib/withAuth';
import { query } from '@/lib/db';
import { 
  LockWithStats, 
  UpdateLockRequest,
  LockApiResponse 
} from '@/types/locks';

// Database row interface (reused from main route)
interface LockRow {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  gating_config: string | Record<string, unknown>;
  creator_user_id: string;
  community_id: string;
  is_template: boolean;
  is_public: boolean;
  tags: string[];
  usage_count: number;
  success_rate: number;
  avg_verification_time: number;
  created_at: string;
  updated_at: string;
  posts_using_lock?: number;
  creator_name?: string;
}

// Transform database row to API Lock object
function transformLockRow(row: LockRow, currentUserId?: string, isAdmin?: boolean): LockWithStats {
  const isOwner = row.creator_user_id === currentUserId;
  const canEditOrDelete = isOwner || (isAdmin === true); // Admins and owners can edit/delete
  
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    icon: row.icon || undefined,
    color: row.color || undefined,
    gatingConfig: typeof row.gating_config === 'string' 
      ? JSON.parse(row.gating_config) 
      : row.gating_config,
    creatorUserId: row.creator_user_id,
    communityId: row.community_id,
    isTemplate: row.is_template,
    isPublic: row.is_public,
    tags: row.tags || [],
    usageCount: row.usage_count,
    successRate: row.success_rate,
    avgVerificationTime: row.avg_verification_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Computed properties
    postsUsingLock: row.posts_using_lock || 0,
    isOwned: isOwner,
    canEdit: canEditOrDelete, // Admins and owners can edit
    canDelete: canEditOrDelete // Admins and owners can delete
  };
}

// Validate gating configuration (reused from main route)
function validateGatingConfig(gatingConfig: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!gatingConfig || typeof gatingConfig !== 'object') {
    errors.push('Gating configuration must be an object');
    return { valid: false, errors };
  }
  
  const config = gatingConfig as Record<string, unknown>;
  
  // Validate categories array
  if (!Array.isArray(config.categories)) {
    errors.push('Gating configuration must include categories array');
    return { valid: false, errors };
  }
  
  if (config.categories.length === 0) {
    errors.push('At least one gating category is required');
    return { valid: false, errors };
  }
  
  // Validate each category
  for (let i = 0; i < config.categories.length; i++) {
    const category = config.categories[i];
    if (!category || typeof category !== 'object') {
      errors.push(`Category ${i + 1} must be an object`);
      continue;
    }
    
    const cat = category as Record<string, unknown>;
    if (!cat.type || typeof cat.type !== 'string') {
      errors.push(`Category ${i + 1} must have a valid type`);
    }
    
    if (typeof cat.enabled !== 'boolean') {
      errors.push(`Category ${i + 1} must have enabled boolean field`);
    }
    
    // 🚀 NEW: Validate fulfillment field
    if (cat.fulfillment !== undefined) {
      if (!['any', 'all'].includes(cat.fulfillment as string)) {
        errors.push(`Category ${i + 1} fulfillment must be "any" or "all"`);
      }
    }
    
    if (!cat.requirements) {
      errors.push(`Category ${i + 1} must have requirements object`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// GET /api/locks/[lockId] - Get specific lock
async function getLockHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const lockId = parseInt(params.lockId, 10);
  const currentUserId = req.user?.sub;
  const currentCommunityId = req.user?.cid;
  const isAdmin = req.user?.adm || false;
  
  if (isNaN(lockId)) {
    return NextResponse.json({ error: 'Invalid lock ID' }, { status: 400 });
  }
  
  if (!currentCommunityId) {
    return NextResponse.json({ error: 'Community context required' }, { status: 400 });
  }
  
  try {
    console.log(`[API GET /api/locks/${lockId}] User ${currentUserId} requesting lock`);
    
    // Get lock with stats
    const result = await query(`
      SELECT 
        l.id, l.name, l.description, l.icon, l.color, l.gating_config,
        l.creator_user_id, l.community_id, l.is_template, l.is_public,
        l.tags, l.usage_count, l.success_rate, l.avg_verification_time,
        l.created_at, l.updated_at,
        ls.posts_using_lock,
        u.name as creator_name
      FROM locks l
      LEFT JOIN lock_stats ls ON l.id = ls.id
      LEFT JOIN users u ON l.creator_user_id = u.user_id
      WHERE l.id = $1
    `, [lockId]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
    }
    
    const lockData = result.rows[0];
    
    // Verify lock belongs to user's community
    if (lockData.community_id !== currentCommunityId) {
      console.warn(`[API GET /api/locks/${lockId}] User ${currentUserId} from community ${currentCommunityId} attempted to access lock from community ${lockData.community_id}`);
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
    }
    
    // Check access permissions
    const canAccess = 
      lockData.creator_user_id === currentUserId || // Owner
      lockData.is_public ||                         // Public
      lockData.is_template ||                       // Template
      isAdmin;                                      // Admin
    
    if (!canAccess) {
      console.warn(`[API GET /api/locks/${lockId}] User ${currentUserId} attempted to access private lock ${lockId}`);
      return NextResponse.json({ error: 'You do not have permission to view this lock' }, { status: 403 });
    }
    
    const lock = transformLockRow(lockData, currentUserId, isAdmin);
    
    console.log(`[API GET /api/locks/${lockId}] Successfully retrieved lock "${lock.name}" for user ${currentUserId}`);
    
    const response: LockApiResponse<LockWithStats> = {
      success: true,
      data: lock
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error(`[API GET /api/locks/${lockId}] Error fetching lock:`, error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch lock' 
    }, { status: 500 });
  }
}

// PUT /api/locks/[lockId] - Update lock (owner or admin only)
async function updateLockHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const lockId = parseInt(params.lockId, 10);
  const currentUserId = req.user?.sub;
  const currentCommunityId = req.user?.cid;
  const isAdmin = req.user?.adm || false;
  
  if (isNaN(lockId)) {
    return NextResponse.json({ error: 'Invalid lock ID' }, { status: 400 });
  }
  
  if (!currentCommunityId || !currentUserId) {
    return NextResponse.json({ error: 'Authentication and community context required' }, { status: 401 });
  }
  
  try {
    const body: UpdateLockRequest = await req.json();
    const { name, description, icon, color, gatingConfig, tags, isPublic } = body;
    
    // Get existing lock
    const existingResult = await query(
      'SELECT * FROM locks WHERE id = $1',
      [lockId]
    );
    
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
    }
    
    const existingLock = existingResult.rows[0];
    
    // Verify lock belongs to user's community
    if (existingLock.community_id !== currentCommunityId) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
    }
    
    // Check edit permissions (owner or admin)
    if (existingLock.creator_user_id !== currentUserId && !isAdmin) {
      return NextResponse.json({ error: 'You do not have permission to edit this lock' }, { status: 403 });
    }
    
    // Validate gating configuration if provided
    if (gatingConfig) {
      const validation = validateGatingConfig(gatingConfig);
      if (!validation.valid) {
        return NextResponse.json({ 
          error: 'Invalid gating configuration', 
          details: validation.errors 
        }, { status: 400 });
      }
    }
    
    // Check name uniqueness if name is being changed
    if (name && name.trim() !== existingLock.name) {
      const nameCheck = await query(
        'SELECT id FROM locks WHERE community_id = $1 AND creator_user_id = $2 AND LOWER(name) = LOWER($3) AND id != $4',
        [currentCommunityId, currentUserId, name.trim(), lockId]
      );
      
      if (nameCheck.rows.length > 0) {
        return NextResponse.json({ 
          error: 'You already have a lock with this name' 
        }, { status: 409 });
      }
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const updateParams: (string | boolean | null)[] = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      updateParams.push(name.trim());
      paramIndex++;
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      updateParams.push(description?.trim() || null);
      paramIndex++;
    }
    
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex}`);
      updateParams.push(icon?.trim() || null);
      paramIndex++;
    }
    
    if (color !== undefined) {
      updates.push(`color = $${paramIndex}`);
      updateParams.push(color?.trim() || null);
      paramIndex++;
    }
    
    if (gatingConfig !== undefined) {
      updates.push(`gating_config = $${paramIndex}`);
      updateParams.push(JSON.stringify(gatingConfig));
      paramIndex++;
    }
    
    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      const cleanTags = Array.isArray(tags) ? tags.filter(t => t && t.trim()).map(t => t.trim()) : [];
      updateParams.push(cleanTags as unknown as string); // PostgreSQL handles array conversion
      paramIndex++;
    }
    
    if (isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex}`);
      updateParams.push(isPublic);
      paramIndex++;
    }
    
    // Always update the updated_at timestamp
    updates.push(`updated_at = NOW()`);
    
    if (updates.length === 1) { // Only the timestamp update
      return NextResponse.json({ error: 'No fields provided for update' }, { status: 400 });
    }
    
    // Execute update
    updateParams.push(lockId.toString()); // Add lockId for WHERE clause
    const updateQuery = `
      UPDATE locks 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await query(updateQuery, updateParams);
    const updatedLock = transformLockRow(result.rows[0], currentUserId, isAdmin);
    
    console.log(`[API PUT /api/locks/${lockId}] Lock updated: "${updatedLock.name}" by user ${currentUserId}`);
    
    // Emit real-time event for lock update
    const emitter = process.customEventEmitter;
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit('broadcastEvent', {
        room: `community:${currentCommunityId}`,
        eventName: 'lockUpdated',
        payload: {
          lock: updatedLock,
          updated_by: currentUserId,
          community_id: currentCommunityId
        }
      });
      console.log('[API PUT /api/locks] Successfully emitted lockUpdated event');
    }
    
    const response: LockApiResponse<LockWithStats> = {
      success: true,
      data: updatedLock
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error(`[API PUT /api/locks/${lockId}] Error updating lock:`, error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update lock' 
    }, { status: 500 });
  }
}

// DELETE /api/locks/[lockId] - Delete lock (owner or admin only)
async function deleteLockHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const lockId = parseInt(params.lockId, 10);
  const currentUserId = req.user?.sub;
  const currentCommunityId = req.user?.cid;
  const isAdmin = req.user?.adm || false;
  
  if (isNaN(lockId)) {
    return NextResponse.json({ error: 'Invalid lock ID' }, { status: 400 });
  }
  
  if (!currentCommunityId || !currentUserId) {
    return NextResponse.json({ error: 'Authentication and community context required' }, { status: 401 });
  }
  
  try {
    // Get existing lock and check usage
    const existingResult = await query(`
      SELECT l.*, ls.posts_using_lock
      FROM locks l
      LEFT JOIN lock_stats ls ON l.id = ls.id
      WHERE l.id = $1
    `, [lockId]);
    
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
    }
    
    const existingLock = existingResult.rows[0];
    
    // Verify lock belongs to user's community
    if (existingLock.community_id !== currentCommunityId) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
    }
    
    // Check delete permissions (owner or admin)
    if (existingLock.creator_user_id !== currentUserId && !isAdmin) {
      return NextResponse.json({ error: 'You do not have permission to delete this lock' }, { status: 403 });
    }
    
    // Check if lock is currently in use
    const postsUsingLock = existingLock.posts_using_lock || 0;
    if (postsUsingLock > 0) {
      return NextResponse.json({ 
        error: `Cannot delete lock: it is currently used by ${postsUsingLock} post(s)`,
        details: {
          postsUsingLock,
          suggestion: 'Remove the lock from all posts before deleting, or consider keeping it for historical purposes'
        }
      }, { status: 409 });
    }
    
    // Delete the lock
    await query('DELETE FROM locks WHERE id = $1', [lockId]);
    
    console.log(`[API DELETE /api/locks/${lockId}] Lock "${existingLock.name}" deleted by user ${currentUserId}`);
    
    // Emit real-time event for lock deletion
    const emitter = process.customEventEmitter;
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit('broadcastEvent', {
        room: `community:${currentCommunityId}`,
        eventName: 'lockDeleted',
        payload: {
          lockId: lockId,
          lockName: existingLock.name,
          deleted_by: currentUserId,
          community_id: currentCommunityId
        }
      });
      console.log('[API DELETE /api/locks] Successfully emitted lockDeleted event');
    }
    
    const response: LockApiResponse = {
      success: true,
      message: 'Lock deleted successfully'
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error(`[API DELETE /api/locks/${lockId}] Error deleting lock:`, error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete lock' 
    }, { status: 500 });
  }
}

export const GET = withAuth(getLockHandler, false);
export const PUT = withAuth(updateLockHandler, false);
export const DELETE = withAuth(deleteLockHandler, false); 