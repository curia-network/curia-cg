import dotenv from 'dotenv';

// Load environment variables for custom server (development only)
if (process.env.NODE_ENV === 'development') {
  // Load .env first
  const envResult = dotenv.config({ path: '.env' });
  console.log('[Server] dotenv.config attempt for .env:',
    envResult.error ? envResult.error.message : 'OK',
    'Parsed vars:', envResult.parsed ? Object.keys(envResult.parsed) : 'None'
  );

  // Then load .env.development, allowing it to override .env for development
  const envDevResult = dotenv.config({ path: '.env.development', override: true });
  console.log('[Server] dotenv.config attempt for .env.development (with override):',
    envDevResult.error ? envDevResult.error.message : 'OK',
    'Parsed vars:', envDevResult.parsed ? Object.keys(envDevResult.parsed) : 'None'
  );
}

import next from "next";
import { createServer } from "node:http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from 'jsonwebtoken';
import { canUserAccessBoard, isAccessibleBoard } from './src/lib/boardPermissions';
import { query } from './src/lib/db';
import { JwtPayload } from './src/lib/withAuth';
import { EventEmitter } from 'events';
import { telegramEventHandler } from './src/lib/telegram/TelegramEventHandler';
// 🆕 Redis adapter imports
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

// Load environment variables for custom server (development only)
// if (process.env.NODE_ENV !== 'production' && !process.env.JWT_SECRET) {
//  require('dotenv').config();
//  console.log('[Server] Loaded .env file for development');
// }

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Debug environment variables loading
console.log('[Server] Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  hasJWT_SECRET: !!process.env.JWT_SECRET,
  hasDATABASE_URL: !!process.env.DATABASE_URL,
  hasREDIS_URL: !!process.env.REDIS_URL,
  PORT: process.env.PORT || '3000'
});

// Global Socket.IO instance
let io: SocketIOServer;

// Create a global event emitter instance
if (!(process as any).customEventEmitter) {
  (process as any).customEventEmitter = new EventEmitter();
  console.log('[Server] CustomEventEmitter initialized on process object');
}
const customEventEmitter = (process as any).customEventEmitter;

// ===== ENHANCED MULTI-DEVICE PRESENCE SYSTEM =====

// Device-specific presence tracking
interface DevicePresence {
  frameUID: string;              // Unique device identifier from Common Ground
  userId: string;
  userName: string;
  avatarUrl?: string;
  communityId: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  currentBoardId?: number;
  currentBoardName?: string;
  connectedAt: Date;
  lastSeen: Date;
  socketId: string;
  isActive: boolean;             // Active in last 30 seconds
  
  // 🆕 Cross-community navigation metadata
  communityShortId?: string;     // For URL construction
  pluginId?: string;             // For URL construction
  
  // NEW: Typing state tracking
  isTyping?: boolean;
  typingPostId?: number;
  typingBoardId?: number;
  typingContext?: 'post' | 'comment';
  typingTimestamp?: Date;
}

// User-aggregated presence for client consumption
interface EnhancedUserPresence {
  userId: string;
  userName: string;
  avatarUrl?: string;
  communityId: string;
  devices: DevicePresence[];
  totalDevices: number;
  isOnline: boolean;             // Any device active
  primaryDevice: DevicePresence; // Most recently active device
  lastSeen: Date;                // Most recent across all devices
}

// Multi-device presence tracking (in-memory for Phase 1)
const devicePresence = new Map<string, DevicePresence>();  // frameUID -> DevicePresence
const userPresence = new Map<string, EnhancedUserPresence>(); // userId -> EnhancedUserPresence

// Rate limiting for presence updates
const userEventLimits = new Map<string, { count: number; resetTime: number }>();
const userPresenceUpdates = new Map<string, NodeJS.Timeout>();

// Event broadcasting configuration
interface BroadcastConfig {
  globalRoom: boolean;          // Should broadcast to global room
  specificRooms: string[];      // Specific rooms to broadcast to
  invalidateForAllUsers: boolean; // Should trigger React Query invalidation for all users with access
}

