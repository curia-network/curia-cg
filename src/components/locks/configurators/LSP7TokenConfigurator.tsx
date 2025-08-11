'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Coins, Info } from 'lucide-react';
import { ethers } from 'ethers';

import { GatingRequirement, LSP7TokenConfig } from '@/types/locks';
import { validateEthereumAddress } from '@/lib/requirements/validation';
import { parseTokenAmount } from '@/lib/requirements/conversions';
import { getDisplayDecimals, isNonDivisibleToken, type Lsp7Divisibility } from '@/lib/lukso/lsp7Classification';
import { useLuksoSingleToken } from '@/hooks/lukso/useLuksoMetadata';
import { generateMarketplaceLinksForCSV } from '@/lib/lukso/tokenMarketplaceIntegration';

interface LSP7TokenConfiguratorProps {
  editingRequirement?: GatingRequirement;
  onSave: (requirement: GatingRequirement) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export const LSP7TokenConfigurator: React.FC<LSP7TokenConfiguratorProps> = ({
  editingRequirement,
  onSave,
  onCancel,
  disabled = false
}) => {
  // ===== STATE =====
  
  const [contractAddress, setContractAddress] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [addressValidation, setAddressValidation] = useState<{ isValid: boolean; error?: string }>({ isValid: false });
  const [amountValidation, setAmountValidation] = useState<{ isValid: boolean; error?: string }>({ isValid: false });
  const [tokenClassification, setTokenClassification] = useState<Lsp7Divisibility | null>(null);
  const [actualDecimals, setActualDecimals] = useState<number>(18);

  // ===== GRAPHQL METADATA FETCHING =====
  
  const { 
    data: tokenData, 
    isLoading: isLoadingMetadata, 
    error: metadataError,
    refetch: refetchMetadata 
  } = useLuksoSingleToken(
    contractAddress,
    { 
      includeIcons: true, 
      enabled: addressValidation.isValid 
    }
  );

  // ===== INITIALIZATION =====
  
  useEffect(() => {
    if (editingRequirement && editingRequirement.type === 'lsp7_token') {
      const config = editingRequirement.config as LSP7TokenConfig;
      setContractAddress(config.contractAddress || '');
      setTokenName(config.name || '');
      setTokenSymbol(config.symbol || '');
      
      // Use stored decimals if available, otherwise default to 18
      const decimals = config.decimals || 18;
      setActualDecimals(decimals);
      
      // Convert wei back to human readable using actual decimals
      if (config.minAmount) {
        const humanAmount = parseFloat(ethers.utils.formatUnits(config.minAmount, decimals));
        setTokenAmount(humanAmount.toString());
      }
    }
  }, [editingRequirement]);

  // ===== GRAPHQL DATA HANDLING =====
  
  useEffect(() => {
    if (tokenData) {
      console.log(`[LSP7 Configurator] GraphQL data received:`, tokenData);
      
      // Validate that this is an LSP7 token
      if (tokenData.tokenType !== 'LSP7') {
        console.error(`[LSP7 Configurator] Token is not LSP7, it's ${tokenData.tokenType}`);
        setTokenName('Invalid Token');
        setTokenSymbol('ERR');
        setTokenClassification(null);
        setAddressValidation({ 
          isValid: false, 
          error: `Contract is ${tokenData.tokenType}, not LSP7. Please use the LSP8 configurator instead.` 
        });
        return;
      }
      
      // Update metadata from GraphQL
      setTokenName(tokenData.name || 'Unknown Token');
      setTokenSymbol(tokenData.symbol || 'UNK');
      setActualDecimals(tokenData.decimals);
      
      // Create classification data from GraphQL response
      const classification: Lsp7Divisibility = tokenData.isDivisible 
        ? { kind: 'LSP7_DIVISIBLE', decimals: tokenData.decimals }
        : { kind: 'LSP7_NON_DIVISIBLE', reason: tokenData.lsp4TokenType === 1 ? 'LSP4_NFT' : 'DECIMALS_ZERO' };
      
      setTokenClassification(classification);
      
      console.log(`[LSP7 Configurator] ✅ GraphQL metadata applied: ${tokenData.name} (${tokenData.symbol}), decimals=${tokenData.decimals}, divisible=${tokenData.isDivisible}`);
    }
  }, [tokenData]);

  useEffect(() => {
    if (metadataError) {
      console.error('[LSP7 Configurator] GraphQL metadata error:', metadataError);
      setTokenName('Unknown Token');
      setTokenSymbol('UNK');
      setTokenClassification(null);
    }
  }, [metadataError]);

  // ===== VALIDATION =====
  
  useEffect(() => {
    const validation = validateEthereumAddress(contractAddress);
    setAddressValidation(validation);
    
    // Clear metadata when address changes and becomes invalid
    if (!validation.isValid) {
      setTokenName('');
      setTokenSymbol('');
      setTokenClassification(null);
      setActualDecimals(18); // Reset to default
    }
  }, [contractAddress]);

  useEffect(() => {
    if (!tokenAmount.trim()) {
      setAmountValidation({ isValid: false, error: 'Token amount is required' });
      return;
    }
    
    const amount = parseFloat(tokenAmount);
    if (isNaN(amount) || amount <= 0) {
      setAmountValidation({ isValid: false, error: 'Must be a positive number' });
      return;
    }
    
    // Enhanced validation based on token classification
    if (tokenClassification) {
      const isNonDivisible = isNonDivisibleToken(tokenClassification);
      
      if (isNonDivisible) {
        // For non-divisible tokens, only allow whole numbers
        if (!Number.isInteger(amount)) {
          setAmountValidation({ 
            isValid: false, 
            error: 'Non-divisible tokens require whole numbers only' 
          });
          return;
        }
      } else {
        // For divisible tokens, check precision based on actual decimals
        const displayDecimals = getDisplayDecimals(tokenClassification);
        const factor = Math.pow(10, displayDecimals);
        const scaledAmount = amount * factor;
        
        if (!Number.isInteger(scaledAmount)) {
          setAmountValidation({ 
            isValid: false, 
            error: `Maximum ${displayDecimals} decimal places allowed` 
          });
          return;
        }
      }
    }
    
    if (amount > 1e12) {
      setAmountValidation({ isValid: false, error: 'Amount too large' });
      return;
    }
    
    setAmountValidation({ isValid: true });
  }, [tokenAmount, tokenClassification]);

  // ===== HANDLERS =====
  
  const handleSave = () => {
    if (!addressValidation.isValid || !amountValidation.isValid || !contractAddress.trim() || !tokenAmount.trim()) return;

    try {
      // Use actual decimals for proper conversion
      const weiAmount = parseTokenAmount(tokenAmount, actualDecimals);
      
      // Create enhanced display name based on token classification
      let displayName = `LSP7 Token: ≥ ${parseFloat(tokenAmount).toLocaleString()} ${tokenSymbol || 'tokens'}`;
      if (tokenClassification && isNonDivisibleToken(tokenClassification)) {
        if (tokenClassification.kind === 'LSP7_NON_DIVISIBLE') {
          const reason = tokenClassification.reason === 'LSP4_NFT' ? 'Multi-unit NFT' : 'Non-divisible';
          displayName += ` (${reason})`;
        } else {
          displayName += ` (Non-divisible)`;
        }
      }
      
      // Generate marketplace links for the token
      const marketplaceLinks = generateMarketplaceLinksForCSV(
        'LSP7',
        contractAddress.trim()
      );

      const requirement: GatingRequirement = {
        id: editingRequirement?.id || crypto.randomUUID(),
        type: 'lsp7_token',
        category: 'token',
        config: {
          contractAddress: contractAddress.trim(),
          minAmount: weiAmount.toString(),
          name: tokenName.trim() || undefined,
          symbol: tokenSymbol.trim() || undefined,
          decimals: actualDecimals, // Store the actual decimals
          marketplaceLinks, // Add marketplace links
        } as LSP7TokenConfig,
        isValid: true,
        displayName
      };

      onSave(requirement);
    } catch (error) {
      console.error('Failed to save LSP7 token requirement:', error);
      setAmountValidation({ isValid: false, error: 'Failed to save requirement' });
    }
  };

  const handleFetchMetadata = () => {
    if (!addressValidation.isValid) return;
    
    console.log(`[LSP7 Configurator] Triggering GraphQL metadata refetch for: ${contractAddress}`);
    refetchMetadata();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && addressValidation.isValid && amountValidation.isValid && !isLoadingMetadata) {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const isFormValid = addressValidation.isValid && amountValidation.isValid && contractAddress.trim() && tokenAmount.trim();

  // ===== RENDER =====
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Requirements
          </button>
        </div>
        
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {editingRequirement ? 'Edit Requirement' : 'Add Requirement'}
        </div>
      </div>

      {/* Configuration Form */}
      <div className="max-w-md mx-auto">
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 p-6 transition-all duration-300 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-600">
          {/* Icon and Title */}
          <div className="flex items-center space-x-3 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg">
              <Coins className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">LSP7 Token Requirement</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Require minimum LUKSO LSP7 tokens</p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Contract Address */}
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                LSP7 Contract Address *
              </Label>
              <div className="flex space-x-2 mt-1">
                <Input
                  type="text"
                  placeholder="0x..."
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={disabled}
                  className={`text-sm ${
                    addressValidation.isValid 
                      ? 'border-orange-200 focus:border-orange-400 focus:ring-orange-400' 
                      : contractAddress.trim() 
                        ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                        : 'border-gray-300 focus:border-gray-400 focus:ring-gray-400'
                  }`}
                />
                <Button 
                  size="sm"
                  onClick={handleFetchMetadata}
                  disabled={disabled || !addressValidation.isValid || isLoadingMetadata}
                  variant="outline"
                  className="shrink-0"
                >
                  {isLoadingMetadata ? '...' : 'Fetch'}
                </Button>
              </div>
              
              {/* Address Validation Message */}
              {contractAddress.trim() && !addressValidation.isValid && addressValidation.error && (
                <p className="text-sm text-red-600 mt-1">
                  {addressValidation.error}
                </p>
              )}
            </div>

            {/* Token Metadata */}
            {(tokenName || tokenSymbol || tokenClassification) && (
              <div className="p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                      {tokenName || 'Unknown Token'}
                    </p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      {tokenSymbol || 'UNK'}
                    </p>
                    
                    {/* Classification badges */}
                    {tokenClassification && (
                      <div className="flex items-center gap-2 mt-2">
                        {tokenClassification.kind === 'LSP7_DIVISIBLE' && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            Divisible ({tokenClassification.decimals} decimals)
                          </Badge>
                        )}
                        {tokenClassification.kind === 'LSP7_NON_DIVISIBLE' && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {tokenClassification.reason === 'LSP4_NFT' ? 'Multi-unit NFT' : 'Non-divisible'}
                          </Badge>
                        )}
                        {tokenClassification.kind === 'UNKNOWN' && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                            Unknown Type
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Info icon with tooltip for non-divisible tokens */}
                  {tokenClassification && isNonDivisibleToken(tokenClassification) && (
                    <div className="flex-shrink-0 ml-2" title="This token only accepts whole number amounts">
                      <Info className="h-4 w-4 text-orange-600" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Token Amount */}
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Minimum Amount *
                {tokenClassification && isNonDivisibleToken(tokenClassification) && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">(Whole numbers only)</span>
                )}
              </Label>
              
              {/* Helper text based on token type */}
              {tokenClassification && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isNonDivisibleToken(tokenClassification) 
                    ? "This token doesn't support fractional amounts. Enter whole numbers like 1, 2, 10, etc."
                    : `This token supports up to ${getDisplayDecimals(tokenClassification)} decimal places.`
                  }
                </p>
              )}
              
              <div className="flex space-x-3 mt-2">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder={
                      tokenClassification && isNonDivisibleToken(tokenClassification) 
                        ? "e.g., 5" 
                        : "e.g., 100.5"
                    }
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={disabled}
                    className={`text-lg font-medium ${
                      amountValidation.isValid 
                        ? 'border-orange-200 focus:border-orange-400 focus:ring-orange-400' 
                        : tokenAmount.trim() 
                          ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                          : 'border-gray-300 focus:border-gray-400 focus:ring-gray-400'
                    }`}
                  />
                </div>
                <div className="flex items-center px-4 bg-orange-100 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-800">
                  <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    {tokenSymbol || 'tokens'}
                  </span>
                </div>
              </div>

              {/* Amount Validation Message */}
              {tokenAmount.trim() && !amountValidation.isValid && amountValidation.error && (
                <p className="text-sm text-red-600 mt-1">
                  {amountValidation.error}
                </p>
              )}
            </div>

            {/* Success Preview */}
            {isFormValid && (
              <div className="mt-4 p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  ✓ Users need at least <strong>{parseFloat(tokenAmount).toLocaleString()} {tokenSymbol || 'tokens'}</strong>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 mt-6">
          <Button 
            variant="outline" 
            onClick={onCancel}
            disabled={disabled}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={disabled || !isFormValid || isLoadingMetadata}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {editingRequirement ? 'Update Requirement' : 'Add Requirement'}
          </Button>
        </div>
      </div>

      {/* Help Text */}
      <div className="max-w-md mx-auto text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          LSP7 tokens are fungible tokens on LUKSO. Users must hold the specified minimum amount to access gated content.
        </p>
      </div>
    </div>
  );
}; 