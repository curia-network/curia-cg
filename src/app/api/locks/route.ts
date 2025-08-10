import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { query } from '@/lib/db';
import { 
  LockWithStats, 
  CreateLockRequest, 
  LockListResponse 
} from '@/types/locks';

// Database row interface for proper typing
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
  // Additional fields from joins/views
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

// Validate gating configuration
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

// GET /api/locks - List locks for current user's community
async function getLocksHandler(req: AuthenticatedRequest) {
  const currentUserId = req.user?.sub;
  const currentCommunityId = req.user?.cid;
  const isAdmin = req.user?.adm || false;
  
  if (!currentCommunityId) {
    console.warn('[API GET /api/locks] No community ID in token');
    return NextResponse.json({ error: 'Community context required' }, { status: 400 });
  }
  
  const { searchParams } = new URL(req.url);
  const includeTemplates = searchParams.get('includeTemplates') !== 'false'; // Default true
  const includePublic = searchParams.get('includePublic') !== 'false'; // Default true
  const createdBy = searchParams.get('createdBy'); // Filter by creator
  const search = searchParams.get('search'); // Search in name/description
  const tags = searchParams.get('tags'); // Comma-separated tags
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100); // Cap at 100
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  
  try {
    console.log(`[API GET /api/locks] User ${currentUserId} requesting locks for community ${currentCommunityId}`);
    
    // Build dynamic query based on filters
    const queryParams: (string | number | boolean)[] = [currentCommunityId];
    let whereClause = 'WHERE l.community_id = $1';
    let paramIndex = 2;
    
    // Build access conditions (user can see their own + public + templates + admin can see all)
    const accessConditions: string[] = [];
    
    // Always include user's own locks
    if (currentUserId) {
      accessConditions.push(`l.creator_user_id = $${paramIndex}`);
      queryParams.push(currentUserId);
      paramIndex++;
    }
    
    // Include public locks if requested
    if (includePublic) {
      accessConditions.push('l.is_public = true');
    }
    
    // Include templates if requested
    if (includeTemplates) {
      accessConditions.push('l.is_template = true');
    }
    
    // Admins can see all locks in community
    if (isAdmin) {
      accessConditions.push('1=1'); // Allow all
    }
    
    // If no access conditions, user can only see their own locks (if authenticated)
    if (accessConditions.length > 0) {
      whereClause += ` AND (${accessConditions.join(' OR ')})`;
    }
    
    // Add creator filter
    if (createdBy) {
      whereClause += ` AND l.creator_user_id = $${paramIndex}`;
      queryParams.push(createdBy);
      paramIndex++;
    }
    
    // Add search filter
    if (search && search.trim()) {
      whereClause += ` AND (l.name ILIKE $${paramIndex} OR l.description ILIKE $${paramIndex})`;
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }
    
    // Add tags filter
    if (tags && tags.trim()) {
      const tagList = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      if (tagList.length > 0) {
        whereClause += ` AND l.tags && $${paramIndex}::text[]`;
        queryParams.push(tagList as unknown as string); // PostgreSQL will handle array conversion
        paramIndex++;
      }
    }
    
    // Main query with stats from lock_stats view
    const mainQuery = `
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
      ${whereClause}
      ORDER BY 
        l.is_template DESC,  -- Templates first
        l.usage_count DESC,  -- Then by popularity
        l.created_at DESC    -- Then by recency
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    
    // Execute main query
    const result = await query(mainQuery, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM locks l
      ${whereClause}
    `;
    
    const countResult = await query(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total, 10);
    
    // Transform results
    const locks: LockWithStats[] = result.rows.map((row: LockRow) => 
      transformLockRow(row, currentUserId, isAdmin)
    );
    
    console.log(`[API GET /api/locks] Returning ${locks.length} locks (${total} total) for user ${currentUserId}`);
    
    const response: LockListResponse = {
      success: true,
      data: locks,
      pagination: {
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: offset + limit < total
      }
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[API GET /api/locks] Error fetching locks:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch locks' 
    }, { status: 500 });
  }
}

// POST /api/locks - Create new lock
async function createLockHandler(req: AuthenticatedRequest) {
  const currentUserId = req.user?.sub;
  const currentCommunityId = req.user?.cid;
  
  if (!currentCommunityId || !currentUserId) {
    return NextResponse.json({ error: 'Authentication and community context required' }, { status: 401 });
  }
  
  try {
    const body: CreateLockRequest = await req.json();
    const { name, description, icon, color, gatingConfig, tags, isPublic } = body;
    
    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Lock name is required' }, { status: 400 });
    }
    
    if (!gatingConfig) {
      return NextResponse.json({ error: 'Gating configuration is required' }, { status: 400 });
    }
    
    // Validate gating configuration
    const validation = validateGatingConfig(gatingConfig);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: 'Invalid gating configuration', 
        details: validation.errors 
      }, { status: 400 });
    }
    
    // Validate name uniqueness within community for this user
    const existingLock = await query(
      'SELECT id FROM locks WHERE community_id = $1 AND creator_user_id = $2 AND LOWER(name) = LOWER($3)',
      [currentCommunityId, currentUserId, name.trim()]
    );
    
    if (existingLock.rows.length > 0) {
      return NextResponse.json({ 
        error: 'You already have a lock with this name' 
      }, { status: 409 });
    }
    
    // Prepare data for insertion
    const cleanTags = Array.isArray(tags) ? tags.filter(t => t && t.trim()).map(t => t.trim()) : [];
    const lockData = {
      name: name.trim(),
      description: description?.trim() || null,
      icon: icon?.trim() || null,
      color: color?.trim() || null,
      gating_config: JSON.stringify(gatingConfig),
      creator_user_id: currentUserId,
      community_id: currentCommunityId,
      is_template: false, // Only admins can create templates (future feature)
      is_public: isPublic || false,
      tags: cleanTags
    };
    
    // Insert new lock
    const result = await query(`
      INSERT INTO locks (
        name, description, icon, color, gating_config,
        creator_user_id, community_id, is_template, is_public, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      lockData.name,
      lockData.description,
      lockData.icon,
      lockData.color,
      lockData.gating_config,
      lockData.creator_user_id,
      lockData.community_id,
      lockData.is_template,
      lockData.is_public,
      lockData.tags as unknown as string // PostgreSQL handles array conversion
    ]);
    
    const newLock = transformLockRow(result.rows[0], currentUserId);
    
    console.log(`[API POST /api/locks] Lock created: "${newLock.name}" (ID: ${newLock.id}) by user ${currentUserId}`);
    
    // Emit real-time event for new lock creation
    const emitter = process.customEventEmitter;
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit('broadcastEvent', {
        room: `community:${currentCommunityId}`,
        eventName: 'newLock',
        payload: {
          lock: newLock,
          author_user_id: currentUserId,
          community_id: currentCommunityId
        }
      });
      console.log('[API POST /api/locks] Successfully emitted newLock event');
    }
    
    return NextResponse.json({
      success: true,
      data: newLock
    }, { status: 201 });
    
  } catch (error) {
    console.error('[API POST /api/locks] Error creating lock:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create lock' 
    }, { status: 500 });
  }
}

export const GET = withAuth(getLocksHandler, false);
export const POST = withAuth(createLockHandler, false); 