// Event type definitions for type safety and documentation
interface BroadcastEvent {
  eventName: string;
  payload: any;
  config: BroadcastConfig;
}

// Enhanced socket interface with user data
interface AuthenticatedSocket extends Socket {
  data: {
    user: JwtPayload;
  };
}

/**
 * Get partner communities that allow cross-community notifications from the source community
 */
async function getNotificationPartners(sourceCommunityId: string): Promise<string[]> {
  try {
    const result = await query(`
      SELECT DISTINCT
        CASE 
          -- If we're the source, check if target allows notifications from us
          WHEN source_community_id = $1 AND (target_to_source_permissions->>'allowCrossCommunityNotifications')::boolean = true 
          THEN target_community_id
          -- If we're the target, check if source allows notifications to us  
          WHEN target_community_id = $1 AND (source_to_target_permissions->>'allowCrossCommunityNotifications')::boolean = true
          THEN source_community_id  
        END as partner_community_id
      FROM community_partnerships 
      WHERE status = 'accepted' 
        AND (source_community_id = $1 OR target_community_id = $1)
        AND CASE 
          WHEN source_community_id = $1 THEN (target_to_source_permissions->>'allowCrossCommunityNotifications')::boolean = true
          WHEN target_community_id = $1 THEN (source_to_target_permissions->>'allowCrossCommunityNotifications')::boolean = true
          ELSE false
        END
    `, [sourceCommunityId]);
    
    const partners = result.rows
      .map(row => row.partner_community_id)
      .filter(id => id && id !== sourceCommunityId); // Ensure no null values and no self-references
    
    console.log(`[Partnership Broadcasting] Community ${sourceCommunityId} has ${partners.length} notification partners:`, partners);
    return partners;
  } catch (error) {
    console.error('[Partnership Broadcasting] Error fetching notification partners:', error);
    return []; // Return empty array on error to prevent breaking notifications
  }
}

/**
 * Enhanced broadcasting system with partnership-aware cross-community notifications
 * and React Query cache invalidation based on user access permissions
 */
async function broadcastEvent(event: BroadcastEvent) {
  const { eventName, payload, config } = event;
  
  console.log(`[Socket.IO Partnership-Aware Broadcast] Event: ${eventName}`, {
    communityId: payload.communityId,
    specificRooms: config.specificRooms,
    invalidateForAllUsers: config.invalidateForAllUsers
  });

  // 1. Always broadcast to source community room
  if (payload.communityId) {
    io.to(`community:${payload.communityId}`).emit(eventName, payload);
    
    // 2. Get partner communities that allow cross-community notifications
    const partnerCommunities = await getNotificationPartners(payload.communityId);
    
    if (partnerCommunities.length > 0) {
      console.log(`[Partnership Broadcasting] Sending to ${partnerCommunities.length} partner communities:`, partnerCommunities);
      
      // 3. Broadcast to each partner community with cross-community metadata
      partnerCommunities.forEach(partnerId => {
        io.to(`community:${partnerId}`).emit(eventName, {
          ...payload,
          // 🔗 Cross-community metadata for client-side handling
          isCrossCommunityNotification: true,
          sourceCommunityId: payload.communityId,
          sourceCommunityName: `Partner Community`, // TODO: Could fetch actual name
          crossCommunityNav: {
            communityShortId: payload.communityShortId,
            pluginId: payload.pluginId
          }
        });
      });
    }
  } else {
    console.warn('[Partnership Broadcasting] No communityId in payload, skipping cross-community broadcast');
  }

  // 4. Broadcast to specific rooms (boards, etc.) - unchanged behavior
  config.specificRooms.forEach(room => {
    io.to(room).emit(eventName, payload);
  });

  // For events that trigger universal React Query invalidation,
  // we now broadcast to both source community and permitted partner communities.
}

/**
 * Device type detection based on user agent
 */
