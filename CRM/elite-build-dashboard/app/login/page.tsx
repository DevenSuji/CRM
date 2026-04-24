"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Building2, LogIn, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const { firebaseUser, crmUser, loading, accessDenied, signInWithGoogle, logout } = useAuth();
  const router = useRouter();

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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-mn-h2 to-mn-accent shadow-lg shadow-mn-h2/20">
            <Building2 className="w-6 h-6 text-white" />
          </div>
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
        <div className="hidden min-h-[560px] flex-col justify-between bg-[linear-gradient(145deg,color-mix(in_srgb,var(--mn-h2)_88%,#0f2320),color-mix(in_srgb,var(--mn-accent)_74%,var(--mn-h2)))] p-10 text-white md:flex">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/18 shadow-lg backdrop-blur">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <p className="mb-4 text-sm font-black uppercase tracking-[0.35em] text-white/65">EliteBuild Infra Tech</p>
            <h2 className="max-w-md text-4xl font-black leading-tight tracking-tight">
              Your calming command center for real-estate sales.
            </h2>
            <p className="mt-5 max-w-md text-sm font-medium leading-6 text-white/75">
              Capture leads, match buyers to inventory, manage site visits, and keep the whole team aligned.
            </p>
          </div>
        </div>
        <div className="flex items-center p-8 sm:p-10">
          <div className="mx-auto w-full max-w-md space-y-8 text-center">
            <div>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-mn-h2 to-mn-accent shadow-lg shadow-mn-h2/20 md:hidden">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-mn-accent">Welcome back</p>
              <h1 className="text-3xl font-black tracking-tight text-mn-h1">Elite Build CRM</h1>
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
