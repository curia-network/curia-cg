'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  ArrowRight,
  Save,
  AlertTriangle
} from 'lucide-react';
import { LockCreationStepper } from './LockCreationStepper';
import { LockBuilderProvider, useLockBuilder } from './LockBuilderProvider';
import { LockBuilderStep, LockBuilderState, type GatingRequirement } from '@/types/locks';
import { LockTemplateSelector } from './LockTemplateSelector';
import { LockTemplate } from '@/types/templates';
import { GatingRequirementsPreview } from './GatingRequirementsPreview';
import { UniversalProfileProvider } from '@/contexts/UniversalProfileContext';
import { authFetchJson } from '@/utils/authFetch';
import { CSVUploadComponent } from './csv/CSVUploadComponent';

// Step content components
const MetadataStep = () => {
  const { state, setState, addRequirement, setStep } = useLockBuilder();
  
  const handleSelectTemplate = useCallback((template: LockTemplate) => {
    setState((prev: LockBuilderState) => ({
      ...prev,
      selectedTemplate: template,
      metadata: {
        ...prev.metadata,
        name: template.prefilledMetadata?.title || template.name,
        description: template.prefilledMetadata?.description || template.description,
        icon: template.prefilledMetadata?.icon || template.icon
      },
      requirements: template.prefilledRequirements || []
    }));
  }, [setState]);
  
  const handleStartFromScratch = useCallback(() => {
    setState((prev: LockBuilderState) => ({
      ...prev,
      selectedTemplate: null,
      metadata: {
        name: '',
        description: '',
        icon: '🔐'
      },
      requirements: []
    }));
  }, [setState]);

  const handleUploadCSV = useCallback(() => {
    setState((prev: LockBuilderState) => ({
      ...prev,
      showCSVUpload: true
    }));
  }, [setState]);

  const handleCSVUploadCancel = useCallback(() => {
    setState((prev: LockBuilderState) => ({
      ...prev,
      showCSVUpload: false
    }));
  }, [setState]);

  const handleCSVImport = useCallback((requirements: GatingRequirement[]) => {
    console.log('[LockCreationModal] Importing CSV requirements:', requirements);
    
    // Add all imported requirements to the lock builder state
    requirements.forEach(requirement => {
      addRequirement(requirement);
    });
    
    // Navigate to requirements step and hide CSV upload
    setState((prev: LockBuilderState) => ({
      ...prev,
      showCSVUpload: false,
      currentScreen: 'requirements'
    }));
    
    // Move to requirements step
    setStep('requirements');
  }, [addRequirement, setState, setStep]);
  
  // Show CSV upload component if showCSVUpload is true
  if (state.showCSVUpload) {
    return (
      <CSVUploadComponent
        onCancel={handleCSVUploadCancel}
        onImport={handleCSVImport}
      />
    );
  }
  
  return (
    <LockTemplateSelector
      onSelectTemplate={handleSelectTemplate}
      onStartFromScratch={handleStartFromScratch}
      onUploadCSV={handleUploadCSV}
      selectedTemplate={state.selectedTemplate}
    />
  );
};

import { RequirementsList } from './RequirementsList';
import { RequirementTypePicker } from './RequirementTypePicker';
import { LyxBalanceConfigurator } from './configurators/LyxBalanceConfigurator';
import { EthBalanceConfigurator } from './configurators/EthBalanceConfigurator';
import { UPFollowerCountConfigurator } from './configurators/UPFollowerCountConfigurator';
import { ENSDomainConfigurator } from './configurators/ENSDomainConfigurator';
import { ENSPatternConfigurator } from './configurators/ENSPatternConfigurator';
import { EFPFollowerCountConfigurator } from './configurators/EFPFollowerCountConfigurator';
import { UPMustFollowConfigurator } from './configurators/UPMustFollowConfigurator';
import { UPMustBeFollowedByConfigurator } from './configurators/UPMustBeFollowedByConfigurator';
import { EFPMustFollowConfigurator } from './configurators/EFPMustFollowConfigurator';
import { EFPMustBeFollowedByConfigurator } from './configurators/EFPMustBeFollowedByConfigurator';
import { LSP7TokenConfigurator } from './configurators/LSP7TokenConfigurator';
import { LSP8NFTConfigurator } from './configurators/LSP8NFTConfigurator';
import { ERC20TokenConfigurator } from './configurators/ERC20TokenConfigurator';
import { ERC721NFTConfigurator } from './configurators/ERC721NFTConfigurator';
import { ERC1155TokenConfigurator } from './configurators/ERC1155TokenConfigurator';
import { RequirementType } from '@/types/locks';

