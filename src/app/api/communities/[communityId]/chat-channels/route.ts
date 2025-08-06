import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, RouteContext } from '@/lib/withAuth';
import { ChatChannelQueries } from '@/lib/queries/chatChannels';
import { filterAccessibleChatChannels, canUserAccessChatChannel, generateIrcChannelName } from '@/lib/chatChannelPermissions';
import { CreateChatChannelRequest } from '@/types/chatChannels';
import { query } from '@/lib/db';

// GET /api/communities/[communityId]/chat-channels - List community chat channels
async function getCommunityChannelsHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const { communityId } = params;
  const requestingUserId = req.user?.sub;
  const requestingUserCommunityId = req.user?.cid;
  const userRoles = req.user?.roles;
  const isAdmin = req.user?.adm || false;

  if (!communityId) {
    return NextResponse.json({ error: 'Community ID is required' }, { status: 400 });
  }

  // Security check: Users can only view channels in their own community
  if (communityId !== requestingUserCommunityId) {
    return NextResponse.json({ 
      error: 'Forbidden: You can only view channels in your own community.' 
    }, { status: 403 });
  }

  try {
    // Get all channels for this community
    let allChannels = await ChatChannelQueries.getChannelsByCommunity(communityId);
    
    // AUTO-CREATE DEFAULT CHANNEL: If no channels exist, create one using community name
    if (allChannels.length === 0) {
      console.log(`[API GET /api/communities/${communityId}/chat-channels] No channels found, auto-creating default channel`);
      
      try {
        // Get community name for channel creation
        const communityResult = await query(
          'SELECT name FROM communities WHERE id = $1',
          [communityId]
        );
        
        if (communityResult.rows.length === 0) {
          console.error(`[API] Community ${communityId} not found during channel auto-creation`);
          return NextResponse.json({ error: 'Community not found' }, { status: 404 });
        }
        
        const communityName = communityResult.rows[0].name;
        console.log(`[API] Auto-creating default channel for community: ${communityName}`);
        
        // Create default channel using community name
        const defaultChannel = await ChatChannelQueries.createChannel({
          community_id: communityId,
          name: communityName, // Use actual community name, not "General"
          description: `Main chat for ${communityName}`,
          irc_channel_name: generateIrcChannelName(communityName), // Auto-generated IRC name
          is_single_mode: true,
          is_default: true,
          settings: {
            permissions: {
              // No role restrictions - public to all community members
            },
            irc: {
              autoconnect: true,
              lockchannel: true,
              nofocus: true,
              welcomeMessage: `Welcome to ${communityName} chat!`
            },
            ui: {
              defaultTheme: 'auto',
              allowThemeSwitch: true,
              showUserList: true,
              allowMentions: true
            }
          }
        });
        
        console.log(`[API] Successfully auto-created default channel: ${defaultChannel.name} (${defaultChannel.irc_channel_name})`);
        allChannels = [defaultChannel]; // Use the newly created channel
        
      } catch (autoCreateError) {
        console.error(`[API] Error auto-creating default channel for community ${communityId}:`, autoCreateError);
        // Don't fail the request - just continue with empty channels
        // This ensures backward compatibility if auto-creation fails
      }
    }
    
    // SECURITY: Filter channels based on user permissions
    const accessibleChannels = filterAccessibleChatChannels(allChannels, userRoles, isAdmin);
    
    // Add access permission flags for each channel
    const channelsWithPermissions = accessibleChannels.map(channel => ({
      ...channel,
      user_can_access: true, // All returned channels are accessible
      user_can_join: canUserAccessChatChannel(userRoles, channel.settings, isAdmin) // Same logic for now, could be different in future
    }));
    
    console.log(`[API GET /api/communities/${communityId}/chat-channels] User ${requestingUserId} can access ${channelsWithPermissions.length}/${allChannels.length} channels`);
    
    return NextResponse.json(channelsWithPermissions);

  } catch (error) {
    console.error(`[API] Error fetching chat channels for community ${communityId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch chat channels' }, { status: 500 });
  }
}

// POST /api/communities/[communityId]/chat-channels - Create new chat channel (admin only)
async function createChannelHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const { communityId } = params;
  const requestingUserId = req.user?.sub;
  const requestingUserCommunityId = req.user?.cid;

  if (!communityId) {
    return NextResponse.json({ error: 'Community ID is required' }, { status: 400 });
  }

  // Security check: Only allow creating channels in user's own community
  if (communityId !== requestingUserCommunityId) {
    return NextResponse.json({ 
      error: 'Forbidden: You can only create channels in your own community.' 
    }, { status: 403 });
  }

  try {
    const body: CreateChatChannelRequest = await req.json();
    const { name, description, irc_channel_name, is_single_mode = true, is_default = false, settings = {} } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
    }

    // Validate settings if provided
    if (settings && Object.keys(settings).length > 0) {
      // Basic validation - could be enhanced with a proper schema validator
      if (settings.permissions?.allowedRoles && !Array.isArray(settings.permissions.allowedRoles)) {
        return NextResponse.json({ error: 'allowedRoles must be an array' }, { status: 400 });
      }

      // Validate lock gating configuration
      if (settings.permissions?.locks) {
        const locks = settings.permissions.locks;
        
        if (!Array.isArray(locks.lockIds)) {
          return NextResponse.json({ error: 'locks.lockIds must be an array' }, { status: 400 });
        }
        
        if (!locks.lockIds.every((id: unknown) => typeof id === 'number')) {
          return NextResponse.json({ error: 'All lock IDs must be numbers' }, { status: 400 });
        }
        
        if (locks.fulfillment && !['any', 'all'].includes(locks.fulfillment)) {
          return NextResponse.json({ error: 'locks.fulfillment must be "any" or "all"' }, { status: 400 });
        }
        
        if (locks.verificationDuration && (typeof locks.verificationDuration !== 'number' || locks.verificationDuration <= 0)) {
          return NextResponse.json({ error: 'locks.verificationDuration must be a positive number' }, { status: 400 });
        }
      }

      // Validate IRC settings
      if (settings.irc) {
        const ircSettings = settings.irc;
        if (ircSettings.autoconnect !== undefined && typeof ircSettings.autoconnect !== 'boolean') {
          return NextResponse.json({ error: 'irc.autoconnect must be a boolean' }, { status: 400 });
        }
        if (ircSettings.lockchannel !== undefined && typeof ircSettings.lockchannel !== 'boolean') {
          return NextResponse.json({ error: 'irc.lockchannel must be a boolean' }, { status: 400 });
        }
        if (ircSettings.nofocus !== undefined && typeof ircSettings.nofocus !== 'boolean') {
          return NextResponse.json({ error: 'irc.nofocus must be a boolean' }, { status: 400 });
        }
      }

      // Validate UI settings
      if (settings.ui) {
        const uiSettings = settings.ui;
        if (uiSettings.defaultTheme && !['auto', 'light', 'dark'].includes(uiSettings.defaultTheme)) {
          return NextResponse.json({ error: 'ui.defaultTheme must be "auto", "light", or "dark"' }, { status: 400 });
        }
      }
    }

    // Check if channel name already exists in this community
    const isNameUnique = await ChatChannelQueries.isChannelNameUnique(name.trim(), communityId);
    if (!isNameUnique) {
      return NextResponse.json({ error: 'A channel with this name already exists' }, { status: 409 });
    }

    // If setting as default, ensure no other default channel exists
    if (is_default) {
      const existingDefault = await ChatChannelQueries.getDefaultChannel(communityId);
      if (existingDefault) {
        return NextResponse.json({ 
          error: 'A default channel already exists. Only one default channel is allowed per community.' 
        }, { status: 409 });
      }
    }

    // Create the channel
    const newChannel = await ChatChannelQueries.createChannel({
      community_id: communityId,
      name: name.trim(),
      description: description?.trim() || undefined,
      irc_channel_name,
      is_single_mode,
      is_default,
      settings
    });

    console.log(`[API] Chat channel created: ${newChannel.name} (ID: ${newChannel.id}) in community ${communityId} by user ${requestingUserId}`);

    // Emit socket event for new channel creation
    const emitter = process.customEventEmitter;
    console.log('[API POST /api/communities/.../chat-channels] Attempting to use process.customEventEmitter. Emitter available:', !!emitter);
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit('broadcastEvent', {
        room: `community:${communityId}`,
        eventName: 'newChatChannel',
        payload: { 
          channel: newChannel, 
          author_user_id: requestingUserId,
          // Add community context for cross-community broadcasting
          communityId: communityId,
          communityShortId: req.user?.communityShortId,
          pluginId: req.user?.pluginId
        }
      });
      console.log('[API POST /api/communities/.../chat-channels] Successfully emitted newChatChannel event.');
    } else {
      console.error('[API POST /api/communities/.../chat-channels] ERROR: process.customEventEmitter not available.');
    }

    return NextResponse.json(newChannel, { status: 201 });

  } catch (error) {
    console.error(`[API] Error creating chat channel for community ${communityId}:`, error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create chat channel' }, { status: 500 });
  }
}

export const GET = withAuth(getCommunityChannelsHandler, false); // Any authenticated user
export const POST = withAuth(createChannelHandler, true); // Admin only