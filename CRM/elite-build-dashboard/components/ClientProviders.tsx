"use client";
import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/context/AuthContext';
import { ThemeProvider } from '@/lib/context/ThemeContext';
import { AuthGuard } from '@/components/AuthGuard';
import { ToastProvider } from '@/components/ui/ToastProvider';
import TopNav from '@/components/Sidebar';
import { useAuth } from '@/lib/context/AuthContext';
import { usePathname } from 'next/navigation';

function AppShell({ children }: { children: ReactNode }) {
  const { crmUser } = useAuth();
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <>
      {crmUser && !isLogin && <TopNav />}
      <div className="flex-1 overflow-hidden pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0">
        <AuthGuard>{children}</AuthGuard>
      </div>
    </>
  );
}

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
