'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';

interface ChatErrorModalProps {
  error: string;
  retryCount?: number;
  onRetry: () => void;
  onClose: () => void;
}

export function ChatErrorModal({ 
  error, 
  retryCount = 0,
  onRetry, 
  onClose 
}: ChatErrorModalProps) {
  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Error Modal */}
      <div 
        className={cn(
          "fixed z-50 bg-background shadow-2xl border rounded-lg",
          "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
          "w-96 p-6",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Chat error"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-destructive">Chat Connection Failed</h3>
              {retryCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Failed after {retryCount} attempt{retryCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Error Message */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            {error}
          </p>
          <p className="text-xs text-muted-foreground">
            This might be due to a temporary network issue or server problem.
          </p>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <Button
            onClick={onRetry}
            className="flex-1"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Close
          </Button>
        </div>
      </div>
    </>,
    document.body
  );
}