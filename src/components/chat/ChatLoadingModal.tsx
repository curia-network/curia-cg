'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Loader } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ChatLoadingModalProps {
  message?: string;
  onClose: () => void;
}

export function ChatLoadingModal({ 
  message = "Connecting to chat...", 
  onClose 
}: ChatLoadingModalProps) {
  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Loading Modal */}
      <div 
        className={cn(
          "fixed z-50 bg-background shadow-2xl border rounded-lg",
          "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
          "w-80 p-8 text-center",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Chat loading"
      >
        <div className="flex flex-col items-center space-y-4">
          <Loader className="h-8 w-8 animate-spin text-primary" />
          <div>
            <h3 className="text-lg font-semibold mb-2">Setting up chat</h3>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}