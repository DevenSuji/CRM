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
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-start sm:pt-10">
      <div className="fixed inset-0 bg-[rgba(11,18,16,0.42)] backdrop-blur-md" onClick={onClose} />
      <div className={`relative mb-0 max-h-[92vh] w-full overflow-hidden rounded-t-[2rem] border border-white/45 bg-[color-mix(in_srgb,var(--mn-card)_94%,transparent)] shadow-[var(--mn-shadow)] backdrop-blur-2xl sm:mx-4 sm:mb-10 sm:rounded-[2rem] ${maxWidth}`}>
        <div className="flex items-center justify-between border-b border-mn-border/40 px-5 py-4 sm:px-8 sm:py-5">
          <h2 className="text-lg font-black tracking-tight text-mn-h1 sm:text-xl">{title}</h2>
          <button onClick={onClose} className="rounded-full border border-transparent p-2 text-mn-text-muted transition-colors hover:border-mn-border/30 hover:bg-white/45 hover:text-mn-text dark:hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-4.5rem)] overflow-y-auto p-5 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