const RequirementsStep = () => {
  const { state, addRequirement, updateRequirement, navigateBackToRequirements, navigateToRequirementConfig } = useLockBuilder();

  const handleSelectRequirementType = (requirementType: RequirementType) => {
    // Navigate to configuration screen for the selected type
    navigateToRequirementConfig(requirementType);
  };

  const handleBackToRequirements = () => {
    navigateBackToRequirements();
  };

  const handleSaveRequirement = (requirement: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (state.editingRequirementId) {
      // Update existing requirement
      updateRequirement(state.editingRequirementId, requirement);
    } else {
      // Add new requirement
      addRequirement(requirement);
    }
    // Navigate back to requirements list
    navigateBackToRequirements();
  };

  // Get the requirement being edited (if any)
  const editingRequirement = state.editingRequirementId 
    ? state.requirements.find((req: any) => req.id === state.editingRequirementId) // eslint-disable-line @typescript-eslint/no-explicit-any
    : undefined;

  // Render the appropriate screen based on currentScreen state
  switch (state.currentScreen) {
    case 'picker':
      return (
        <RequirementTypePicker
          onSelectType={handleSelectRequirementType}
          onBack={handleBackToRequirements}
        />
      );
    
    case 'configure':
      // Individual requirement configurators
      switch (state.selectedRequirementType) {
        case 'lyx_balance':
          return (
            <LyxBalanceConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'eth_balance':
          return (
            <EthBalanceConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'up_follower_count':
          return (
            <UPFollowerCountConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'efp_follower_count':
          return (
            <EFPFollowerCountConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'ens_domain':
          return (
            <ENSDomainConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'ens_pattern':
          return (
            <ENSPatternConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'up_must_follow':
          return (
            <UPMustFollowConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'up_must_be_followed_by':
          return (
            <UPMustBeFollowedByConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'efp_must_follow':
          return (
            <EFPMustFollowConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'efp_must_be_followed_by':
          return (
            <EFPMustBeFollowedByConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'lsp7_token':
          return (
            <LSP7TokenConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'lsp8_nft':
          return (
            <LSP8NFTConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'erc20_token':
          return (
            <ERC20TokenConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'erc721_nft':
          return (
            <ERC721NFTConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        case 'erc1155_token':
          return (
            <ERC1155TokenConfigurator
              editingRequirement={editingRequirement}
              onSave={handleSaveRequirement}
              onCancel={handleBackToRequirements}
            />
          );
        
        default:
          // Placeholder for other requirement types
          return (
            <div className="text-center py-8">
              <div className="h-12 w-12 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🚧</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
              <p className="text-muted-foreground mb-4">
                The configurator for <strong>{state.selectedRequirementType}</strong> is not yet implemented.
              </p>
              <div className="mt-6">
                <Button onClick={handleBackToRequirements} variant="outline">
                  Back to Requirements
                </Button>
              </div>
            </div>
          );
      }
    
    case 'requirements':
    default:
      return <RequirementsList />;
  }
};



const PreviewStep = () => {
  const { state } = useLockBuilder();
  
  // Convert current builder state to a lock format for preview
  const previewLock = useMemo(() => {
    // Helper function to convert requirements to proper gating config
    const convertRequirementsToGatingConfig = () => {
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
              decimals: req.config.decimals, // Include decimals for proper verification
              marketplaceLinks: req.config.marketplaceLinks // Include marketplace links
            });
            break;
          case 'lsp8_nft':
            upRequirements.requiredTokens.push({
              name: req.config.name || 'Unknown Token',
              symbol: req.config.symbol || 'UNK',
              minAmount: req.config.minAmount || '1',
              tokenType: 'LSP8',
              contractAddress: req.config.contractAddress,
              tokenId: req.config.tokenId,
              marketplaceLinks: req.config.marketplaceLinks // Include marketplace links
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
          fulfillment: state.ecosystemFulfillment.universal_profile, // 🚀 NEW: Use per-ecosystem fulfillment
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
          fulfillment: state.ecosystemFulfillment.ethereum_profile, // 🚀 NEW: Use per-ecosystem fulfillment
          requirements: ethRequirements
        });
      }

      return { categories, requireAll: state.fulfillmentMode === 'all' };
    };

    return {
      id: -1, // Preview mode indicator
      name: state.metadata.name || 'Untitled Lock',
      description: state.metadata.description || 'Preview of your lock configuration',
      icon: state.metadata.icon || '🔒',
      color: state.metadata.color || '#3b82f6',
      gatingConfig: convertRequirementsToGatingConfig(),
      tags: state.metadata.tags || [],
      usageCount: 0,
      successRate: 1.0,
      avgVerificationTime: 120, // 2 minutes default
      isTemplate: false,
      isPublic: state.metadata.isPublic || false,
      isOwned: true,
      canEdit: true,
      canDelete: true,
      creatorUserId: 'preview-user',
      communityId: 'preview-community',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [state]);

  return (
    <div className="space-y-6">
      {/* Live Preview - Exactly what users will see */}
      {previewLock.gatingConfig.categories.length > 0 ? (
        <UniversalProfileProvider>
          <GatingRequirementsPreview 
            gatingConfig={previewLock.gatingConfig}
            className="border shadow-sm"
          />
        </UniversalProfileProvider>
      ) : (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <div className="text-muted-foreground">
            <div className="text-2xl mb-2">🔒</div>
            <h3 className="font-medium mb-1">No Requirements to Preview</h3>
            <p className="text-sm">Add some requirements in the previous step to see the preview.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const SaveStep = () => {
  const { state, setState } = useLockBuilder();
  const [lockName, setLockName] = useState(state.metadata.name || '');
  const [lockDescription, setLockDescription] = useState(state.metadata.description || '');
  
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setLockName(name);
    setState((prev: LockBuilderState) => ({
      ...prev,
      metadata: { ...prev.metadata, name }
    }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const description = e.target.value;
    setLockDescription(description);
    setState((prev: LockBuilderState) => ({
      ...prev,
      metadata: { ...prev.metadata, description }
    }));
  };

  return (
    <div className="space-y-6">
      {/* Final Configuration Review */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-6 border border-green-200 dark:border-green-800">
        <div className="flex items-center mb-4">
          <span className="text-2xl mr-3">✨</span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Lock Ready to Save</h3>
            <p className="text-sm text-muted-foreground">
              Add final details and save your lock for reuse
            </p>
          </div>
        </div>
      </div>

      {/* Lock Details Form */}
      <div className="space-y-4">
        <div>
          <label htmlFor="lock-name" className="block text-sm font-medium text-foreground mb-2">
            Lock Name <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="lock-name"
            type="text"
            value={lockName}
            onChange={handleNameChange}
            placeholder="Enter a name for this lock..."
            className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This name will help you identify the lock when applying it to posts
          </p>
        </div>

        <div>
          <label htmlFor="lock-description" className="block text-sm font-medium text-foreground mb-2">
            Description (Optional)
          </label>
          <textarea
            id="lock-description"
            value={lockDescription}
            onChange={handleDescriptionChange}
            placeholder="Describe what this lock is for..."
            rows={3}
            className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Optional description to explain the purpose of this lock
          </p>
        </div>
      </div>

      {/* Configuration Summary */}
      <div className="bg-muted/50 border border-border rounded-lg p-4">
        <h4 className="font-medium text-foreground mb-3">Configuration Summary</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Requirements:</span>
            <span className="ml-2 font-medium text-foreground">
              {state.requirements.length} configured
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Template:</span>
            <span className="ml-2 font-medium text-foreground">
              {state.selectedTemplate?.name || 'Custom'}
            </span>
          </div>
        </div>
        
        {state.requirements.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-muted-foreground text-sm">Requirements:</span>
            <div className="mt-1 space-y-1">
              {state.requirements.map((req: any, index: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div key={index} className="text-xs text-muted-foreground flex items-center">
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full mr-2 flex-shrink-0" />
                  {req.description || `${String(req.type)} requirement`}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save Instructions */}
      <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start">
          <span className="text-xl mr-3">📋</span>
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">After Saving</h4>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Your lock will be saved and available for use when creating gated posts. 
              You can apply it to control who can view or respond to your content.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Step configuration
const STEP_CONFIG: Record<LockBuilderStep, {
  title: string;
  description: string;
  component: React.ComponentType;
  isRequired: boolean;
}> = {
  metadata: {
    title: 'Template & Info',
    description: 'Choose a template and add basic details',
    component: MetadataStep,
    isRequired: true
  },
  requirements: {
    title: 'Requirements',
    description: 'Add and configure gating requirements',
    component: RequirementsStep,
    isRequired: true
  },
  preview: {
    title: 'Preview & Test',
    description: 'Test your lock with wallet connections',
    component: PreviewStep,
    isRequired: false
  },
  save: {
    title: 'Lock Details',
    description: 'Name, description and final settings',
    component: SaveStep,
    isRequired: true
  }
};

const STEP_ORDER: LockBuilderStep[] = ['metadata', 'requirements', 'preview', 'save'];

interface LockCreationModalContentProps {
  onSave: (lockId: number) => void;
  onCancel: () => void;
}

const LockCreationModalContent: React.FC<LockCreationModalContentProps> = ({
  onSave,
  onCancel
}) => {
  const { state, setState } = useLockBuilder();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentStepIndex = STEP_ORDER.indexOf(state.step);
  const currentStepConfig = STEP_CONFIG[state.step];
  const CurrentStepComponent = currentStepConfig.component;

  // Navigation handlers
  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setState((prev: LockBuilderState) => ({ ...prev, step: STEP_ORDER[nextIndex] }));
    }
  }, [currentStepIndex, setState]);

  const handlePrevious = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setState((prev: LockBuilderState) => ({ ...prev, step: STEP_ORDER[prevIndex] }));
    }
  }, [currentStepIndex, setState]);

  const handleStepClick = useCallback((step: LockBuilderStep) => {
    setState((prev: LockBuilderState) => ({ ...prev, step }));
  }, [setState]);

  // Check if we can navigate forward
  const canGoNext = currentStepIndex < STEP_ORDER.length - 1;
  const canGoPrevious = currentStepIndex > 0;
  const isLastStep = currentStepIndex === STEP_ORDER.length - 1;
  
  // Check if CSV upload is currently showing (hide Next button to avoid confusion)
  const isCSVUploadActive = state.step === 'metadata' && state.showCSVUpload;

  // Check if current step is complete (placeholder logic for now)
  const isStepComplete = (step: LockBuilderStep): boolean => {
    // TODO: Implement real validation logic in later phases
    const completedSteps = STEP_ORDER.slice(0, currentStepIndex + 1);
    return completedSteps.includes(step);
  };

  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Helper function to convert lock builder state to API format
      const convertStateToCreateRequest = (): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
                decimals: req.config.decimals, // Include decimals for proper verification
                marketplaceLinks: req.config.marketplaceLinks // Include marketplace links
              });
              break;
            case 'lsp8_nft':
              upRequirements.requiredTokens.push({
                name: req.config.name || 'Unknown Token',
                symbol: req.config.symbol || 'UNK',
                minAmount: req.config.minAmount || '1',
                tokenType: 'LSP8',
                contractAddress: req.config.contractAddress,
                tokenId: req.config.tokenId,
                marketplaceLinks: req.config.marketplaceLinks // Include marketplace links
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
          name: state.metadata.name?.trim() || '',
          description: state.metadata.description?.trim() || '',
          icon: state.metadata.icon || '🔒',
          color: state.metadata.color || '#3b82f6',
          gatingConfig: {
            categories,
            requireAll: state.fulfillmentMode === 'all'
          },
          tags: state.metadata.tags || [],
          isPublic: state.metadata.isPublic || false
        };
      };

      const createRequest = convertStateToCreateRequest();
      
      // Validate required fields
      if (!createRequest.name?.trim()) {
        throw new Error('Lock name is required');
      }
      
      if (!createRequest.gatingConfig.categories.length) {
        throw new Error('At least one requirement must be configured');
      }

      console.log('[LockCreationModal] Saving lock:', createRequest);

      // Make API request to save the lock
      const result = await authFetchJson<{ success: boolean; data?: { id: number }; error?: string }>('/api/locks', {
        method: 'POST',
        body: createRequest,
      });
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to save lock');
      }

      console.log('[LockCreationModal] Lock saved successfully:', result.data);
      
      // Call success callback with the real lock ID
      onSave(result.data.id);
      
    } catch (error) {
      console.error('[LockCreationModal] Failed to save lock:', error);
      // TODO: Show error toast/notification to user
      alert(error instanceof Error ? error.message : 'Failed to save lock');
    } finally {
      setIsSaving(false);
    }
  }, [state, onSave]);

  // Handle cancel with confirmation
  const handleCancel = useCallback(() => {
    // Check if user has made any changes (simplified for now)
    const hasChanges = currentStepIndex > 0;
    
    if (hasChanges) {
      setShowCancelDialog(true);
    } else {
      onCancel();
    }
  }, [currentStepIndex, onCancel]);

  const confirmCancel = useCallback(() => {
    setShowCancelDialog(false);
    onCancel();
  }, [onCancel]);

  return (
    <>
      <DialogHeader className="flex-shrink-0 border-b px-6 pt-6 pb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <DialogTitle className="flex items-center text-2xl font-bold">
              <span className="text-3xl mr-3">🔐</span>
              Create New Lock
              <Badge variant="secondary" className="ml-3 text-xs font-medium">
                Step {currentStepIndex + 1} of {STEP_ORDER.length}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-base mt-3 text-muted-foreground leading-relaxed">
              {currentStepConfig.description}
            </DialogDescription>
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="mt-6">
          <LockCreationStepper
            steps={STEP_ORDER.map(step => ({
              key: step,
              title: STEP_CONFIG[step].title,
              isActive: step === state.step,
              isComplete: isStepComplete(step),
              isRequired: STEP_CONFIG[step].isRequired
            }))}
            onStepClick={handleStepClick}
          />
        </div>
      </DialogHeader>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <CurrentStepComponent />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 border-t px-6 pt-6 pb-6 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {canGoPrevious && (
              <Button 
                variant="outline" 
                onClick={handlePrevious}
                className="flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              onClick={handleCancel}
            >
              Cancel
            </Button>
            
            {isLastStep ? (
              <Button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center px-6"
                size="lg"
              >
                {isSaving ? (
                  <div className="h-4 w-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Lock
              </Button>
            ) : !isCSVUploadActive ? (
              <Button 
                onClick={handleNext}
                disabled={!canGoNext}
                className="flex items-center px-6"
                size="lg"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelDialog && (
        <Dialog open={true} onOpenChange={() => setShowCancelDialog(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
                Discard Changes?
              </DialogTitle>
              <DialogDescription>
                You have unsaved changes. Are you sure you want to discard them and close the lock creator?
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex justify-end space-x-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setShowCancelDialog(false)}
              >
                Keep Editing
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmCancel}
              >
                Discard Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

interface LockCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (lockId: number) => void;
}

export const LockCreationModal: React.FC<LockCreationModalProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const [isWeb3OnboardOpen, setIsWeb3OnboardOpen] = useState(false);

  const handleSave = useCallback((lockId: number) => {
    console.log(`[LockCreationModal] Lock saved with ID: ${lockId}`);
    onSave?.(lockId);
    onClose();
  }, [onSave, onClose]);

  // Listen for web3-onboard modal state changes
  React.useEffect(() => {
    if (!isOpen) return;

    // Function to detect if web3-onboard modal is open
    const checkWeb3OnboardModal = () => {
      // Web3-onboard creates elements with specific classes/attributes
      const onboardModal = document.querySelector('.onboard-modal, [data-onboard], .bn-onboard-modal');
      const onboardBackdrop = document.querySelector('.onboard-backdrop, [data-onboard-backdrop]');
      
      const isOnboardOpen = !!(onboardModal || onboardBackdrop);
      setIsWeb3OnboardOpen(isOnboardOpen);
    };

    // Check immediately
    checkWeb3OnboardModal();

    // Set up mutation observer to watch for DOM changes
    const observer = new MutationObserver(() => {
      checkWeb3OnboardModal();
    });

    // Watch for changes in the document body
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-onboard']
    });

    // Also listen for specific web3-onboard events if they exist
    const handleWeb3OnboardOpen = () => setIsWeb3OnboardOpen(true);
    const handleWeb3OnboardClose = () => setIsWeb3OnboardOpen(false);

    // Try to listen for web3-onboard specific events
    window.addEventListener('onboard:modal:open', handleWeb3OnboardOpen);
    window.addEventListener('onboard:modal:close', handleWeb3OnboardClose);

    return () => {
      observer.disconnect();
      window.removeEventListener('onboard:modal:open', handleWeb3OnboardOpen);
      window.removeEventListener('onboard:modal:close', handleWeb3OnboardClose);
    };
  }, [isOpen]);

  // Handle dialog close - don't close if web3-onboard is open
  const handleDialogChange = useCallback((open: boolean) => {
    if (!open && !isWeb3OnboardOpen) {
      onClose();
    }
  }, [onClose, isWeb3OnboardOpen]);

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={handleDialogChange}
      // Disable modal behavior when web3-onboard is open
      modal={!isWeb3OnboardOpen}
    >
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0" onInteractOutside={(e) => {
          // Allow interaction with web3-onboard modal
          if ((e.target as HTMLElement)?.closest('[id^=w3o-], [id^=rk-]')) {
            e.preventDefault();
          }
        }}>
        <LockBuilderProvider>
          <LockCreationModalContent 
            onSave={handleSave}
            onCancel={onClose}
          />
        </LockBuilderProvider>
      </DialogContent>
    </Dialog>
  );
};

// Export the RequirementsStep component for reuse in edit modal
export { RequirementsStep }; 