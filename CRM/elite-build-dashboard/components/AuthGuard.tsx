"use client";
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Building2 } from 'lucide-react';
import { can, PLACEHOLDER_ROLES, defaultLandingPath } from '@/lib/utils/permissions';

const PUBLIC_PATHS = ['/login'];

/** Route-level capability requirements. Missing route => any authed user. */
const ROUTE_CAPS: { match: (p: string) => boolean; capability: Parameters<typeof can>[1] }[] = [
  { match: (p) => p === '/dashboard' || p.startsWith('/dashboard/'), capability: 'view_dashboard' },
  { match: (p) => p.startsWith('/projects'), capability: 'view_projects' },
  { match: (p) => p.startsWith('/admin'), capability: 'view_admin_console' },
  // Leads lives at '/' — handled separately below because it has two possible caps.
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { crmUser, loading, accessDenied } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;

    if (!crmUser && !isPublic) {
      router.replace('/login');
      return;
    }
    if (accessDenied && !isPublic) {
      router.replace('/login');
      return;
    }

    if (crmUser && !isPublic) {
      // Placeholder roles (HR, Payroll & Finance) can only view /coming-soon.
      if (PLACEHOLDER_ROLES.includes(crmUser.role) && pathname !== '/coming-soon') {
        router.replace('/coming-soon');
        return;
      }
      // Non-placeholder roles hitting /coming-soon go to their landing path.
      if (pathname === '/coming-soon' && !PLACEHOLDER_ROLES.includes(crmUser.role)) {
        router.replace(defaultLandingPath(crmUser.role));
        return;
      }
      // Route-specific capability checks.
      const route = ROUTE_CAPS.find(r => r.match(pathname));
      if (route && !can(crmUser.role, route.capability)) {
        router.replace(defaultLandingPath(crmUser.role));
        return;
      }
      // Leads page (/) requires view_all_leads OR view_own_leads_only.
      if (pathname === '/' &&
          !can(crmUser.role, 'view_all_leads') &&
          !can(crmUser.role, 'view_own_leads_only')) {
        router.replace(defaultLandingPath(crmUser.role));
        return;
      }
    }
  }, [crmUser, loading, accessDenied, isPublic, pathname, router]);

  // Show loading spinner while auth resolves
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-10 h-10 bg-mn-h2 rounded-lg flex items-center justify-center shadow-lg shadow-mn-h2/20 mx-auto mb-3">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <p className="text-mn-text-muted text-sm font-medium animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // On public pages, always render
  if (isPublic) return <>{children}</>;

  // On protected pages, only render if user is authenticated
  if (!crmUser) return null;

  return <>{children}</>;
}
