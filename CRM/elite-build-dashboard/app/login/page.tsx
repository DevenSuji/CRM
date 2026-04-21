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
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 bg-mn-h2 rounded-xl flex items-center justify-center shadow-lg shadow-mn-h2/20 mx-auto mb-4">
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
      <div className="flex items-center justify-center h-full">
        <div className="max-w-sm w-full text-center space-y-6 p-8">
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
    <div className="flex items-center justify-center h-full">
      <div className="max-w-sm w-full text-center space-y-8 p-8">
        <div>
          <div className="w-16 h-16 bg-mn-h2 rounded-2xl flex items-center justify-center shadow-lg shadow-mn-h2/20 mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-mn-h1">Elite Build CRM</h1>
          <p className="text-sm text-mn-text-muted mt-2">Sign in with your Google account to continue.</p>
        </div>

        <Button
          onClick={signInWithGoogle}
          icon={<LogIn className="w-4 h-4" />}
          className="w-full"
        >
          Sign in with Google
        </Button>

        <p className="text-[10px] text-mn-text-muted/60">
          Only authorized team members can access this CRM.
        </p>
      </div>
    </div>
  );
}
