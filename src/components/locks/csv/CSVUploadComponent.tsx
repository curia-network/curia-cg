'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import Papa from 'papaparse';
import { useLuksoTokenMetadata, useLuksoProfileMetadata, type LuksoTokenMetadata } from '@/hooks/lukso/useLuksoMetadata';
import type { GatingRequirement } from '@/types/locks';

interface CSVUploadComponentProps {
  onCancel: () => void;
  onImport: (requirements: GatingRequirement[]) => void;
}

interface CSVRow {
  ecosystem: string;
  requirement_type: string;
  contract_address: string;
  min_amount: string;
}

interface ValidationResult {
  isValid: boolean;
  validRows: CSVRow[];
  errors: string[];
  warnings: string[];
}

interface EnrichedValidationResult extends ValidationResult {
  enrichedRows: Array<CSVRow & {
    tokenName?: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
    profileName?: string;
    profileImage?: string;
    isTokenFound: boolean;
  }>;
  isEnriching: boolean;
}

export const CSVUploadComponent: React.FC<CSVUploadComponentProps> = ({
  onCancel,
  onImport
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResult, setValidationResult] = useState<EnrichedValidationResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Extract addresses for GraphQL fetching (both tokens and profiles)
  const tokenAddresses = validationResult?.validRows
    .filter(row => ['lsp7_token', 'lsp8_nft'].includes(row.requirement_type))
    .map(row => row.contract_address) || [];
  
  const profileAddresses = validationResult?.validRows
    .filter(row => ['must_follow', 'must_be_followed_by'].includes(row.requirement_type))
    .map(row => row.contract_address) || [];
  
  // Fetch GraphQL metadata for tokens
  const { data: tokenMetadataResponse, isLoading: isLoadingTokens } = useLuksoTokenMetadata(
    tokenAddresses,
    { 
      includeIcons: true, 
      enabled: tokenAddresses.length > 0 
    }
  );
  
  // Fetch GraphQL metadata for profiles
  const { data: profileMetadataResponse, isLoading: isLoadingProfiles } = useLuksoProfileMetadata(
    profileAddresses,
    { 
      includeIcons: true, 
      enabled: profileAddresses.length > 0 
    }
  );
  
  const isLoadingMetadata = isLoadingTokens || isLoadingProfiles;

  // Enrich validation results with GraphQL metadata
  useEffect(() => {
    if (!validationResult || isLoadingMetadata) return;
    // Only proceed if we have responses for the data we need
    if ((tokenAddresses.length > 0 && !tokenMetadataResponse) || 
        (profileAddresses.length > 0 && !profileMetadataResponse)) return;

    console.log('[CSV Upload] Enriching with GraphQL metadata:', { tokenMetadataResponse, profileMetadataResponse });

    const tokenMetadata = tokenMetadataResponse?.data?.tokens || {};
    const profileMetadata = profileMetadataResponse?.data?.profiles || {};
    
    const enrichedRows = validationResult.validRows.map(row => {
      if (['lsp7_token', 'lsp8_nft'].includes(row.requirement_type)) {
        // Token requirement
        const metadata = tokenMetadata[row.contract_address.toLowerCase()] as LuksoTokenMetadata | undefined;
        return {
          ...row,
          tokenName: metadata?.name || undefined,
          tokenSymbol: metadata?.symbol || undefined,
          tokenDecimals: metadata?.decimals || undefined,
          isTokenFound: !!metadata
        };
      } else if (['must_follow', 'must_be_followed_by'].includes(row.requirement_type)) {
        // Profile requirement
        const metadata = profileMetadata[row.contract_address.toLowerCase()];
        return {
          ...row,
          profileName: metadata?.name || undefined,
          profileImage: metadata?.avatar || metadata?.profileImage || undefined,
          isTokenFound: !!metadata // Reuse this field for profiles too
        };
      }
      
      return {
        ...row,
        isTokenFound: false
      };
    });

    // Count missing tokens for warnings
    const missingTokens = enrichedRows.filter(row => !row.isTokenFound);
    const newWarnings = [...validationResult.warnings];
    
    if (missingTokens.length > 0) {
      newWarnings.push(`${missingTokens.length} item(s) not found in LUKSO indexer - names will show as addresses`);
    }

    setValidationResult(prev => prev ? {
      ...prev,
      enrichedRows,
      isEnriching: false,
      warnings: newWarnings
    } : null);
  }, [tokenMetadataResponse, isLoadingMetadata, validationResult?.validRows]);

  // Update enriching state when metadata starts loading
  useEffect(() => {
    if (validationResult && tokenAddresses.length > 0) {
      setValidationResult(prev => prev ? {
        ...prev,
        isEnriching: isLoadingMetadata,
        enrichedRows: prev.enrichedRows || []
      } : null);
    }
  }, [isLoadingMetadata, tokenAddresses.length, validationResult?.validRows.length]);

  // Convert enriched CSV rows to GatingRequirement objects
  const convertToGatingRequirements = useCallback((enrichedRows: EnrichedValidationResult['enrichedRows']): GatingRequirement[] => {
    return enrichedRows.map((row, index) => {
      const id = `csv-import-${Date.now()}-${index}`;
      
      if (row.requirement_type === 'lsp7_token') {
        return {
          id,
          type: 'lsp7_token' as const,
          category: 'token' as const,
          config: {
            contractAddress: row.contract_address,
            minAmount: row.min_amount,
            name: row.tokenName || 'Unknown Token',
            symbol: row.tokenSymbol || 'UNK',
            decimals: row.tokenDecimals ?? 18
          },
          isValid: true,
          displayName: row.isTokenFound 
            ? `${row.tokenName} (${row.tokenSymbol})` 
            : row.contract_address
        };
      } else if (row.requirement_type === 'lsp8_nft') {
        return {
          id,
          type: 'lsp8_nft' as const,
          category: 'token' as const,
          config: {
            contractAddress: row.contract_address,
            minAmount: row.min_amount,
            name: row.tokenName || 'Unknown Collection',
            symbol: row.tokenSymbol || 'UNK'
          },
          isValid: true,
          displayName: row.isTokenFound 
            ? `${row.tokenName} Collection` 
            : row.contract_address
        };
      } else if (row.requirement_type === 'must_follow') {
        return {
          id,
          type: 'up_must_follow' as const,
          category: 'social' as const,
          config: {
            address: row.contract_address,
            profileName: row.profileName || undefined,
            username: row.profileName || undefined
          },
          isValid: true,
          displayName: row.isTokenFound 
            ? `Must follow ${row.profileName}` 
            : `Must follow ${row.contract_address.slice(0, 8)}...`
        };
      } else if (row.requirement_type === 'must_be_followed_by') {
        return {
          id,
          type: 'up_must_be_followed_by' as const,
          category: 'social' as const,
          config: {
            address: row.contract_address,
            profileName: row.profileName || undefined,
            username: row.profileName || undefined
          },
          isValid: true,
          displayName: row.isTokenFound 
            ? `Must be followed by ${row.profileName}` 
            : `Must be followed by ${row.contract_address.slice(0, 8)}...`
        };
      }
      
      // This shouldn't happen due to validation, but provide fallback
      throw new Error(`Unsupported requirement type: ${row.requirement_type}`);
    });
  }, []);

  // Handle import button click
  const handleImport = useCallback(() => {
    if (!validationResult?.enrichedRows || validationResult.enrichedRows.length === 0) {
      return;
    }
    
    try {
      const requirements = convertToGatingRequirements(validationResult.enrichedRows);
      console.log('[CSV Upload] Importing requirements:', requirements);
      onImport(requirements);
    } catch (error) {
      console.error('[CSV Upload] Failed to convert requirements:', error);
    }
  }, [validationResult?.enrichedRows, convertToGatingRequirements, onImport]);

  // Validate CSV row format
  const validateCSVRow = useCallback((row: any, rowIndex: number): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check required fields
    if (!row.ecosystem || typeof row.ecosystem !== 'string') {
      errors.push(`Row ${rowIndex + 1}: Missing or invalid ecosystem`);
    } else if (row.ecosystem.toLowerCase() !== 'universal_profile') {
      errors.push(`Row ${rowIndex + 1}: Only 'universal_profile' ecosystem supported (found: ${row.ecosystem})`);
    }
    
    if (!row.requirement_type || typeof row.requirement_type !== 'string') {
      errors.push(`Row ${rowIndex + 1}: Missing or invalid requirement_type`);
    } else if (!['lsp7_token', 'lsp8_nft', 'must_follow', 'must_be_followed_by'].includes(row.requirement_type.toLowerCase())) {
      errors.push(`Row ${rowIndex + 1}: Invalid requirement_type '${row.requirement_type}' (must be 'lsp7_token', 'lsp8_nft', 'must_follow', or 'must_be_followed_by')`);
    }
    
    if (!row.contract_address || typeof row.contract_address !== 'string') {
      errors.push(`Row ${rowIndex + 1}: Missing or invalid contract_address`);
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(row.contract_address)) {
      // For follow requirements, we call it "target_address" but use the same column
      const addressType = ['must_follow', 'must_be_followed_by'].includes(row.requirement_type?.toLowerCase()) 
        ? 'target_address' : 'contract_address';
      errors.push(`Row ${rowIndex + 1}: Invalid ${addressType} format '${row.contract_address}'`);
    }
    
    if (!row.min_amount || typeof row.min_amount !== 'string') {
      errors.push(`Row ${rowIndex + 1}: Missing or invalid min_amount`);
    } else if (isNaN(Number(row.min_amount)) || Number(row.min_amount) <= 0) {
      errors.push(`Row ${rowIndex + 1}: min_amount must be a positive number (found: ${row.min_amount})`);
    } else if (['must_follow', 'must_be_followed_by'].includes(row.requirement_type?.toLowerCase()) && row.min_amount !== '1') {
      errors.push(`Row ${rowIndex + 1}: min_amount must be '1' for follow requirements (found: ${row.min_amount})`);
    }
    

    
    return { isValid: errors.length === 0, errors };
  }, []);

  // Process uploaded CSV file
  const processCSVFile = useCallback((file: File) => {
    setIsProcessing(true);
    setValidationResult(null);

    Papa.parse(file, {
      header: false, // Parse as array of arrays first
      skipEmptyLines: true,
      complete: (results) => {
        console.log('[CSV Upload] Parsed CSV:', results);
        
        const validRows: CSVRow[] = [];
        const allErrors: string[] = [];
        const warnings: string[] = [];
        
        if (results.errors && results.errors.length > 0) {
          results.errors.forEach((error) => {
            allErrors.push(`Parse error: ${error.message}`);
          });
        }
        
        if (!results.data || results.data.length === 0) {
          allErrors.push('No data found in CSV file');
        } else {
          const rows = results.data as string[][];
          let startIndex = 0;
          
          // Check if first row is a header (contains expected column names)
          const firstRow = rows[0];
          const isHeader = firstRow && firstRow.length === 4 && 
            (firstRow[0]?.toLowerCase().includes('ecosystem') || 
             firstRow[1]?.toLowerCase().includes('requirement') ||
             firstRow[2]?.toLowerCase().includes('address'));
          
          if (isHeader) {
            console.log('[CSV Upload] Detected header row, skipping it');
            startIndex = 1;
          }
          
          // Process data rows
          for (let i = startIndex; i < rows.length; i++) {
            const rowArray = rows[i];
            
            if (!rowArray || rowArray.length < 4) {
              allErrors.push(`Row ${i + 1}: Expected 4 columns, got ${rowArray?.length || 0}`);
              continue;
            }
            
            // Convert array to object format for validation
            const rowObject = {
              ecosystem: rowArray[0]?.trim(),
              requirement_type: rowArray[1]?.trim(),
              contract_address: rowArray[2]?.trim(),
              min_amount: rowArray[3]?.trim()
            };
            
            const validation = validateCSVRow(rowObject, i);
            
            if (validation.isValid) {
              validRows.push({
                ecosystem: rowObject.ecosystem.toLowerCase(),
                requirement_type: rowObject.requirement_type.toLowerCase(),
                contract_address: rowObject.contract_address.toLowerCase(),
                min_amount: rowObject.min_amount
              });
            } else {
              allErrors.push(...validation.errors);
            }
          }
          
          if (validRows.length > 0 && allErrors.length > 0) {
            warnings.push(`${allErrors.length} row(s) had errors and were skipped`);
          }
        }
        
        const validationResult: EnrichedValidationResult = {
          isValid: validRows.length > 0 && allErrors.length === 0,
          validRows,
          errors: allErrors,
          warnings,
          enrichedRows: [],
          isEnriching: validRows.length > 0 // Will start enriching if we have valid rows
        };
        
        setValidationResult(validationResult);
        setIsProcessing(false);
        
        console.log('[CSV Upload] Validation result:', validationResult);
      },
      error: (error) => {
        console.error('[CSV Upload] Parse error:', error);
        setValidationResult({
          isValid: false,
          validRows: [],
          errors: [`Failed to parse CSV: ${error.message}`],
          warnings: [],
          enrichedRows: [],
          isEnriching: false
        });
        setIsProcessing(false);
      }
    });
  }, [validateCSVRow]);

  // Handle file selection
  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.type.includes('csv') && !selectedFile.name.endsWith('.csv')) {
      setValidationResult({
        isValid: false,
        validRows: [],
        errors: ['Please select a CSV file (.csv)'],
        warnings: [],
        enrichedRows: [],
        isEnriching: false
      });
      return;
    }
    
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
      setValidationResult({
        isValid: false,
        validRows: [],
        errors: ['File size exceeds 10MB limit'],
        warnings: [],
        enrichedRows: [],
        isEnriching: false
      });
      return;
    }
    
    setFile(selectedFile);
    processCSVFile(selectedFile);
  }, [processCSVFile]);

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={onCancel}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Templates
        </Button>
        
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Upload CSV</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file with LUKSO token requirements
          </p>
        </div>
      </div>

      {/* CSV Upload Area */}
      <div 
        className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
          dragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {!file ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-primary/10 rounded-lg flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium">Upload your CSV file</h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop your file here, or click to browse
              </p>
            </div>
            
            <div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
                id="csv-file-input"
                disabled={isProcessing}
              />
              <label htmlFor="csv-file-input">
                <Button variant="outline" disabled={isProcessing} asChild>
                  <span className="cursor-pointer">
                    {isProcessing ? 'Processing...' : 'Choose File'}
                  </span>
                </Button>
              </label>
            </div>
            
            <div className="text-xs text-muted-foreground">
              <p>Supported format: CSV files up to 10MB</p>
              <p>LUKSO blockchain tokens only</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File Info */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {(isProcessing || validationResult?.isEnriching) && (
                <div className="text-sm text-muted-foreground">
                  {isProcessing ? 'Processing...' : 'Fetching token metadata...'}
                </div>
              )}
            </div>

            {/* Validation Results */}
            {validationResult && (
              <div className="space-y-3">
                {validationResult.isValid ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">
                      {validationResult.validRows.length} token(s) ready to import
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">
                      {validationResult.errors.length} error(s) found
                    </span>
                  </div>
                )}

                {/* Errors */}
                {validationResult.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h4 className="font-medium text-red-800 mb-2">Errors:</h4>
                    <ul className="text-sm text-red-700 space-y-1">
                      {validationResult.errors.slice(0, 5).map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                      {validationResult.errors.length > 5 && (
                        <li className="text-red-600">
                          ... and {validationResult.errors.length - 5} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {validationResult.warnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <h4 className="font-medium text-yellow-800 mb-2">Warnings:</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {validationResult.warnings.map((warning, index) => (
                        <li key={index}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Valid Tokens Preview */}
                {validationResult.validRows.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h4 className="font-medium text-green-800 mb-2">
                      Valid Requirements ({validationResult.validRows.length}):
                    </h4>
                    <div className="space-y-2">
                      {(validationResult.enrichedRows.length > 0 ? validationResult.enrichedRows : validationResult.validRows)
                        .slice(0, 3).map((row, index) => {
                          const enrichedRow = 'isTokenFound' in row ? row as (CSVRow & {
                            tokenName?: string;
                            tokenSymbol?: string;
                            tokenDecimals?: number;
                            profileName?: string;
                            profileImage?: string;
                            isTokenFound: boolean;
                          }) : null;
                          
                          let displayName: string;
                          if (['lsp7_token', 'lsp8_nft'].includes(row.requirement_type)) {
                            displayName = enrichedRow?.isTokenFound 
                              ? `${enrichedRow.tokenName} (${enrichedRow.tokenSymbol})` 
                              : row.contract_address;
                          } else if (['must_follow', 'must_be_followed_by'].includes(row.requirement_type)) {
                            displayName = enrichedRow?.isTokenFound 
                              ? enrichedRow.profileName || row.contract_address
                              : row.contract_address;
                          } else {
                            displayName = row.contract_address;
                          }
                          
                          return (
                            <div key={index} className="text-sm text-green-700">
                              <div className="font-medium">
                                {row.requirement_type.toUpperCase()}: {displayName}
                              </div>
                              <div className="font-mono text-xs">
                                {row.contract_address} (min: {row.min_amount})
                                {enrichedRow?.tokenDecimals !== undefined && (
                                  <span className="ml-2 text-green-600">
                                    • {enrichedRow.tokenDecimals} decimals
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      {validationResult.validRows.length > 3 && (
                        <div className="text-sm text-green-600">
                          ... and {validationResult.validRows.length - 3} more tokens
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setValidationResult(null);
                }}
                disabled={isProcessing}
              >
                Upload Different File
              </Button>
              
              {validationResult?.isValid && (
                <Button
                  onClick={handleImport}
                  disabled={isProcessing || validationResult?.isEnriching}
                >
                  Import {validationResult.validRows.length} Requirement(s) →
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Format Information */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">CSV Format Options:</h4>
        <div className="text-sm text-muted-foreground space-y-2">
          <div>
            <p className="font-medium">Option 1: With header row (optional)</p>
            <p><code>ecosystem,requirement_type,contract_address,min_amount</code></p>
            <p><code>universal_profile,lsp7_token,0xb2894...,1</code></p>
          </div>
          <div>
            <p className="font-medium">Option 2: Data only (simpler)</p>
            <p><code>universal_profile,lsp7_token,0xb2894...,1</code></p>
            <p><code>universal_profile,lsp8_nft,0x54405...,1</code></p>
            <p><code>universal_profile,must_follow,0x1234...,1</code></p>
            <p><code>universal_profile,must_be_followed_by,0xabcd...,1</code></p>
          </div>
          <div className="mt-2 pt-2 border-t border-muted-foreground/20 text-xs">
            <p>• Header row is automatically detected and optional</p>
            <p>• Each row must have exactly 4 columns in the order shown</p>
            <p>• Supports: tokens (lsp7_token, lsp8_nft) and profiles (must_follow, must_be_followed_by)</p>
            <p>• LUKSO blockchain only</p>
            <p>• Set ANY/ALL fulfillment globally at the lock level</p>
          </div>
        </div>
        <Button variant="link" size="sm" className="p-0 h-auto mt-2">
          Download template CSV →
        </Button>
      </div>
    </div>
  );
};
