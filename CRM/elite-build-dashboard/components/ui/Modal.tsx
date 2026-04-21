"use client";
import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 overflow-y-auto">
      <div className="fixed inset-0 bg-mn-overlay backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-mn-card border border-mn-border rounded-2xl shadow-2xl w-full ${maxWidth} mx-4 mb-10`}>
        <div className="flex items-center justify-between px-8 py-5 border-b border-mn-border">
          <h2 className="text-xl font-black text-mn-h1">{title}</h2>
          <button onClick={onClose} className="text-mn-text-muted hover:text-mn-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
