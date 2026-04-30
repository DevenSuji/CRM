"use client";
import { Building2 } from 'lucide-react';
import type { CRMBranding } from '@/lib/utils/branding';

interface BrandMarkProps {
  branding: CRMBranding;
  className?: string;
  iconClassName?: string;
}

export function BrandMark({ branding, className = 'h-10 w-10 rounded-2xl', iconClassName = 'h-5 w-5' }: BrandMarkProps) {
  if (branding.logo) {
    return (
      <img
        src={branding.logo}
        alt={branding.companyName}
        className={`${className} flex-shrink-0 object-cover shadow-lg`}
      />
    );
  }

  return (
    <div
      className={`${className} flex flex-shrink-0 items-center justify-center shadow-[0_10px_24px_color-mix(in_srgb,var(--mn-brand)_22%,transparent)]`}
      style={{ background: 'var(--mn-brand-gradient)' }}
    >
      <Building2 className={`${iconClassName} text-[var(--mn-brand-contrast)]`} />
    </div>
  );
}
