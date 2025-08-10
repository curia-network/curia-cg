'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
// VisuallyHidden will be handled inline
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  ArrowRight,
  Save,
  AlertTriangle,
  Edit2,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
// import { LockCreationStepper } from './LockCreationStepper'; // TODO: Fix stepper interface
import { LockBuilderProvider, useLockBuilder } from './LockBuilderProvider';
import { LockBuilderStep, LockBuilderState, LockWithStats, UpdateLockRequest } from '@/types/locks';

// Define step interface for edit modal
interface EditModalStep {
  id: LockBuilderStep;
  title: string;
  description: string;
  component: React.ComponentType;
  isValid: () => boolean;
}
import { GatingRequirementsPreview } from './GatingRequirementsPreview';
import { UniversalProfileProvider } from '@/contexts/UniversalProfileContext';
import { useLockManagement } from '@/hooks/useLockManagement';
import { RequirementsStep } from './LockCreationModal';

// Helper function to convert gatingConfig back to requirements for editing
const convertGatingConfigToRequirements = (gatingConfig: any): any[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const requirements: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  
  // For now, return a simple conversion that focuses on the most common cases
  // This can be expanded later to handle all requirement types
  if (gatingConfig.categories) {
    gatingConfig.categories.forEach((category: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!category.enabled || !category.requirements) return;
      
      if (category.type === 'universal_profile') {
        const upReqs = category.requirements;
        let reqId = 1;
        
        // LYX Balance
        if (upReqs.minLyxBalance) {
          requirements.push({
            id: `lyx_${reqId++}`,
            type: 'lyx_balance',
            category: 'token',
            config: { minAmount: upReqs.minLyxBalance },
            isValid: true,
            displayName: `LYX Balance: ${upReqs.minLyxBalance} LYX`
          });
        }
        
        // Tokens
        if (upReqs.requiredTokens && upReqs.requiredTokens.length > 0) {
          upReqs.requiredTokens.forEach((token: any, index: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            requirements.push({
              id: `token_${index}`,
              type: token.tokenType === 'LSP7' ? 'lsp7_token' : 'lsp8_nft',
              category: 'token',
              config: {
                contractAddress: token.contractAddress,
                minAmount: token.minAmount,
                name: token.name,
                symbol: token.symbol,
                decimals: token.decimals,
                tokenId: token.tokenId
              },
              isValid: true,
              displayName: `${token.tokenType} Token: ${token.name || token.symbol || 'Unknown'}`
            });
          });
        }
        
        // Follower requirements
        if (upReqs.followerRequirements && upReqs.followerRequirements.length > 0) {
          upReqs.followerRequirements.forEach((followerReq: any, index: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            let type = 'up_follower_count';
            let config: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
            let displayName = 'Social Requirement';
            
            if (followerReq.type === 'minimum_followers') {
              type = 'up_follower_count';
              config = { minCount: parseInt(followerReq.value, 10) };
              displayName = `Minimum ${followerReq.value} followers`;
            } else if (followerReq.type === 'following') {
              type = 'up_must_follow';
              config = { address: followerReq.value, profileName: followerReq.description };
              displayName = `Must follow: ${followerReq.description || followerReq.value}`;
            } else if (followerReq.type === 'followed_by') {
              type = 'up_must_be_followed_by';
              config = { address: followerReq.value, profileName: followerReq.description };
              displayName = `Must be followed by: ${followerReq.description || followerReq.value}`;
            }
            
            requirements.push({
              id: `follower_${index}`,
              type,
              category: 'social',
              config,
              isValid: true,
              displayName
            });
          });
        }
      }
      
      // TODO: Add ethereum_profile handling when needed
    });
  }
  
  return requirements;
};

