"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { LogIn, ShieldX } from 'lucide-react';
import { useBranding } from '@/lib/context/BrandingContext';
import { Button } from '@/components/ui/Button';
import { BrandMark } from '@/components/BrandMark';

export default function LoginPage() {
  const { firebaseUser, crmUser, loading, accessDenied, signInWithGoogle, logout } = useAuth();
  const { branding } = useBranding();
  const router = useRouter();
  const appTitle = `${branding.companyName} CRM`;
  const [bannerSize, setBannerSize] = useState<{ src: string; width: number; height: number } | null>(null);
  const usePhotoBanner = Boolean(
    branding.banner
    && bannerSize
    && bannerSize.src === branding.banner
    && bannerSize.width >= 1000
    && bannerSize.height >= 400
  );

  // If already authenticated with a valid CRM profile, redirect to home
  useEffect(() => {
    if (!loading && crmUser) {
      router.replace('/dashboard');
    }
  }, [loading, crmUser, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="app-shell-panel rounded-[2rem] px-10 py-9 text-center">
          <BrandMark branding={branding} className="mx-auto mb-4 h-14 w-14 rounded-3xl" iconClassName="h-6 w-6" />
          <p className="text-mn-text-muted font-medium animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // Access denied — signed in but not authorized
  if (accessDenied && firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="app-shell-panel w-full max-w-md space-y-6 rounded-[2rem] p-8 text-center">
          <div className="w-16 h-16 bg-mn-danger/20 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldX className="w-8 h-8 text-mn-danger" />
          </div>
          <div>
            <h1 className="text-xl font-black text-mn-h1">Access Denied</h1>
            <p className="text-sm text-mn-text-muted mt-2">
              The account <strong className="text-mn-text">{firebaseUser.email}</strong> is not registered in this CRM.
            </p>
            <p className="text-sm text-mn-text-muted mt-1">
              Contact your admin to get access.
            </p>
          </div>
          <Button variant="secondary" onClick={logout} className="w-full">
            Sign out & try another account
          </Button>
        </div>
      </div>
    );
  }

  // Not signed in — show login
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2.25rem] border border-white/45 bg-[color-mix(in_srgb,var(--mn-card)_92%,transparent)] shadow-[var(--mn-shadow)] backdrop-blur-2xl md:grid-cols-[1.08fr_0.92fr]">
        <div
          className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden p-10 text-white md:flex"
          style={{ background: 'var(--mn-brand-gradient)' }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_14%,rgba(255,255,255,0.26),transparent_18rem),radial-gradient(circle_at_86%_12%,rgba(255,255,255,0.16),transparent_20rem),linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.34))]" />
          {branding.banner && (
            <img
              src={branding.banner}
              alt=""
              aria-hidden="true"
              onLoad={event => {
                const image = event.currentTarget;
                setBannerSize({ src: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight });
              }}
              className={
                usePhotoBanner
                  ? 'absolute inset-0 h-full w-full object-cover'
                  : 'pointer-events-none absolute h-px w-px opacity-0'
              }
            />
          )}
          {usePhotoBanner && <div className="absolute inset-0 bg-black/48" />}
          {!usePhotoBanner && <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/36 via-black/12 to-transparent" />}
          <div className="relative z-10">
            <BrandMark branding={branding} className="h-14 w-14 rounded-3xl bg-white/18" iconClassName="h-7 w-7" />
          </div>
          <div className="relative z-10">
            <p className="mb-4 text-sm font-black uppercase tracking-[0.35em] text-white/65">{branding.companyName}</p>
            <h2 className="max-w-md text-4xl font-black leading-tight tracking-tight">
              {branding.tagline}
            </h2>
            <p className="mt-5 max-w-md text-sm font-medium leading-6 text-white/75">
              Capture leads, match buyers to inventory, manage site visits, and keep the whole team aligned.
            </p>
            {(branding.phone || branding.email || branding.website) && (
              <div className="mt-7 flex flex-wrap gap-3 text-xs font-bold text-white/78">
                {branding.phone && <span>{branding.phone}</span>}
                {branding.email && <span>{branding.email}</span>}
                {branding.website && <span>{branding.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center p-8 sm:p-10">
          <div className="mx-auto w-full max-w-md space-y-8 text-center">
            <div>
              <BrandMark branding={branding} className="mx-auto mb-5 h-16 w-16 rounded-3xl md:hidden" iconClassName="h-8 w-8" />
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-mn-accent">Welcome back</p>
              <h1 className="text-3xl font-black tracking-tight text-mn-h1">{appTitle}</h1>
              <p className="mt-3 text-sm font-medium leading-6 text-mn-text-muted">Sign in with your Google account to continue.</p>
            </div>

            <div className="app-shell-panel rounded-[1.75rem] p-4">
              <Button
                onClick={signInWithGoogle}
                icon={<LogIn className="w-4 h-4" />}
                className="w-full"
              >
                Sign in with Google
              </Button>
            </div>

            <p className="text-[11px] font-medium text-mn-text-muted/70">
              Only authorized team members can access this CRM.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
