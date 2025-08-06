/**
 * SojuAdminService - HTTP client for Soju IRC bouncer admin operations
 * 
 * This service communicates with the curia-irc-bouncer-sidecar HTTP API
 * which handles all the complex sojuctl command execution and parsing.
 * 
 * Environment Variables:
 * - SOJU_SIDECAR_URL: URL of the sidecar service (default: http://localhost:3001)
 * - SOJU_ADMIN_API_TOKEN: Authentication token for sidecar API
 */

// Type definitions for admin operations
export interface CreateUserParams {
  ircUsername: string;
  ircPassword: string;
  nickname: string;
  realname: string;
}

export interface CreateNetworkParams {
  ircUsername: string;
  nickname: string;
}

export interface SojuAdminResponse {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * HTTP client for Soju admin operations via sidecar service
 */
export class SojuAdminService {
  private readonly sidecarUrl: string;
  private readonly apiToken: string;
  private readonly timeout: number = 30000; // 30 seconds

  constructor() {
    this.sidecarUrl = process.env.SOJU_SIDECAR_URL || 'http://localhost:3003';
    this.apiToken = process.env.SOJU_ADMIN_API_TOKEN || '';
    
    if (!this.apiToken) {
      console.warn('[SojuAdmin] SOJU_ADMIN_API_TOKEN not configured - sidecar calls will fail');
    }
    
    console.log('[SojuAdmin] Initialized HTTP client:', {
      sidecarUrl: this.sidecarUrl,
      hasToken: !!this.apiToken
    });
  }

  /**
   * Create a new IRC user via sidecar API
   */
  async createUser(params: CreateUserParams): Promise<SojuAdminResponse> {
    console.log('[SojuAdmin] Creating IRC user via sidecar:', {
      ircUsername: params.ircUsername,
      nickname: params.nickname,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await this.makeRequest('POST', '/api/users', {
        ircUsername: params.ircUsername,
        ircPassword: params.ircPassword,
        nickname: params.nickname,
        realname: params.realname
      });

      console.log('[SojuAdmin] User creation successful:', {
        ircUsername: params.ircUsername,
        output: response.output?.substring(0, 100)
      });

      return response;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SojuAdmin] Failed to create user:', {
        ircUsername: params.ircUsername,
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Create a network connection for an IRC user via sidecar API
   */
  async createNetwork(params: CreateNetworkParams): Promise<SojuAdminResponse> {
    console.log('[SojuAdmin] Creating IRC network via sidecar:', {
      ircUsername: params.ircUsername,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await this.makeRequest('POST', '/api/networks', {
        ircUsername: params.ircUsername,
        nickname: params.nickname
      });

      console.log('[SojuAdmin] Network creation successful:', {
        ircUsername: params.ircUsername,
        output: response.output?.substring(0, 100)
      });

      return response;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SojuAdmin] Failed to create network:', {
        ircUsername: params.ircUsername,
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Update an existing user's password via sidecar API
   */
  async updateUserPassword(ircUsername: string, ircPassword: string): Promise<SojuAdminResponse> {
    console.log('[SojuAdmin] Updating user password via sidecar:', {
      ircUsername,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await this.makeRequest('PUT', `/api/users/${encodeURIComponent(ircUsername)}`, {
        ircPassword
      });

      console.log('[SojuAdmin] Password update successful:', {
        ircUsername,
        output: response.output?.substring(0, 100)
      });

      return response;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SojuAdmin] Failed to update password:', {
        ircUsername,
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Provision user (create new or update existing) via sidecar API
   * This is the main method used by the IRC provisioning endpoint
   */
  async provisionUser(params: CreateUserParams): Promise<SojuAdminResponse> {
    console.log('[SojuAdmin] Provisioning IRC user via sidecar:', {
      ircUsername: params.ircUsername,
      nickname: params.nickname,
      timestamp: new Date().toISOString()
    });

    try {
      // Try to create user first
      const userResult = await this.createUser(params);
      
      if (!userResult.success) {
        // Check if it failed because user already exists
        if (userResult.error && userResult.error.includes('already exists')) {
          console.log('[SojuAdmin] User exists, updating password via sidecar:', params.ircUsername);
          
          // Update password instead
          const passwordResult = await this.updateUserPassword(params.ircUsername, params.ircPassword);
          if (!passwordResult.success) {
            throw new Error(`Failed to update password via sidecar: ${passwordResult.error}`);
          }
          
          // Continue to network creation for existing users too
          console.log('[SojuAdmin] Password updated, now ensuring network exists for existing user:', params.ircUsername);
        } else {
          // Real error - rethrow
          throw new Error(userResult.error || 'Unknown user creation error from sidecar');
        }
      }

      // Now create/ensure network exists (for both new and existing users)
      const networkResult = await this.createNetwork({
        ircUsername: params.ircUsername,
        nickname: params.nickname
      });

      if (!networkResult.success) {
        console.warn('[SojuAdmin] Network creation failed via sidecar:', {
          ircUsername: params.ircUsername,
          networkError: networkResult.error
        });
        // Don't fail the whole operation for network creation
      }

      // Determine success message based on whether user was new or existing
      const wasExistingUser = userResult && !userResult.success && userResult.error && userResult.error.includes('already exists');
      const message = wasExistingUser 
        ? `Updated existing user ${params.ircUsername} and ensured network via sidecar`
        : `Created new user ${params.ircUsername} with network via sidecar`;

      return {
        success: true,
        output: message
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SojuAdmin] Failed to provision user via sidecar:', {
        ircUsername: params.ircUsername,
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Test sidecar connectivity
   */
  async testConnection(): Promise<SojuAdminResponse> {
    console.log('[SojuAdmin] Testing sidecar connection...');
    
    try {
      const response = await this.makeRequest('GET', '/api/test');
      
      console.log('[SojuAdmin] Sidecar connection test successful:', {
        output: response.output?.substring(0, 100)
      });
      
      return response;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SojuAdmin] Sidecar connection test failed:', errorMessage);
      
      return {
        success: false,
        error: `Sidecar connection test failed: ${errorMessage}`
      };
    }
  }

  /**
   * Make HTTP request to sidecar API
   */
  private async makeRequest(method: string, path: string, body?: any): Promise<SojuAdminResponse> {
    const url = `${this.sidecarUrl}${path}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        // eslint-disable-next-line no-restricted-syntax -- Service-to-service communication with sidecar API token
        'Authorization': `Bearer ${this.apiToken}`
      },
      signal: AbortSignal.timeout(this.timeout)
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    console.log('[SojuAdmin] Making sidecar request:', {
      method,
      url,
      hasBody: !!body,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        // Include details field to preserve "already exists" error messages
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
        const fullError = errorData.details ? `${errorMessage}: ${errorData.details}` : errorMessage;
        throw new Error(fullError);
      }

      const result = await response.json();
      
      // Normalize sidecar response to our format
      return {
        success: result.success !== false, // Default to true unless explicitly false
        output: result.output || result.message,
        error: result.error
      };
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Sidecar request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Get configuration summary for debugging
   */
  getConfig() {
    return {
      sidecarUrl: this.sidecarUrl,
      hasApiToken: !!this.apiToken,
      timeout: this.timeout,
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export const sojuAdminService = new SojuAdminService();