// Helper function to convert builder state back to gating config (for preview and save)
const convertBuilderStateToGatingConfig = (state: LockBuilderState) => {
  const upRequirements: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    minLyxBalance: undefined,
    requiredTokens: [],
    followerRequirements: []
  };
  
  const ethRequirements: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    requiresENS: false,
    ensDomainPatterns: [],
    minimumETHBalance: undefined,
    requiredERC20Tokens: [],
    requiredERC721Collections: [],
    requiredERC1155Tokens: [],
    efpRequirements: []
  };

  // Convert each requirement to the proper format
  state.requirements.forEach((req: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (req.type) {
      // UP (LUKSO) requirements
      case 'lyx_balance':
        upRequirements.minLyxBalance = req.config.minAmount;
        break;
      case 'lsp7_token':
        upRequirements.requiredTokens.push({
          name: req.config.name || 'Unknown Token',
          symbol: req.config.symbol || 'UNK',
          minAmount: req.config.minAmount,
          tokenType: 'LSP7',
          contractAddress: req.config.contractAddress,
          decimals: req.config.decimals
        });
        break;
      case 'lsp8_nft':
        upRequirements.requiredTokens.push({
          name: req.config.name || 'Unknown Token',
          symbol: req.config.symbol || 'UNK',
          minAmount: req.config.minAmount || '1',
          tokenType: 'LSP8',
          contractAddress: req.config.contractAddress,
          tokenId: req.config.tokenId
        });
        break;
      case 'up_follower_count':
        upRequirements.followerRequirements.push({
          type: 'minimum_followers',
          value: req.config.minCount.toString()
        });
        break;
      case 'up_must_follow':
        upRequirements.followerRequirements.push({
          type: 'following',
          value: req.config.address,
          description: req.config.profileName || req.config.username
        });
        break;
      case 'up_must_be_followed_by':
        upRequirements.followerRequirements.push({
          type: 'followed_by',
          value: req.config.address,
          description: req.config.profileName || req.config.username
        });
        break;

      // Ethereum requirements
      case 'eth_balance':
        ethRequirements.minimumETHBalance = req.config.minAmount;
        break;
      case 'erc20_token':
        ethRequirements.requiredERC20Tokens.push({
          contractAddress: req.config.contractAddress,
          minimum: req.config.minAmount,
          name: req.config.name,
          symbol: req.config.symbol,
          decimals: req.config.decimals
        });
        break;
      case 'erc721_nft':
        ethRequirements.requiredERC721Collections.push({
          contractAddress: req.config.contractAddress,
          minimumCount: req.config.minCount || 1,
          name: req.config.name,
          symbol: req.config.symbol
        });
        break;
      case 'erc1155_token':
        ethRequirements.requiredERC1155Tokens.push({
          contractAddress: req.config.contractAddress,
          tokenId: req.config.tokenId,
          minimum: req.config.minAmount,
          name: req.config.name
        });
        break;
      case 'ens_domain':
        ethRequirements.requiresENS = req.config.requiresENS;
        break;
      case 'ens_pattern':
        ethRequirements.ensDomainPatterns = req.config.patterns || [];
        break;
      case 'efp_follower_count':
        ethRequirements.efpRequirements.push({
          type: 'minimum_followers',
          value: req.config.minCount.toString()
        });
        break;
      case 'efp_must_follow':
        ethRequirements.efpRequirements.push({
          type: 'must_follow',
          value: req.config.address,
          description: req.config.ensName || req.config.displayName
        });
        break;
      case 'efp_must_be_followed_by':
        ethRequirements.efpRequirements.push({
          type: 'must_be_followed_by',
          value: req.config.address,
          description: req.config.ensName || req.config.displayName
        });
        break;
    }
  });

  // Build categories array - only include categories that have requirements
  const categories = [];
  
  // Check if UP category has any requirements
  const hasUPRequirements = upRequirements.minLyxBalance || 
                            upRequirements.requiredTokens.length > 0 || 
                            upRequirements.followerRequirements.length > 0;
  
  if (hasUPRequirements) {
    categories.push({
      type: 'universal_profile',
      enabled: true,
      fulfillment: state.ecosystemFulfillment.universal_profile,
      requirements: upRequirements
    });
  }

  // Check if Ethereum category has any requirements
  const hasEthRequirements = ethRequirements.requiresENS ||
                            ethRequirements.ensDomainPatterns.length > 0 ||
                            ethRequirements.minimumETHBalance ||
                            ethRequirements.requiredERC20Tokens.length > 0 ||
                            ethRequirements.requiredERC721Collections.length > 0 ||
                            ethRequirements.requiredERC1155Tokens.length > 0 ||
                            ethRequirements.efpRequirements.length > 0;
  
  if (hasEthRequirements) {
    categories.push({
      type: 'ethereum_profile',
      enabled: true,
      fulfillment: state.ecosystemFulfillment.ethereum_profile,
      requirements: ethRequirements
    });
  }

  return {
    categories,
    requireAll: state.fulfillmentMode === 'all'
  };
};

