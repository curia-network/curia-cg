import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withAuth } from '@/lib/withAuth';
import { sojuAdminService } from '@/lib/SojuAdminService';
import { 
  generateIrcUsername, 
  generateIrcNickname,
  generateSecurePassword
} from '@curia_/curia-chat-modal';

// Using SojuAdminService instead of direct database access

interface ProvisionResponse {
  success: boolean;
  ircUsername: string;
  ircPassword: string; // Generated password for The Lounge
  networkName: string;
}

async function provisionIrcUserHandler(req: AuthenticatedRequest) {
  const user = req.user;
  
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  // Use community ID from JWT token instead of request body
  const communityId = user.cid;
  
  if (!communityId) {
    return NextResponse.json(
      { error: 'Community ID not found in authentication token' }, 
      { status: 400 }
    );
  }

  try {
    // Generate IRC username (avoid conflicts)
    const ircUsername = generateIrcUsername(user.name || user.sub, user.sub);
    
    // Generate IRC-compliant nickname (stricter rules than username)
    const ircNickname = generateIrcNickname(user.name || user.sub);
    
    // Generate secure password for IRC
    const ircPassword = generateSecurePassword();

    // Provision user (create or update) via admin interface (no restart needed!)
    const provisionResult = await sojuAdminService.provisionUser({
      ircUsername,
      ircPassword,
      nickname: ircNickname,
      realname: user.name || ircUsername
    });

    if (!provisionResult.success) {
      throw new Error(`Failed to provision user: ${provisionResult.error}`);
    }

    console.log('[IRC Provision] Successfully provisioned IRC user via admin interface:', {
      ircUsername,
      userId: user.sub,
      userName: user.name,
      communityId,
      networkName: 'commonground',
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      ircUsername,
      ircPassword, // Plain password for The Lounge login
      networkName: 'commonground'
    } as ProvisionResponse);
    
  } catch (error) {
    console.error('[IRC Provision] Error provisioning IRC user:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      userId: user.sub,
      userName: user.name,
      communityId,
      timestamp: new Date().toISOString()
    });
    
    // Return user-friendly error message
    const userMessage = error instanceof Error && error.message.includes('connection') 
      ? 'Unable to connect to chat service. Please try again.'
      : 'Failed to set up chat access. Please try again or contact support.';
      
    return NextResponse.json(
      { error: userMessage, details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(provisionIrcUserHandler, false);
