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
import { classifyLsp7Cached, getDisplayDecimals, isNonDivisibleToken, type Lsp7Divisibility } from '@/lib/lukso/lsp7Classification';

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
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [tokenClassification, setTokenClassification] = useState<Lsp7Divisibility | null>(null);
  const [actualDecimals, setActualDecimals] = useState<number>(18);

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

  // ===== VALIDATION =====
  
  useEffect(() => {
    const validation = validateEthereumAddress(contractAddress);
    setAddressValidation(validation);
    
    // Clear metadata when address changes
    if (!validation.isValid) {
      setTokenName('');
      setTokenSymbol('');
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

  const handleFetchMetadata = async () => {
    if (!addressValidation.isValid) return;
    
    setIsLoadingMetadata(true);
    try {
      console.log(`[LSP7 Configurator] Fetching enhanced metadata for contract: ${contractAddress}`);

      const rpcUrl = process.env.NEXT_PUBLIC_LUKSO_MAINNET_RPC_URL || 'https://rpc.mainnet.lukso.network';
      
      // 1. First classify the token using our robust detection pipeline
      console.log(`[LSP7 Configurator] Step 1: Classifying token...`);
      const classification = await classifyLsp7Cached({
        asset: contractAddress as `0x${string}`,
        rpcUrl,
      });
      
      console.log(`[LSP7 Configurator] ✅ Classification result:`, classification);
      setTokenClassification(classification);
      
      // Handle non-LSP7 tokens
      if (classification.kind === 'NOT_LSP7') {
        throw new Error('Contract does not appear to be a valid LUKSO LSP7 token.');
      }
      
      if (classification.kind === 'UNKNOWN') {
        console.warn(`[LSP7 Configurator] Token classification unknown: ${classification.note}`);
      }

      // 2. Get display decimals and actual decimals  
      let contractDecimals = 18; // Fallback
      
      // Try to get actual decimals from contract
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(contractAddress, [
          'function decimals() view returns (uint8)'
        ], provider);
        contractDecimals = await contract.decimals();
        console.log(`[LSP7 Configurator] Contract decimals: ${contractDecimals}`);
      } catch (decimalsError) {
        console.log(`[LSP7 Configurator] Could not fetch contract decimals:`, decimalsError);
      }
      
      // Use the more conservative approach - actual contract decimals for storage,
      // but respect classification for display validation
      setActualDecimals(contractDecimals);

      // 3. Fetch basic metadata (name, symbol)
      console.log(`[LSP7 Configurator] Step 2: Fetching basic metadata...`);
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, [
        'function getData(bytes32) view returns (bytes)',
        'function getDataBatch(bytes32[]) view returns (bytes[])',
      ], provider);

      let name = 'Unknown Token';
      let symbol = 'UNK';

      try {
        // Try ERC725Y data keys first
        const LSP4_TOKEN_NAME_KEY = '0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1';
        const LSP4_TOKEN_SYMBOL_KEY = '0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756';
        
        const dataKeys = [LSP4_TOKEN_NAME_KEY, LSP4_TOKEN_SYMBOL_KEY];
        const [nameBytes, symbolBytes] = await contract.getDataBatch(dataKeys);
        
        if (nameBytes && nameBytes !== '0x') {
          name = ethers.utils.toUtf8String(nameBytes);
        }
        if (symbolBytes && symbolBytes !== '0x') {
          symbol = ethers.utils.toUtf8String(symbolBytes);
        }
        
        console.log(`[LSP7 Configurator] ✅ Metadata via ERC725Y: name=${name}, symbol=${symbol}`);
      } catch (erc725yError) {
        console.log(`[LSP7 Configurator] ERC725Y metadata failed, trying fallback:`, erc725yError);
        
        // Fallback to standard functions
        try {
          const fallbackContract = new ethers.Contract(contractAddress, [
            'function name() view returns (string)',
            'function symbol() view returns (string)'
          ], provider);
          
          [name, symbol] = await Promise.all([
            fallbackContract.name().catch(() => 'Unknown Token'),
            fallbackContract.symbol().catch(() => 'UNK')
          ]);
          
          console.log(`[LSP7 Configurator] ✅ Metadata via fallback: name=${name}, symbol=${symbol}`);
        } catch (metadataError) {
          console.log(`[LSP7 Configurator] All metadata methods failed:`, metadataError);
        }
      }

      // Update state
      setTokenName(name);
      setTokenSymbol(symbol);

      console.log(`[LSP7 Configurator] ✅ Enhanced metadata fetch complete`);

    } catch (error) {
      console.error('[LSP7 Configurator] Enhanced metadata fetch failed:', error);
      // Set fallback values
      setTokenName('Unknown Token');
      setTokenSymbol('UNK');
      setTokenClassification(null);
      // Don't change actualDecimals - keep the previous value or default
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && addressValidation.isValid && amountValidation.isValid) {
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
            disabled={disabled || !isFormValid}
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