// Step content components (reusing from creation modal)
const MetadataStep = () => {
  const { state, setState } = useLockBuilder();
  
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Edit Lock Details</h3>
        <p className="text-muted-foreground text-sm">
          Update the basic information for your lock
        </p>
      </div>
      
      {/* Lock metadata form - reuse the form components from creation modal */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Lock Name</label>
          <input
            type="text"
            value={state.metadata.name || ''}
            onChange={(e) => setState(prev => ({
              ...prev,
              metadata: { ...prev.metadata, name: e.target.value }
            }))}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Enter lock name..."
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            value={state.metadata.description || ''}
            onChange={(e) => setState(prev => ({
              ...prev,
              metadata: { ...prev.metadata, description: e.target.value }
            }))}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Describe what this lock controls..."
            rows={3}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Icon</label>
            <input
              type="text"
              value={state.metadata.icon || ''}
              onChange={(e) => setState(prev => ({
                ...prev,
                metadata: { ...prev.metadata, icon: e.target.value }
              }))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="🔒"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Color</label>
            <input
              type="color"
              value={state.metadata.color || '#3b82f6'}
              onChange={(e) => setState(prev => ({
                ...prev,
                metadata: { ...prev.metadata, color: e.target.value }
              }))}
              className="w-full h-10 border rounded-md"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Tags</label>
          <input
            type="text"
            value={(state.metadata.tags || []).join(', ')}
            onChange={(e) => setState(prev => ({
              ...prev,
              metadata: { 
                ...prev.metadata, 
                tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
              }
            }))}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="tag1, tag2, tag3"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isPublic"
            checked={state.metadata.isPublic || false}
            onChange={(e) => setState(prev => ({
              ...prev,
              metadata: { ...prev.metadata, isPublic: e.target.checked }
            }))}
            className="rounded"
          />
          <label htmlFor="isPublic" className="text-sm font-medium">
            Make this lock public (visible to all community members)
          </label>
        </div>
      </div>
    </div>
  );
};

interface LockEditModalContentProps {
  lock: LockWithStats;
  onSave: (lockId: number) => void;
  onCancel: () => void;
}

const LockEditModalContent: React.FC<LockEditModalContentProps> = ({
  lock,
  onSave,
  onCancel
}) => {
  const { state, setState } = useLockBuilder();
  const { updateLock } = useLockManagement();
  const [isSaving, setIsSaving] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Initialize state from existing lock data
  useEffect(() => {
    if (lock) {
      console.log('[LockEditModal] Initializing with lock data:', lock);
      
                // Convert gatingConfig back to builder state format
          const convertedRequirements = convertGatingConfigToRequirements(lock.gatingConfig);
          
          // Determine ecosystem fulfillment modes from the gating config
          const upCategory = lock.gatingConfig.categories?.find((cat: any) => cat.type === 'universal_profile'); // eslint-disable-line @typescript-eslint/no-explicit-any
          const ethCategory = lock.gatingConfig.categories?.find((cat: any) => cat.type === 'ethereum_profile'); // eslint-disable-line @typescript-eslint/no-explicit-any
          
          const initialState: LockBuilderState = {
            step: 'metadata' as LockBuilderStep,
            selectedTemplate: null,
            metadata: {
              name: lock.name,
              description: lock.description || '',
              icon: lock.icon || '🔒',
              color: lock.color || '#3b82f6',
              tags: lock.tags || [],
              isPublic: lock.isPublic || false
            },
            requirements: convertedRequirements,
            fulfillmentMode: lock.gatingConfig.requireAll ? 'all' : 'any',
            ecosystemFulfillment: {
              universal_profile: upCategory?.fulfillment || 'any',
              ethereum_profile: ethCategory?.fulfillment || 'any'
            },
            validation: { isValid: true, errors: [], warnings: [] },
            previewMode: false,
            currentScreen: 'requirements'
          };
      
      setState(initialState);
      setCurrentStepIndex(0); // Start with metadata step for editing
    }
  }, [lock, setState, setCurrentStepIndex]);

  // Define the editing steps
  const steps: EditModalStep[] = useMemo(() => [
    {
      id: 'metadata',
      title: 'Lock Details',
      description: 'Update basic information',
      component: MetadataStep,
      isValid: () => {
        const name = state.metadata.name?.trim();
        return !!(name && name.length > 0);
      }
    },
    {
      id: 'requirements',
      title: 'Access Requirements',
      description: 'Modify gating conditions',
      component: RequirementsStep,
      isValid: () => true // Requirements validation is handled within RequirementsStep
    },
    {
      id: 'preview',
      title: 'Review Changes',
      description: 'Preview your updated lock',
      component: () => (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">Review Your Changes</h3>
            <p className="text-muted-foreground text-sm">
              Preview how your updated lock will appear
            </p>
          </div>
          
                          <UniversalProfileProvider>
                  <GatingRequirementsPreview
                    gatingConfig={convertBuilderStateToGatingConfig(state)}
                    className="border-0 shadow-none bg-background"
                  />
                </UniversalProfileProvider>
        </div>
      ),
      isValid: () => true
    }
  ], [state]);

  // Step validation function
  const isStepValid = useCallback((stepIndex: number) => {
    const step = steps[stepIndex];
    return step?.isValid?.() ?? true;
  }, [steps]);

  // Navigation handlers
  const canGoNext = currentStepIndex < steps.length - 1 && isStepValid(currentStepIndex);
  const canGoPrevious = currentStepIndex > 0;
  const isOnLastStep = currentStepIndex === steps.length - 1;

  const handleNext = useCallback(() => {
    if (canGoNext) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [canGoNext, currentStepIndex, setCurrentStepIndex]);

  const handlePrevious = useCallback(() => {
    if (canGoPrevious) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }, [canGoPrevious, currentStepIndex, setCurrentStepIndex]);

  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Convert builder state to update request
      const updateRequest: Omit<UpdateLockRequest, 'id'> = {
        name: state.metadata.name?.trim() || '',
        description: state.metadata.description?.trim() || '',
        icon: state.metadata.icon || '🔒',
        color: state.metadata.color || '#3b82f6',
        tags: state.metadata.tags || [],
        isPublic: state.metadata.isPublic || false,
        gatingConfig: convertBuilderStateToGatingConfig(state)
      };

      console.log('[LockEditModal] Updating lock:', updateRequest);

      await updateLock({ lockId: lock.id, updates: updateRequest });
      
      console.log('[LockEditModal] Lock updated successfully');
      onSave(lock.id);
      
    } catch (error) {
      console.error('[LockEditModal] Failed to update lock:', error);
      // TODO: Show error toast/notification to user
      alert(error instanceof Error ? error.message : 'Failed to update lock');
    } finally {
      setIsSaving(false);
    }
  }, [state, lock, updateLock, onSave]);

  // Handle cancel with confirmation
  const handleCancel = useCallback(() => {
    // Check if user has made any changes (simplified for now)
    const hasChanges = state.metadata.name !== lock.name || 
                      state.metadata.description !== lock.description;
    
    if (hasChanges) {
      setShowCancelDialog(true);
    } else {
      onCancel();
    }
  }, [state, lock, onCancel]);

  const confirmCancel = useCallback(() => {
    setShowCancelDialog(false);
    onCancel();
  }, [onCancel]);

  const currentStep = steps[currentStepIndex];
  const CurrentStepComponent = currentStep?.component;

  return (
    <>
      <div className="flex flex-col h-full max-h-[90vh]">
        {/* Header */}
        <div className="flex-shrink-0 space-y-4 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold flex items-center">
                <Edit2 className="h-5 w-5 mr-2" />
                Edit Lock: {lock.name}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Modify your lock&apos;s settings and requirements
              </p>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              Editing Mode
            </Badge>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center justify-center space-x-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => setCurrentStepIndex(index)}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-colors",
                    index === currentStepIndex 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <span className="font-medium">{index + 1}</span>
                  <span>{step.title}</span>
                </button>
                {index < steps.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {CurrentStepComponent && <CurrentStepComponent />}
        </div>

        {/* Footer with navigation */}
        <div className="flex-shrink-0 pt-6 border-t">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={!canGoPrevious || isSaving}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>

              {isOnLastStep ? (
                <Button
                  onClick={handleSave}
                  disabled={!isStepValid(currentStepIndex) || isSaving}
                  className="flex items-center"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={!canGoNext || isSaving}
                  className="flex items-center"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel confirmation dialog */}
      {showCancelDialog && (
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
                Discard Changes?
              </DialogTitle>
              <DialogDescription>
                You have unsaved changes. Are you sure you want to cancel editing?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                Keep Editing
              </Button>
              <Button variant="destructive" onClick={confirmCancel}>
                Discard Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

interface LockEditModalProps {
  lock: LockWithStats | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (lockId: number) => void;
}

export const LockEditModal: React.FC<LockEditModalProps> = ({
  lock,
  isOpen,
  onClose,
  onSave
}) => {
  const handleSave = useCallback((lockId: number) => {
    console.log(`[LockEditModal] Lock updated with ID: ${lockId}`);
    onSave?.(lockId);
    onClose();
  }, [onSave, onClose]);

  if (!lock) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Edit Lock</DialogTitle>
          <DialogDescription>
            Modify your lock settings and requirements
          </DialogDescription>
        </DialogHeader>
        <LockBuilderProvider>
          <LockEditModalContent
            lock={lock}
            onSave={handleSave}
            onCancel={onClose}
          />
        </LockBuilderProvider>
      </DialogContent>
    </Dialog>
  );
};
