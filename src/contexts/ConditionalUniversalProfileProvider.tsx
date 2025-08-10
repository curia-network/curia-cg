'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { UniversalProfileProvider, useUniversalProfile, type UniversalProfileContextType } from './UniversalProfileContext';

// Context to track if Universal Profile functionality is needed
interface UPActivationContextType {
  isUPNeeded: boolean;
  hasUserTriggeredConnection: boolean;
  activateUP: () => void;
  deactivateUP: () => void;
  initializeConnection: () => void;
}

// Create the activation context
const UPActivationContext = createContext<UPActivationContextType>({
  isUPNeeded: false,
  hasUserTriggeredConnection: false,
  activateUP: () => {},
  deactivateUP: () => {},
  initializeConnection: () => {}
});

// Hook to access activation controls
export const useUPActivation = (): UPActivationContextType => {
  const context = useContext(UPActivationContext);
  if (!context) {
    throw new Error('useUPActivation must be used within a ConditionalUniversalProfileProvider');
  }
  return context;
};

// Create a separate context for the activation state
const ConditionalUPContext = createContext<{ isActive: boolean; context: UniversalProfileContextType | null }>({
  isActive: false,
  context: null
});

// Hook that components can use to get UP functionality conditionally
export const useConditionalUniversalProfile = (): UniversalProfileContextType => {
  const { isActive, context } = useContext(ConditionalUPContext);
  
  // Default/mock functionality when UP is not activated
  const defaultContext: UniversalProfileContextType = useMemo(() => ({
    isInitialized: false,
    isConnected: false,
    upAddress: null,
    isConnecting: false,
    provider: null,
    connect: async () => {
      throw new Error('Universal Profile not activated. Call initializeConnection() first.');
    },
    disconnect: () => {},
    chooseAccount: async () => {
      throw new Error('Universal Profile not activated. Call initializeConnection() first.');
    },
    switchToLukso: async () => {},
    verifyLyxBalance: async () => false,
    verifyTokenRequirements: async () => ({ isValid: false, missingRequirements: [], errors: ['UP not activated'] }),
    verifyPostRequirements: async () => ({ isValid: false, missingRequirements: [], errors: ['UP not activated'] }),
    getLyxBalance: async () => { throw new Error('Universal Profile not activated'); },
    getTokenBalances: async () => [],
    getEnhancedTokenBalances: async () => [],
    checkTokenBalance: async () => { throw new Error('Universal Profile not activated'); },
    getTokenMetadata: async () => { throw new Error('Universal Profile not activated'); },
    signMessage: async () => { throw new Error('Universal Profile not activated'); },
    // LSP26 Follower methods
    getFollowerCount: async () => { throw new Error('Universal Profile not activated'); },
    isFollowedBy: async () => { throw new Error('Universal Profile not activated'); },
    isFollowing: async () => { throw new Error('Universal Profile not activated'); },
    verifyFollowerRequirements: async () => ({ isValid: false, missingRequirements: [], errors: ['UP not activated'] }),
    checkConnectionState: async () => {}
  }), []);
  
  return (isActive && context) ? context : defaultContext;
};

// Component that provides real UP context (always calls the hook)
const ActiveUPContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const realContext = useUniversalProfile();
  
  const value = useMemo(() => ({
    isActive: true,
    context: realContext
  }), [realContext]);
  
  return (
    <ConditionalUPContext.Provider value={value}>
      {children}
    </ConditionalUPContext.Provider>
  );
};

// Component that provides inactive UP context (no hook calls)
const InactiveUPContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useMemo(() => ({
    isActive: false,
    context: null
  }), []);
  
  return (
    <ConditionalUPContext.Provider value={value}>
      {children}
    </ConditionalUPContext.Provider>
  );
};

interface ConditionalUniversalProfileProviderProps {
  children: React.ReactNode;
}

export const ConditionalUniversalProfileProvider: React.FC<ConditionalUniversalProfileProviderProps> = ({ children }) => {
  const [isUPNeeded, setIsUPNeeded] = useState(false);
  const [hasUserTriggeredConnection, setHasUserTriggeredConnection] = useState(false);
  
  const activateUP = useCallback(() => {
    console.log('[ConditionalUP] UP gating detected, marking as needed (but not initializing yet)');
    setIsUPNeeded(true);
  }, []);
  
  const deactivateUP = useCallback(() => {
    console.log('[ConditionalUP] Deactivating Universal Profile functionality');
    setIsUPNeeded(false);
    setHasUserTriggeredConnection(false);
  }, []);
  
  const initializeConnection = useCallback(() => {
    console.log('[ConditionalUP] User triggered connection, initializing Web3-Onboard');
    setHasUserTriggeredConnection(true);
  }, []);
  
  const activationContextValue: UPActivationContextType = useMemo(() => ({
    isUPNeeded,
    hasUserTriggeredConnection,
    activateUP,
    deactivateUP,
    initializeConnection
  }), [isUPNeeded, hasUserTriggeredConnection, activateUP, deactivateUP, initializeConnection]);
  
  // Only initialize Web3-Onboard when both conditions are met:
  // 1. UP functionality is needed (gating detected)
  // 2. User has explicitly triggered connection
  const shouldInitializeUP = isUPNeeded && hasUserTriggeredConnection;
  
  return (
    <UPActivationContext.Provider value={activationContextValue}>
      {shouldInitializeUP ? (
        <UniversalProfileProvider>
          <ActiveUPContextProvider>
            {children}
          </ActiveUPContextProvider>
        </UniversalProfileProvider>
      ) : (
        <InactiveUPContextProvider>
          {children}
        </InactiveUPContextProvider>
      )}
    </UPActivationContext.Provider>
  );
}; 