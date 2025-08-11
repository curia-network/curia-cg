import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { GatingCategoryStatus, UPGatingRequirements } from '@/types/gating';
import { useUniversalProfile } from '@/contexts/UniversalProfileContext';
import { useUPRequirementVerification } from '@/hooks/gating/up/useUPRequirementVerification';
import { RichRequirementsDisplay } from '@/components/gating/RichRequirementsDisplay';
import { EthereumSmartVerificationButton } from '../ethereum/EthereumSmartVerificationButton';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/utils/authFetch';

interface UniversalProfileGatingPanelProps {
  requirements: UPGatingRequirements;
  fulfillment: 'any' | 'all';
  onStatusUpdate: (status: GatingCategoryStatus) => void;
  onVerificationComplete?: () => void;
  isPreviewMode?: boolean;
  postId?: number;
  verificationContext?: {
    type: 'board' | 'post' | 'preview';
    communityId?: string;
    boardId?: number;
    postId?: number;
    lockId?: number;
  };
}

export const UniversalProfileGatingPanel: React.FC<UniversalProfileGatingPanelProps> = ({
  requirements,
  fulfillment,
  onStatusUpdate,
  onVerificationComplete,
  isPreviewMode,
  postId,
  verificationContext
}) => {
  const { upAddress, connect, disconnect, signMessage } = useUniversalProfile();
  const { token } = useAuth();
  
  const { isLoading, verificationStatus, error: localVerificationError } = useUPRequirementVerification(upAddress, requirements);
  
  const [isVerifying, setIsVerifying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverVerified, setServerVerified] = useState(false);

  const { allRequirementsMet, checks } = useMemo(() => {
    if (isLoading || !verificationStatus.connected) {
      return { allRequirementsMet: false, checks: [] };
    }
    
    const lyxMet = verificationStatus.balances?.lyx && requirements.minLyxBalance
      ? verificationStatus.balances.lyx >= BigInt(requirements.minLyxBalance)
      : undefined;

    const tokenChecks = requirements.requiredTokens?.map((req, index) => {
      // Use the same verification key logic as RichRequirementsDisplay for Issue B fix
      const tokenKey = req.tokenId ? `${req.contractAddress}-${req.tokenId}` : `${req.contractAddress}-${req.minAmount}-${index}`;
      const balance = BigInt(verificationStatus.balances?.tokens?.[tokenKey]?.raw || '0');
      const required = BigInt(req.minAmount || '1');
      return balance >= required;
    });

    const followerChecks = requirements.followerRequirements?.map(req => {
      const key = `${req.type}-${req.value}`;
      return verificationStatus.followerStatus?.[key] || false;
    });

    const allChecks = [
      ...(lyxMet !== undefined ? [lyxMet] : []),
      ...(tokenChecks || []),
      ...(followerChecks || []),
    ];

    let isMet = false;
    if (allChecks.length > 0) {
      if (fulfillment === 'any') {
        isMet = allChecks.some(c => c === true);
      } else {
        isMet = allChecks.every(c => c === true);
      }
    } else {
      isMet = true;
    }
    return { allRequirementsMet: isMet, checks: allChecks };
  }, [isLoading, verificationStatus, requirements, fulfillment]);

  // Report status up to the parent component
  useEffect(() => {
    if (isLoading) return;
    const metCount = checks.filter(c => c === true).length;
    const totalCount = checks.length;
    onStatusUpdate({
      met: metCount,
      total: totalCount,
      isMet: allRequirementsMet,
    });
  }, [allRequirementsMet, checks, onStatusUpdate, isLoading]);

  const handleBackendVerification = useCallback(async () => {
    // In preview mode, don't do backend verification
    if (isPreviewMode) {
      console.log('[UP] Preview mode - no backend verification needed');
      return;
    }

    if (!upAddress || !token) {
      console.error('[UP] Missing required data for verification:', { upAddress: !!upAddress, token: !!token });
      return;
    }

    // Determine verification context
    const context = verificationContext || (postId ? { type: 'post' as const, postId } : null);
    
    if (!context) {
      console.error('[UP] No verification context provided');
      return;
    }

    // Use generic verification flow for all contexts
    const lockId = context.lockId;
    if (!lockId) {
      setServerError('Missing lockId for verification');
      return;
    }

    setIsVerifying(true);
    setServerError(null);
    
    try {
      // Determine verification context
      let verifyContext: { type: 'post' | 'board'; id: number };
      if (context.type === 'board') {
        verifyContext = { type: 'board', id: context.boardId! };
      } else if (context.type === 'post') {
        verifyContext = { type: 'post', id: context.postId || postId! };
      } else {
        throw new Error(`Unsupported verification context type: ${context.type}`);
      }

      // Create standardized signing message
      const message = `Verify universal_profile for lock access
Lock ID: ${lockId}
Address: ${upAddress}
Context: ${verifyContext.type}:${verifyContext.id}
Timestamp: ${Date.now()}
Chain: LUKSO

This signature proves you control this address and grants access based on lock requirements.`;

      console.log('[UP] Signing verification message...');
      const signature = await signMessage(message);

      console.log('[UP] Submitting to generic verification endpoint...');
      const verificationResponse = await authFetch(`/api/locks/${lockId}/verify/universal_profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          message,
          address: upAddress,
          context: verifyContext,
          verificationData: {
            requirements
          }
        }),
      });

      if (!verificationResponse.ok) {
        const errorData = await verificationResponse.json();
        throw new Error(errorData.error || 'Verification failed');
      }

      const result = await verificationResponse.json();

      if (result.success) {
        console.log('[UP] ✅ Generic verification completed successfully');
        setServerVerified(true);
        onVerificationComplete?.();
      } else {
        throw new Error(result.message || result.error || 'Verification failed');
      }

    } catch (e) {
      console.error('[UP] Generic verification failed:', e);
      setServerError(e instanceof Error ? e.message : 'An unknown error occurred.');
    } finally {
      setIsVerifying(false);
    }
  }, [upAddress, token, isPreviewMode, verificationContext, postId, signMessage, onVerificationComplete, requirements]);

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      console.error("Failed to connect Universal Profile:", error);
    }
  };

  const getButtonState = () => {
    if (isVerifying) return 'verifying';
    if (serverVerified) return 'verification_complete';
    if (!allRequirementsMet) return 'requirements_not_met';
    if (isPreviewMode && allRequirementsMet) return 'preview_mode_complete';
    return 'ready_to_verify';
  }

  return (
    <div className="space-y-4">
      <RichRequirementsDisplay
        requirements={requirements}
        fulfillment={fulfillment}
        userStatus={verificationStatus}
        metadata={{
          icon: '⬡',
          name: 'Universal Profile',
          brandColor: '#F20079'
        }}
        onConnect={handleConnect}
        onDisconnect={disconnect}
        isPreviewMode={isPreviewMode}
      />
      
      {/* Show verification button in both preview and post contexts */}
      {verificationStatus.connected && !isPreviewMode && (
        <EthereumSmartVerificationButton
            profileType="universal_profile"
            state={getButtonState()}
            allRequirementsMet={allRequirementsMet}
            isConnected={verificationStatus.connected}
            isCorrectChain={true}
            isVerifying={isVerifying}
            verified={serverVerified}
            onClick={handleBackendVerification}
            error={serverError || localVerificationError || undefined}
        />
      )}
    </div>
  );
}; 