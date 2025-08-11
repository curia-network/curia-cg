/**
 * LUKSO Metadata API Route
 * 
 * This endpoint provides LUKSO token and profile metadata via GraphQL indexer,
 * serving as a backend proxy to eliminate CORS/CSP issues and provide caching.
 * 
 * POST /api/lukso/metadata - Batch metadata requests
 * GET /api/lukso/metadata/[address] - Single address metadata (future)
 */

import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withAuth } from '@/lib/withAuth';
import { getLuksoApiService, LuksoMetadataRequest } from '@/lib/lukso/LuksoApiService';

// ============================================================================
// POST HANDLER - Batch metadata requests
// ============================================================================

async function luksoMetadataHandler(req: AuthenticatedRequest) {
  const user = req.user;
  
  // Authentication is optional for token metadata, required for balances
  const startTime = Date.now();
  
  try {
    const body: LuksoMetadataRequest = await req.json();
    
    console.log(`[API /api/lukso/metadata] Request from user ${user?.sub || 'anonymous'}: ${body.type} for ${body.addresses?.length || 0} addresses`);
    
    // Validate request structure
    if (!body.addresses || !Array.isArray(body.addresses)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request: addresses array required',
        data: {}
      }, { status: 400 });
    }

    if (!body.type || !['tokens', 'profiles', 'mixed'].includes(body.type)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request: type must be tokens, profiles, or mixed',
        data: {}
      }, { status: 400 });
    }

    // Balance requests require authentication
    if (body.includeBalances && !user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required for balance requests',
        data: {}
      }, { status: 401 });
    }

    // Get service and process request
    const luksoService = getLuksoApiService();
    const response = await luksoService.fetchMetadata(body);

    // Add request metadata
    const responseWithMeta = {
      ...response,
      meta: {
        ...response.meta,
        requestTime: Date.now() - startTime,
        requestId: `lukso_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };

    console.log(`[API /api/lukso/metadata] Completed in ${Date.now() - startTime}ms - success: ${response.success}`);

    return NextResponse.json(responseWithMeta);

  } catch (error) {
    console.error('[API /api/lukso/metadata] Error processing request:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      data: {},
      meta: {
        cached: [],
        fetched: [],
        failed: [],
        timestamp: new Date().toISOString(),
        requestTime: Date.now() - startTime
      }
    }, { status: 500 });
  }
}

// ============================================================================
// ROUTE EXPORTS
// ============================================================================

// POST handler with optional authentication
export const POST = withAuth(luksoMetadataHandler, false); // adminOnly = false

// GET handler for health checks
export async function GET() {
  return NextResponse.json({
    service: 'LUKSO Metadata API',
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /api/lukso/metadata': 'Batch metadata requests for tokens/profiles',
    },
    supported_types: ['tokens', 'profiles', 'mixed'],
    max_addresses_per_request: 50
  });
}
