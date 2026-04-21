"use client";
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, open, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setCurrentIndex(initialIndex);
  }, [open, initialIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex(i => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, goNext, goPrev]);

  if (!open || images.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-bold">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Previous button */}
      {images.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Image */}
      <img
        src={images[currentIndex]}
        alt={`Image ${currentIndex + 1}`}
        onClick={e => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
      />

      {/* Next button */}
      {images.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}
    </div>,
    document.body,
  );
}
