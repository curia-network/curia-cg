'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { 
  LockBuilderState, 
  LockBuilderStep, 
  CreateLockRequest, 
  GatingRequirement, 
  LockValidationResult,
  RequirementBuilderScreen,
  RequirementType,
  EcosystemType
} from '@/types/locks';

// Initial state for the lock builder
const initialState: LockBuilderState = {
  step: 'metadata',
  selectedTemplate: null,
  metadata: {
    name: '',
    description: '',
    icon: '🔒',
    color: '#3b82f6',
    tags: [],
    isPublic: true
  },
  requirements: [],
  fulfillmentMode: 'any', // Default to ANY (backward compatible behavior)
  ecosystemFulfillment: { // 🚀 NEW: Default per-ecosystem fulfillment modes
    universal_profile: 'all',
    ethereum_profile: 'all'
  },
  validation: {
    isValid: false,
    errors: [],
    warnings: []
  },
  previewMode: false,
  currentScreen: 'requirements',
  selectedRequirementType: undefined,
  editingRequirementId: undefined,
  showCSVUpload: false
};

// Context type
interface LockBuilderContextType {
  state: LockBuilderState;
  setState: React.Dispatch<React.SetStateAction<LockBuilderState>>;
  updateMetadata: (metadata: Partial<CreateLockRequest>) => void;
  updateRequirements: (requirements: GatingRequirement[]) => void;
  updateFulfillmentMode: (mode: 'any' | 'all') => void;
  updateEcosystemFulfillment: (ecosystem: EcosystemType, mode: 'any' | 'all') => void; // 🚀 NEW
  addRequirement: (requirement: GatingRequirement) => void;
  updateRequirement: (id: string, requirement: Partial<GatingRequirement>) => void;
  removeRequirement: (id: string) => void;
  updateValidation: (validation: Partial<LockValidationResult>) => void;
  setStep: (step: LockBuilderStep) => void;
  setPreviewMode: (enabled: boolean) => void;
  resetState: () => void;
  
  // Navigation functions for requirement configuration screens
  navigateToScreen: (screen: RequirementBuilderScreen) => void;
  navigateToRequirementPicker: () => void;
  navigateToRequirementConfig: (requirementType: RequirementType, editingId?: string) => void;
  navigateBackToRequirements: () => void;
}

// Create the context
const LockBuilderContext = createContext<LockBuilderContextType | null>(null);

// Hook to use the context
export const useLockBuilder = (): LockBuilderContextType => {
  const context = useContext(LockBuilderContext);
  if (!context) {
    throw new Error('useLockBuilder must be used within a LockBuilderProvider');
  }
  return context;
};

// Provider props
interface LockBuilderProviderProps {
  children: ReactNode;
  initialData?: Partial<LockBuilderState>;
}

// Provider component
export const LockBuilderProvider: React.FC<LockBuilderProviderProps> = ({
  children,
  initialData
}) => {
  const [state, setState] = useState<LockBuilderState>({
    ...initialState,
    ...initialData
  });

  // Helper functions for updating specific parts of state
  const updateMetadata = useCallback((metadata: Partial<CreateLockRequest>) => {
    setState(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        ...metadata
      }
    }));
  }, []);

  const updateRequirements = useCallback((requirements: GatingRequirement[]) => {
    setState(prev => ({
      ...prev,
      requirements
    }));
  }, []);

  const updateFulfillmentMode = useCallback((mode: 'any' | 'all') => {
    setState(prev => ({
      ...prev,
      fulfillmentMode: mode
    }));
  }, []);

  const updateEcosystemFulfillment = useCallback((ecosystem: EcosystemType, mode: 'any' | 'all') => {
    setState(prev => ({
      ...prev,
      ecosystemFulfillment: {
        ...prev.ecosystemFulfillment,
        [ecosystem]: mode
      }
    }));
  }, []);

  const addRequirement = useCallback((requirement: GatingRequirement) => {
    setState(prev => ({
      ...prev,
      requirements: [...prev.requirements, requirement]
    }));
  }, []);

  const updateRequirement = useCallback((id: string, requirement: Partial<GatingRequirement>) => {
    setState(prev => ({
      ...prev,
      requirements: prev.requirements.map(req => 
        req.id === id ? { ...req, ...requirement } : req
      )
    }));
  }, []);

  const removeRequirement = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      requirements: prev.requirements.filter(req => req.id !== id)
    }));
  }, []);

  const updateValidation = useCallback((validation: Partial<LockValidationResult>) => {
    setState(prev => ({
      ...prev,
      validation: {
        ...prev.validation,
        ...validation
      }
    }));
  }, []);

  const setStep = useCallback((step: LockBuilderStep) => {
    setState(prev => ({
      ...prev,
      step
    }));
  }, []);

  const setPreviewMode = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      previewMode: enabled
    }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  // Navigation functions for requirement configuration screens
  const navigateToScreen = useCallback((screen: RequirementBuilderScreen) => {
    setState(prev => ({
      ...prev,
      currentScreen: screen
    }));
  }, []);

  const navigateToRequirementPicker = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentScreen: 'picker',
      selectedRequirementType: undefined,
      editingRequirementId: undefined
    }));
  }, []);

  const navigateToRequirementConfig = useCallback((requirementType: RequirementType, editingId?: string) => {
    setState(prev => ({
      ...prev,
      currentScreen: 'configure',
      selectedRequirementType: requirementType,
      editingRequirementId: editingId
    }));
  }, []);

  const navigateBackToRequirements = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentScreen: 'requirements',
      selectedRequirementType: undefined,
      editingRequirementId: undefined
    }));
  }, []);

  const contextValue: LockBuilderContextType = {
    state,
    setState,
    updateMetadata,
    updateRequirements,
    updateFulfillmentMode,
    updateEcosystemFulfillment,
    addRequirement,
    updateRequirement,
    removeRequirement,
    updateValidation,
    setStep,
    setPreviewMode,
    resetState,
    navigateToScreen,
    navigateToRequirementPicker,
    navigateToRequirementConfig,
    navigateBackToRequirements
  };

  return (
    <LockBuilderContext.Provider value={contextValue}>
      {children}
    </LockBuilderContext.Provider>
  );
}; 