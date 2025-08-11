'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload } from 'lucide-react';

interface CSVUploadComponentProps {
  onCancel: () => void;
}

export const CSVUploadComponent: React.FC<CSVUploadComponentProps> = ({
  onCancel
}) => {
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
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
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
          
          <Button variant="outline">
            Choose File
          </Button>
          
          <div className="text-xs text-muted-foreground">
            <p>Supported format: CSV files up to 10MB</p>
            <p>LUKSO blockchain tokens only</p>
          </div>
        </div>
      </div>

      {/* Format Information */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Required CSV Format:</h4>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><code>ecosystem,requirement_type,contract_address,min_amount,fulfillment</code></p>
          <p><code>universal_profile,lsp7_token,0xb2894...,1,any</code></p>
          <p><code>universal_profile,lsp8_nft,0x54405...,1,any</code></p>
        </div>
        <Button variant="link" size="sm" className="p-0 h-auto mt-2">
          Download template CSV →
        </Button>
      </div>
    </div>
  );
};
