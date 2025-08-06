import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, RouteContext } from '@/lib/withAuth';
import { ChatChannelQueries } from '@/lib/queries/chatChannels';
import { resolveChannel } from '@/lib/chatChannelPermissions';
import { ApiChatChannel, UpdateChatChannelRequest } from '@/types/chatChannels';

// GET /api/communities/[communityId]/chat-channels/[channelId] - Get single channel details
async function getChannelHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const { communityId, channelId } = params;
  const requestingUserId = req.user?.sub;
  const requestingUserCommunityId = req.user?.cid;

  if (!communityId || !channelId) {
    return NextResponse.json({ 
      error: 'Community ID and Channel ID are required' 
    }, { status: 400 });
  }

  // Security check: Users can only view channels in their own community
  if (communityId !== requestingUserCommunityId) {
    return NextResponse.json({ 
      error: 'Forbidden: You can only view channels in your own community.' 
    }, { status: 403 });
  }

  try {
    const channelIdNum = parseInt(channelId, 10);
    if (isNaN(channelIdNum)) {
      return NextResponse.json({ error: 'Invalid channel ID' }, { status: 400 });
    }

    // Use resolveChannel function which handles community ownership check
    const channel = await resolveChannel(channelIdNum, communityId);

    if (!channel) {
      return NextResponse.json({ 
        error: 'Channel not found or not accessible' 
      }, { status: 404 });
    }

    // Convert to ApiChatChannel format
    const channelResponse: ApiChatChannel = {
      ...channel,
      user_can_access: true, // If resolveChannel returned it, user can access it
      user_can_join: true,   // Same logic for now
    };

    console.log(`[API GET /api/communities/${communityId}/chat-channels/${channelId}] User ${requestingUserId} accessed channel: ${channel.name}`);

    return NextResponse.json({ channel: channelResponse });

  } catch (error) {
    console.error(`[API] Error fetching chat channel ${channelId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch chat channel' }, { status: 500 });
  }
}

// PATCH /api/communities/[communityId]/chat-channels/[channelId] - Update channel settings (Admin only)
async function updateChannelHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const { communityId, channelId } = params;
  const requestingUserId = req.user?.sub;
  const requestingUserCommunityId = req.user?.cid;

  if (!communityId || !channelId) {
    return NextResponse.json({ 
      error: 'Community ID and Channel ID are required' 
    }, { status: 400 });
  }

  // Security check: Only allow updating channels in user's own community
  if (communityId !== requestingUserCommunityId) {
    return NextResponse.json({ 
      error: 'Forbidden: You can only update channels in your own community.' 
    }, { status: 403 });
  }

  try {
    const channelIdNum = parseInt(channelId, 10);
    if (isNaN(channelIdNum)) {
      return NextResponse.json({ error: 'Invalid channel ID' }, { status: 400 });
    }

    const body: UpdateChatChannelRequest = await req.json();
    const { name, description, irc_channel_name, is_single_mode, is_default, settings = {} } = body;

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

    // Check if channel name is being changed and if it's unique
    if (name !== undefined) {
      const isNameUnique = await ChatChannelQueries.isChannelNameUnique(name.trim(), communityId, channelIdNum);
      if (!isNameUnique) {
        return NextResponse.json({ error: 'A channel with this name already exists' }, { status: 409 });
      }
    }

    // If setting as default, ensure no other default channel exists
    if (is_default === true) {
      const existingDefault = await ChatChannelQueries.getDefaultChannel(communityId);
      if (existingDefault && existingDefault.id !== channelIdNum) {
        return NextResponse.json({ 
          error: 'A default channel already exists. Only one default channel is allowed per community.' 
        }, { status: 409 });
      }
    }

    // Update channel
    const updatedChannel = await ChatChannelQueries.updateChannel(channelIdNum, communityId, {
      name,
      description,
      irc_channel_name,
      is_single_mode,
      is_default,
      settings
    });

    if (!updatedChannel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    console.log(`[API] Chat channel updated: ${updatedChannel.name} (ID: ${updatedChannel.id}) by user ${requestingUserId}`);

    // Emit socket event for channel update
    const emitter = process.customEventEmitter;
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit('broadcastEvent', {
        room: `community:${communityId}`,
        eventName: 'chatChannelUpdated',
        payload: { 
          channel: updatedChannel, 
          updated_by: requestingUserId,
          communityId: communityId,
          communityShortId: req.user?.communityShortId,
          pluginId: req.user?.pluginId
        }
      });
      console.log('[API PATCH /api/communities/.../chat-channels/...] Successfully emitted chatChannelUpdated event.');
    }

    return NextResponse.json(updatedChannel);

  } catch (error) {
    console.error(`[API] Error updating chat channel ${channelId}:`, error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update chat channel' }, { status: 500 });
  }
}

// DELETE /api/communities/[communityId]/chat-channels/[channelId] - Delete channel (Admin only)
async function deleteChannelHandler(req: AuthenticatedRequest, context: RouteContext) {
  const params = await context.params;
  const { communityId, channelId } = params;
  const requestingUserId = req.user?.sub;
  const requestingUserCommunityId = req.user?.cid;

  if (!communityId || !channelId) {
    return NextResponse.json({ 
      error: 'Community ID and Channel ID are required' 
    }, { status: 400 });
  }

  // Security check: Only allow deleting channels in user's own community
  if (communityId !== requestingUserCommunityId) {
    return NextResponse.json({ 
      error: 'Forbidden: You can only delete channels in your own community.' 
    }, { status: 403 });
  }

  try {
    const channelIdNum = parseInt(channelId, 10);
    if (isNaN(channelIdNum)) {
      return NextResponse.json({ error: 'Invalid channel ID' }, { status: 400 });
    }

    // Check if the channel exists and get its details for validation
    const existingChannel = await ChatChannelQueries.getChannelById(channelIdNum, communityId);
    if (!existingChannel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Prevent deletion of default channel
    if (existingChannel.is_default) {
      return NextResponse.json({ 
        error: 'Cannot delete the default channel. Please set another channel as default first.' 
      }, { status: 400 });
    }

    // Delete the channel
    const deleted = await ChatChannelQueries.deleteChannel(channelIdNum, communityId);

    if (!deleted) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    console.log(`[API] Chat channel deleted: ${existingChannel.name} (ID: ${channelId}) by user ${requestingUserId}`);

    // Emit socket event for channel deletion
    const emitter = process.customEventEmitter;
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit('broadcastEvent', {
        room: `community:${communityId}`,
        eventName: 'chatChannelDeleted',
        payload: { 
          channelId: channelIdNum,
          channelName: existingChannel.name,
          deleted_by: requestingUserId,
          communityId: communityId,
          communityShortId: req.user?.communityShortId,
          pluginId: req.user?.pluginId
        }
      });
      console.log('[API DELETE /api/communities/.../chat-channels/...] Successfully emitted chatChannelDeleted event.');
    }

    return NextResponse.json({ message: 'Chat channel deleted successfully' });

  } catch (error) {
    console.error(`[API] Error deleting chat channel ${channelId}:`, error);
    return NextResponse.json({ error: 'Failed to delete chat channel' }, { status: 500 });
  }
}

export const GET = withAuth(getChannelHandler, false); // Any authenticated user
export const PATCH = withAuth(updateChannelHandler, true); // Admin only
export const DELETE = withAuth(deleteChannelHandler, true); // Admin only