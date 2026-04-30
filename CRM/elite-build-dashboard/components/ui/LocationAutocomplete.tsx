"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import { firebaseAuthHeaders } from '@/lib/utils/authHeaders';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

declare global {
  interface Window {
    google?: any;
    _googleMapsLoaded?: boolean;
    _googleMapsCallbacks?: (() => void)[];
  }
}

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (window._googleMapsLoaded && window.google?.maps?.places) {
      resolve();
      return;
    }

    if (!window._googleMapsCallbacks) {
      window._googleMapsCallbacks = [];
    }
    window._googleMapsCallbacks.push(resolve);

    // Only load script once
    if (document.querySelector('script[src*="maps.googleapis.com"]')) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('Google Maps API key not set. Location autocomplete disabled.');
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=_onGoogleMapsLoaded`;
    script.async = true;
    script.defer = true;

    (window as any)._onGoogleMapsLoaded = () => {
      window._googleMapsLoaded = true;
      window._googleMapsCallbacks?.forEach(cb => cb());
      window._googleMapsCallbacks = [];
    };

    document.head.appendChild(script);
  });
}

/** Detect if input looks like a Google Maps URL */
function isGoogleMapsUrl(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('https://maps.app.goo.gl/') ||
    trimmed.startsWith('https://goo.gl/maps/') ||
    trimmed.startsWith('https://www.google.com/maps/') ||
    trimmed.startsWith('https://maps.google.com/')
  );
}

export function LocationAutocomplete({
  value,
  onChange,
  label,
  placeholder = 'Start typing a location or paste a Google Maps URL...',
  required,
}: LocationAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded || !inputRef.current || !window.google?.maps?.places) return;
    if (autocompleteRef.current) return; // Already initialized

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['(regions)'],
      componentRestrictions: { country: 'in' },
      fields: ['formatted_address', 'name', 'geometry'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const name = place?.formatted_address || place?.name || '';
      onChange(name);
    });

    autocompleteRef.current = autocomplete;
  }, [loaded, onChange]);

  /** Resolve a Google Maps URL to an address using the Geocoding API */
  const resolveMapUrl = useCallback(async (url: string) => {
    setResolving(true);
    try {
      const authHeaders = await firebaseAuthHeaders();
      // Use a Next.js API route to resolve the short URL (avoids CORS issues)
      const res = await fetch('/api/resolve-map-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to resolve URL');
      if (data.address) {
        onChange(data.address);
      } else {
        // Fallback — just keep the URL
        console.warn('Could not resolve address from URL');
      }
    } catch (err) {
      console.error('Map URL resolution error:', err);
    } finally {
      setResolving(false);
    }
  }, [onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (isGoogleMapsUrl(pasted)) {
      e.preventDefault();
      onChange(pasted);
      resolveMapUrl(pasted);
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
          {required && <span className="text-mn-danger ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          required={required}
          className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus focus:ring-1 focus:ring-mn-input-focus/30 transition-colors"
        />
        {resolving && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-mn-h2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[10px] font-bold">Resolving...</span>
          </div>
        )}
      </div>
      {isGoogleMapsUrl(value) && !resolving && (
        <button
          type="button"
          onClick={() => resolveMapUrl(value)}
          className="flex items-center gap-1 mt-1 text-[10px] text-mn-h2 hover:underline"
        >
          <LinkIcon className="w-3 h-3" /> Resolve this Maps URL to address
        </button>
      )}
      {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
        <p className="text-[10px] text-mn-text-muted mt-1">
          Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local for location suggestions
        </p>
      )}
    </div>
  );
}