function detectDeviceType(userAgent?: string): 'desktop' | 'mobile' | 'tablet' {
  if (!userAgent) return 'desktop';
  
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|opera mobi|skyfire|maemo|windows phone|palm|iemobile|symbian|symbianos|fennec/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Rate limiting check for user presence events
 */
function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = userEventLimits.get(userId);
  
  if (!limit || now > limit.resetTime) {
    // Reset counter every minute
    userEventLimits.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (limit.count >= 30) { // Max 30 presence events per minute per user
    console.warn(`[Rate Limit] User ${userId} exceeded presence event limit`);
    return false;
  }
  
  limit.count++;
  return true;
}

/**
 * Aggregate device presence into user presence
 */
function aggregateUserPresence(userId: string): EnhancedUserPresence | null {
  const userDevices = Array.from(devicePresence.values())
    .filter(device => device.userId === userId);
  
  if (userDevices.length === 0) return null;
  
  // Sort devices by last activity (most recent first)
  userDevices.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  
  // Find primary device (most recently active)
  const primaryDevice = userDevices[0];
  
  return {
    userId,
    userName: primaryDevice.userName,
    avatarUrl: primaryDevice.avatarUrl,
    communityId: primaryDevice.communityId,
    devices: userDevices,
    totalDevices: userDevices.length,
    isOnline: userDevices.some(d => d.isActive),
    primaryDevice,
    lastSeen: new Date(Math.max(...userDevices.map(d => d.lastSeen.getTime())))
  };
}

/**
 * Get current online users for presence sync (enhanced)
 */
function getOnlineUsers(): EnhancedUserPresence[] {
  return Array.from(userPresence.values());
}

/**
 * Debounced user presence update to prevent event spam
 */
function debouncedPresenceUpdate(userId: string) {
  // Check rate limit
  if (!checkUserRateLimit(userId)) return;
  
  // Clear existing timeout
  if (userPresenceUpdates.has(userId)) {
    clearTimeout(userPresenceUpdates.get(userId));
  }
  
  // Set new timeout to batch updates
  const timeout = setTimeout(() => {
    const aggregatedUser = aggregateUserPresence(userId);
    if (aggregatedUser) {
      userPresence.set(userId, aggregatedUser);
      
      // Broadcast presence change to community room
      broadcastEvent({
        eventName: 'userPresenceUpdate',
        payload: { 
          userPresence: aggregatedUser,
          communityId: aggregatedUser.communityId  // Add community context
        },
        config: {
          globalRoom: false,
          specificRooms: [],
          invalidateForAllUsers: false
        }
      });
    } else {
      // User has no devices, remove from user presence
      userPresence.delete(userId);
      
      // Broadcast user offline to their community
      // Note: We need to get the user's community ID from somewhere
      // For now, we'll skip community broadcasting for offline events
      // as we can't determine the community ID from just the userId
      console.log(`[Socket.IO] User ${userId} went offline (no community broadcast)`);
      // TODO: Store user community mapping for offline events
    }
    
    userPresenceUpdates.delete(userId);
  }, 500); // 500ms debounce window
  
  userPresenceUpdates.set(userId, timeout);
}

/**
 * Update device presence and trigger user aggregation
 */
function updateDevicePresence(frameUID: string, updates: Partial<DevicePresence>) {
  const existing = devicePresence.get(frameUID);
  if (existing) {
    const updated = { ...existing, ...updates, lastSeen: new Date() };
    devicePresence.set(frameUID, updated);
    
    // Trigger debounced user presence update
    debouncedPresenceUpdate(existing.userId);
  }
}

async function bootstrap() {
  console.log('[Server] Preparing Next.js...');
  await app.prepare();

  // Create HTTP server with Next.js handler
  const httpServer = createServer((req, res) => handle(req, res));

  // Initialize Socket.IO
  console.log('[Socket.IO] Initializing server...');
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || []
        : true, // Allow all origins in development
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // 🆕 Attach Redis adapter for multi-instance support
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      console.log('[Socket.IO] Setting up Redis adapter...');
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      
      // Handle Redis connection errors
      pubClient.on('error', (err: Error) => {
        console.error('[Socket.IO Redis] Pub client error:', err);
      });
      subClient.on('error', (err: Error) => {
        console.error('[Socket.IO Redis] Sub client error:', err);
      });
      
      // Connect both clients
      await Promise.all([pubClient.connect(), subClient.connect()]);
      
      // Attach the Redis adapter
      io.adapter(createAdapter(pubClient, subClient));
      
      console.log('[Socket.IO] Redis adapter initialized successfully - multi-instance coordination enabled');
    } catch (error) {
      console.error('[Socket.IO] Failed to initialize Redis adapter:', error);
      console.warn('[Socket.IO] Continuing without Redis adapter - single instance mode');
    }
  } else {
    console.warn('[Socket.IO] REDIS_URL not provided - running without Redis adapter (single instance mode)');
  }

  console.log('[Socket.IO] Server instance created with global presence system');

  // ===== ENHANCED EVENT SYSTEM =====
  
  // Setup listeners for events from API routes with partnership-aware broadcasting
  customEventEmitter.on('broadcastEvent', async (eventDetails: { room: string; eventName: string; payload: any }) => {
    const { room, eventName, payload } = eventDetails;
    
    // Determine broadcasting strategy based on event type
    let config: BroadcastConfig;
    
    switch (eventName) {
      case 'newPost':
        config = {
          globalRoom: false,             // ✅ Community + partner communities
          specificRooms: [],             // 🔧 PHASE 3A: Community-only broadcasting
          invalidateForAllUsers: true    // React Query invalidation for community users
        };
        break;
        
      case 'voteUpdate':
        config = {
          globalRoom: false,             // ✅ Community + partner communities
          specificRooms: [],             // 🔧 PHASE 3A: Community-only broadcasting
          invalidateForAllUsers: true    // Community users get fresh data
        };
        break;
        
      case 'reactionUpdate':
        config = {
          globalRoom: false,             // 🔧 SILENT EVENT: Community-only (no partners)
          specificRooms: [],             // Silent events are pointless for cross-community
          invalidateForAllUsers: false   // Community users only (no partner broadcasting)
        };
        break;
        
      case 'newComment':
        config = {
          globalRoom: false,             // ✅ Community + partner communities
          specificRooms: [],             // 🔧 PHASE 3A: Community-only broadcasting
          invalidateForAllUsers: true    // Community users get fresh data
        };
        break;
        
      case 'newBoard':
        config = {
          globalRoom: false,             // ✅ Community + partner communities
          specificRooms: [],             // 🔧 PHASE 3A: Community-only broadcasting
          invalidateForAllUsers: true    // Community board lists need invalidation
        };
        break;
        
      case 'boardSettingsChanged':
        config = {
          globalRoom: false,             // 🔧 COMMUNITY-ONLY: Partners can't see board settings impact
          specificRooms: [],             // Board settings irrelevant to other communities
          invalidateForAllUsers: false   // Community users only (no partner broadcasting)
        };
        break;
        
      // ===== PARTNERSHIP EVENTS (ADMIN-ONLY) =====
      
      case 'partnershipInviteReceived':
      case 'partnershipStatusChanged':
        config = {
          globalRoom: false,             // 🎯 ADMIN-ONLY: No cross-community broadcasting
          specificRooms: [room],         // Already targets admin room (community:X:admins)
          invalidateForAllUsers: false   // Admin-only, no general React Query invalidation
        };
        break;
        
      // userJoinedBoard and userLeftBoard events removed - presence system handles this
        
      default:
        // Default: broadcast only to specific room
        config = {
          globalRoom: false,
          specificRooms: [room],
          invalidateForAllUsers: false
        };
    }
    
    try {
      await broadcastEvent({
        eventName,
        payload,
        config
      });
    } catch (error) {
      console.error('[Partnership Broadcasting] Error in broadcastEvent:', error);
      // Continue execution to prevent breaking the event system
    }
  });

  // ===== TELEGRAM NOTIFICATION SYSTEM =====
  
  // Setup parallel listener for Telegram notifications (NON-BLOCKING)
  customEventEmitter.on('broadcastEvent', (eventDetails: { room: string; eventName: string; payload: any }) => {
    // Fire and forget - don't await to avoid blocking HTTP responses
    telegramEventHandler.handleBroadcastEvent(eventDetails)
      .then(() => {
        // Success - TelegramEventHandler already logs success details
      })
      .catch(error => {
        // Log error but don't crash the main event system
        console.error('[Telegram] Async notification failed:', error);
      });
  });

  // JWT Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const currentJwtSecret = process.env.JWT_SECRET;
      console.log('[Socket.IO Auth] Checking JWT. Secret available:', !!currentJwtSecret, 'Value (first 5 chars):', currentJwtSecret?.substring(0,5));

      if (!currentJwtSecret) {
        console.error('[Socket.IO Auth] JWT_SECRET is not available at runtime!');
        return next(new Error('Server configuration error'));
      }

      const token = socket.handshake.auth?.token || 
                   socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT using same logic as API routes
      const decoded = jwt.verify(token, currentJwtSecret) as JwtPayload;
      
      // Attach user data to socket
      socket.data.user = decoded;
      
      console.log(`[Socket.IO] User authenticated: ${decoded.sub} (community: ${decoded.cid})`);
      
      next();
    } catch (error) {
      console.error('[Socket.IO] Authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // ===== CROSS-INSTANCE PRESENCE SYNC =====
  
  /**
   * Merge presence results from multiple servers, handling duplicate users
   * who may have devices connected to different instances
   */
  function mergePresenceResults(serverResults: EnhancedUserPresence[][]): EnhancedUserPresence[] {
    // Flatten all results and group by userId
    const allUsers = serverResults.flat();
    const userMap = new Map<string, EnhancedUserPresence>();
    
    for (const user of allUsers) {
      const existing = userMap.get(user.userId);
      if (existing) {
        // Merge devices from multiple servers for the same user
        const combinedDevices = [...existing.devices, ...user.devices];
        const mostRecentDevice = combinedDevices.reduce((latest, current) => 
          current.lastSeen > latest.lastSeen ? current : latest
        );
        
        userMap.set(user.userId, {
          ...user,
          devices: combinedDevices,
          totalDevices: combinedDevices.length,
          primaryDevice: mostRecentDevice,
          lastSeen: mostRecentDevice.lastSeen
        });
      } else {
        userMap.set(user.userId, user);
      }
    }
    
    return Array.from(userMap.values());
  }
  
  /**
   * Handle requests for presence data from other instances
   * Each server responds with its local online users
   */
  io.on('getAllPresence', (callback) => {
    try {
      const localUsers = getOnlineUsers();
      console.log(`[Socket.IO Cross-Instance] Responding to presence request with ${localUsers.length} local users`);
      callback(localUsers);
    } catch (error) {
      console.error('[Socket.IO Cross-Instance] Failed to get local presence:', error);
      callback([]);
    }
  });

  // Socket connection handling
  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.data.user;
    console.log(`[Socket.IO] User connected: ${user.sub} (${user.name || 'Unknown'})`);

    // ===== PHASE 1: COMMUNITY-SCOPED NOTIFICATION SYSTEM =====
    
    // Auto-join user to community room only (no more global spam!)
    socket.join(`community:${user.cid}`);
    
    // 🆕 JOIN ADMIN ROOM if user is admin
    if (user.adm) {
      socket.join(`community:${user.cid}:admins`);
      console.log(`[Socket.IO] Admin ${user.sub} joined admin room: community:${user.cid}:admins`);
    }
    
    // Extract frameUID from JWT for device identification
    const frameUID = user.uid || `fallback-${socket.id}`;
    const deviceType = detectDeviceType(socket.handshake.headers['user-agent']);
    
    // Add device to presence tracking
    const devicePresenceData: DevicePresence = {
      frameUID,
      userId: user.sub,
      userName: user.name || 'Unknown',
      avatarUrl: user.picture || undefined,
      communityId: user.cid || 'unknown',
      deviceType,
      currentBoardId: undefined,
      currentBoardName: undefined,
      connectedAt: new Date(),
      lastSeen: new Date(),
      socketId: socket.id,
      isActive: true,
      
      // 🆕 Extract cross-community navigation metadata from JWT
      communityShortId: user.communityShortId,
      pluginId: user.pluginId
    };
    
    devicePresence.set(frameUID, devicePresenceData);
    
    // Aggregate and update user presence
    const aggregatedUser = aggregateUserPresence(user.sub);
    if (aggregatedUser) {
      userPresence.set(user.sub, aggregatedUser);
      
      // Broadcast user online to community room
      broadcastEvent({
        eventName: 'userOnline',
        payload: { 
          userPresence: aggregatedUser,
          communityId: user.cid  // Add community context for broadcasting
        },
        config: {
          globalRoom: false,
          specificRooms: [],
          invalidateForAllUsers: false
        }
      });
    }
    
    // Send initial presence sync to new user (from ALL instances)
    io.serverSideEmit('getAllPresence', (err: Error | null, results?: EnhancedUserPresence[][]) => {
      if (err || !results) {
        console.error('[Socket.IO Cross-Instance] Failed to get global presence:', err);
        socket.emit('globalPresenceSync', getOnlineUsers()); // fallback to local
      } else {
        const allUsers = mergePresenceResults(results);
        console.log(`[Socket.IO Cross-Instance] Sending ${allUsers.length} users from ${results.length} instances`);
        socket.emit('globalPresenceSync', allUsers);
      }
    });
    
    console.log(`[Socket.IO Multi-Device Presence] User ${user.sub} connected with device ${frameUID} (${deviceType}). Total devices: ${devicePresence.size}`);

    // Handle board room joining with permission checks
    socket.on('joinBoard', async (boardId: string | number) => {
      try {
        const boardIdNum = parseInt(boardId.toString(), 10);
        if (isNaN(boardIdNum)) {
          socket.emit('error', { message: 'Invalid board ID' });
          return;
        }

        // Fetch board data and verify permissions
        const boardResult = await query(
          'SELECT id, community_id, settings, name FROM boards WHERE id = $1',
          [boardIdNum]
        );

        if (boardResult.rows.length === 0) {
          socket.emit('error', { message: 'Board not found' });
          return;
        }

        const board = boardResult.rows[0];
        
        // Verify user can access this board (owned or imported)
        if (!user.cid) {
          socket.emit('error', { message: 'Access denied: invalid user community' });
          return;
        }
        
        const canAccessBoard = await isAccessibleBoard(boardIdNum, user.cid);
        if (!canAccessBoard) {
          socket.emit('error', { message: 'Access denied: board not accessible' });
          return;
        }

        // Check board permissions
        const boardSettings = typeof board.settings === 'string' 
          ? JSON.parse(board.settings) 
          : board.settings;

        const canAccess = canUserAccessBoard(user.roles, boardSettings, user.adm);
        
        if (!canAccess) {
          socket.emit('error', { message: 'Access denied: insufficient permissions' });
          return;
        }

        // Join the board room
        const roomName = `board:${boardIdNum}`;
        socket.join(roomName);
        
        // Update device presence with current board
        const frameUID = user.uid || `fallback-${socket.id}`;
        updateDevicePresence(frameUID, { 
          currentBoardId: boardIdNum, 
          currentBoardName: board.name,
          isActive: true 
        });
        
        console.log(`[Socket.IO] User ${user.sub} joined board room: ${roomName}`);
        
        // Notify user of successful join
        socket.emit('boardJoined', { boardId: boardIdNum });
        
        // ✅ Presence system handles board location tracking automatically via updateDevicePresence()
        // No need for discrete join/leave events - presence shows "User X is in Board Y"

      } catch (error) {
        console.error('[Socket.IO] Error joining board:', error);
        socket.emit('error', { message: 'Failed to join board' });
      }
    });

    // Handle leaving board rooms
    socket.on('leaveBoard', (boardId: string | number) => {
      const boardIdNum = parseInt(boardId.toString(), 10);
      const roomName = `board:${boardIdNum}`;
      
      socket.leave(roomName);
      
      // Update device presence (remove current board)
      const frameUID = user.uid || `fallback-${socket.id}`;
      updateDevicePresence(frameUID, { 
        currentBoardId: undefined, 
        currentBoardName: undefined,
        isActive: true 
      });
      
      console.log(`[Socket.IO] User ${user.sub} left board room: ${roomName}`);
      
      // ✅ Presence system handles board location tracking automatically via updateDevicePresence()
      // No need for discrete join/leave events - presence shows when user leaves boards
    });

    // Enhanced typing indicators with post context and title resolution
    socket.on('typing', async (data: { 
      boardId: number; 
      postId?: number; 
      isTyping: boolean;
      context?: 'post' | 'comment';
    }) => {
      try {
        let postTitle: string | undefined;
        
        // Resolve post title if postId provided and user is starting to type
        if (data.postId && data.isTyping) {
          const postResult = await query(
            'SELECT title FROM posts WHERE id = $1 AND board_id = $2',
            [data.postId, data.boardId]
          );
          postTitle = postResult.rows[0]?.title;
        }
        
        // Update device presence with typing state
        const frameUID = user.uid || `fallback-${socket.id}`;
        updateDevicePresence(frameUID, {
          isTyping: data.isTyping,
          typingPostId: data.isTyping ? data.postId : undefined,
          typingBoardId: data.isTyping ? data.boardId : undefined,
          typingContext: data.isTyping ? data.context : undefined,
          typingTimestamp: data.isTyping ? new Date() : undefined,
          isActive: true
        });
        
        // 🔧 PHASE 3A: Commented out userTyping events (never worked, too frequent)
        /*
        const roomName = `board:${data.boardId}`;
        socket.to(roomName).emit('userTyping', {
          userId: user.sub,
          userName: user.name,
          boardId: data.boardId,
          postId: data.postId,
          postTitle,
          isTyping: data.isTyping,
          context: data.context,
          timestamp: Date.now()
        });
        */
        
        console.log(`[Socket.IO Enhanced Typing] User ${user.sub} ${data.isTyping ? 'started' : 'stopped'} typing${postTitle ? ` on "${postTitle}"` : ` in board ${data.boardId}`}`);
        
      } catch (error) {
        console.error('[Socket.IO] Error handling typing event:', error);
        // 🔧 PHASE 3A: Commented out fallback userTyping events (never worked, too frequent)
        /*
        const roomName = `board:${data.boardId}`;
        socket.to(roomName).emit('userTyping', {
          userId: user.sub,
          userName: user.name,
          boardId: data.boardId,
          postId: data.postId,
          isTyping: data.isTyping,
          context: data.context,
          timestamp: Date.now()
        });
        */
      }
    });

    // Handle disconnection with multi-device presence cleanup
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] User disconnected: ${user.sub} (reason: ${reason})`);
      
      const frameUID = user.uid || `fallback-${socket.id}`;
      const device = devicePresence.get(frameUID);
      
      // If user was typing, send stop typing event to clean up indicators
      if (device?.isTyping && device.typingBoardId) {
        const roomName = `board:${device.typingBoardId}`;
        socket.to(roomName).emit('userTyping', {
          userId: user.sub,
          userName: user.name,
          boardId: device.typingBoardId,
          postId: device.typingPostId,
          isTyping: false,
          context: device.typingContext,
          timestamp: Date.now()
        });
        console.log(`[Socket.IO Cleanup] Stopped typing indicator for disconnected user ${user.sub}`);
      }
      
      // Remove device from presence
      devicePresence.delete(frameUID);

      // Update user presence (may remove user if no devices left)
      debouncedPresenceUpdate(user.sub);
      
      // 🔧 PHASE 3A: Commented out board-specific userLeftBoard broadcasts on disconnect
      // These would require async/await refactoring and proper community context
      // Users will see presence updates through the main presence system instead
      /* 
      for (const room of socket.rooms) {
        if (room.startsWith('board:')) {
          const boardId = room.split(':')[1];
          socket.to(room).emit('userLeftBoard', {
            userId: user.sub,
            boardId: parseInt(boardId, 10)
          });
        }
      }
      */
      
      console.log(`[Socket.IO Multi-Device Presence] Device ${frameUID} disconnected. Total devices: ${devicePresence.size}, Users: ${userPresence.size}`);
    });
  });

  // Enhanced periodic cleanup of stale devices and typing indicators
  setInterval(() => {
    const staleThreshold = Date.now() - (2 * 60 * 1000); // 2 minutes (shorter for better UX)
    const typingStaleThreshold = Date.now() - (15 * 1000); // 15 seconds for typing indicators
    const staleFrameUIDs: string[] = [];
    const staleTypingDevices: DevicePresence[] = [];
    let cleanedDevices = 0;
    let cleanedTyping = 0;
    
    // Find stale devices and stale typing indicators
    for (const [frameUID, device] of devicePresence.entries()) {
      // Check for stale devices
      if (device.lastSeen.getTime() < staleThreshold) {
        staleFrameUIDs.push(frameUID);
        cleanedDevices++;
      }
      // Check for stale typing indicators (separate from device staleness)
      else if (device.isTyping && 
               device.typingTimestamp && 
               device.typingTimestamp.getTime() < typingStaleThreshold) {
        staleTypingDevices.push(device);
        cleanedTyping++;
      }
    }
    
    // Clean up stale typing indicators
    staleTypingDevices.forEach(device => {
      if (device.typingBoardId) {
        // Broadcast stop typing event
        const roomName = `board:${device.typingBoardId}`;
        io.to(roomName).emit('userTyping', {
          userId: device.userId,
          userName: device.userName,
          boardId: device.typingBoardId,
          postId: device.typingPostId,
          isTyping: false,
          context: device.typingContext,
          timestamp: Date.now()
        });
        
        // Update device to remove typing state
        updateDevicePresence(device.frameUID, {
          isTyping: false,
          typingPostId: undefined,
          typingBoardId: undefined,
          typingContext: undefined,
          typingTimestamp: undefined
        });
      }
    });
    
    // Batch cleanup of stale devices and user presence updates
    const affectedUsers = new Set<string>();
    staleFrameUIDs.forEach(frameUID => {
      const device = devicePresence.get(frameUID);
      if (device) {
        // Send stop typing event if device was typing
        if (device.isTyping && device.typingBoardId) {
          const roomName = `board:${device.typingBoardId}`;
          io.to(roomName).emit('userTyping', {
            userId: device.userId,
            userName: device.userName,
            boardId: device.typingBoardId,
            postId: device.typingPostId,
            isTyping: false,
            context: device.typingContext,
            timestamp: Date.now()
          });
        }
        
        devicePresence.delete(frameUID);
        affectedUsers.add(device.userId);
      }
    });
    
    // Update affected users
    affectedUsers.forEach(userId => {
      debouncedPresenceUpdate(userId);
    });
    
    if (cleanedDevices > 0 || cleanedTyping > 0) {
      console.log(`[Socket.IO Cleanup] Removed ${cleanedDevices} stale devices, ${cleanedTyping} stale typing indicators affecting ${affectedUsers.size} users. Total devices: ${devicePresence.size}, Users: ${userPresence.size}`);
    }
  }, 30 * 1000); // Run every 30 seconds for better typing cleanup

  // Start the HTTP server
  const port = parseInt(process.env.PORT || '3000', 10);
  const hostname = '0.0.0.0'; // Recommended for containerized environments
  httpServer.listen(port, hostname, () => {
    console.log(`[Server] Ready on http://${hostname}:${port}`);
    console.log(`[Socket.IO] WebSocket server ready with global presence system`);
  });
}

// Start the server
bootstrap().catch((err) => {
  console.error('[Server] Startup error:', err);
  process.exit(1);
}); 