"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Building2, LogOut, Sun, Moon,
  Sparkles, Target, FolderKanban, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useTheme } from '@/lib/context/ThemeContext';
import { can, Capability, ROLE_LABELS } from '@/lib/utils/permissions';

interface NavItem {
  label: string;
  href: string;
  icon: typeof Sparkles;
  /** Capability required to see this nav entry. If omitted, visible to all authed users. */
  requires?: Capability;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Sparkles, requires: 'view_dashboard' },
  { label: 'Leads', href: '/', icon: Target, requires: 'view_all_leads' },
  { label: 'Projects', href: '/projects', icon: FolderKanban, requires: 'view_projects' },
  { label: 'Admin Console', href: '/admin', icon: ShieldCheck, requires: 'view_admin_console' },
];

interface Branding {
  companyName: string;
  tagline: string;
  logo: string | null;
  banner: string | null;
  primaryColor: string;
}

export default function TopNav() {
  const pathname = usePathname();
  const { crmUser, logout } = useAuth();
  const { activeColor, setColor } = useTheme();
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'branding'));
        if (snap.exists()) {
          const d = snap.data();
          setBranding({
            companyName: d.companyName || '',
            tagline: d.tagline || '',
            logo: d.logo || null,
            banner: d.banner || null,
            primaryColor: d.primaryColor || '#2563eb',
          });
        }
      } catch (err) {
        console.error('Failed to load branding:', err);
      }
    };
    loadBranding();
  }, []);

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.requires) return true;
    // Leads tab: channel partners still need access even though they see "own only".
    if (item.requires === 'view_all_leads') {
      return can(crmUser?.role, 'view_all_leads') || can(crmUser?.role, 'view_own_leads_only');
    }
    return can(crmUser?.role, item.requires);
  });

  const companyName = branding?.companyName || 'ELITE BUILD';

  return (
    <>
      <header className="sticky top-0 z-40 flex-shrink-0 border-b border-mn-border/40 bg-mn-sidebar-bg/95 backdrop-blur-2xl">
        <div className="flex h-[4.4rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link href="/" className="mr-0 flex min-w-0 items-center gap-3 md:mr-8">
            {branding?.logo ? (
              <img
                src={branding.logo}
                alt={companyName}
                className="h-10 w-10 flex-shrink-0 rounded-2xl object-cover shadow-lg"
              />
            ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mn-h2 to-mn-accent shadow-[0_10px_24px_rgba(36,93,81,0.2)]">
                <Building2 className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-black tracking-[0.02em] text-mn-h1 sm:text-[0.98rem]">{companyName.toUpperCase()}</span>
                <span className="rounded-full border border-mn-border/60 bg-mn-card/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-mn-text-muted">CRM</span>
              </div>
              <p className="hidden truncate text-[11px] font-medium text-mn-text-muted sm:block">
                AI-powered real estate command center
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-1 rounded-full border border-mn-border/50 bg-mn-card/70 p-1.5 shadow-sm backdrop-blur-xl md:flex">
            {visibleItems.map(item => {
              const Icon = item.icon;
              const active = item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-black tracking-tight transition-all ${
                    active
                      ? 'bg-mn-card-hover text-mn-h1 shadow-[0_10px_24px_rgba(0,0,0,0.12)]'
                      : 'text-mn-text-muted hover:bg-mn-card-hover/80 hover:text-mn-text'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />
          {/* Light / Dark toggle */}
          <button
            onClick={() => setColor(activeColor === 'light' ? 'dark' : 'light')}
            className="mr-1 flex h-10 items-center gap-2 rounded-full border border-mn-border/50 bg-mn-card/70 px-3 text-mn-text shadow-sm transition-all hover:-translate-y-0.5 hover:border-mn-input-focus/40 hover:shadow-md sm:mr-3"
            title={activeColor === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {activeColor === 'light' ? (
              <>
                <Moon className="h-4 w-4 text-mn-info" />
                <span className="hidden text-xs font-bold sm:inline">Dark</span>
              </>
            ) : (
              <>
                <Sun className="h-4 w-4 text-mn-warning" />
                <span className="hidden text-xs font-bold sm:inline">Light</span>
              </>
            )}
          </button>

          {crmUser && (
            <div className="ml-1 flex items-center gap-2 sm:gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-bold text-mn-text">{crmUser.name}</p>
                <p className="text-[10px] text-mn-text-muted">{ROLE_LABELS[crmUser.role] || crmUser.role}</p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-mn-border/50 bg-mn-card/70 shadow-sm">
                {crmUser.photo_url ? (
                  <img src={crmUser.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="text-mn-h2 font-black text-xs">{(crmUser.name || '?')[0].toUpperCase()}</span>
                )}
              </div>
              <button
                onClick={logout}
                className="rounded-full p-2 text-mn-text-muted transition-all hover:bg-mn-danger/10 hover:text-mn-danger"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>
      <nav
        className="safe-bottom fixed inset-x-3 bottom-0 z-50 rounded-[2rem] border border-mn-border/70 bg-mn-card/95 p-2 shadow-[0_18px_60px_rgba(18,39,33,0.18)] backdrop-blur-2xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}>
          {visibleItems.map(item => {
            const Icon = item.icon;
            const active = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-3xl px-2 text-[10px] font-black transition-all ${
                  active
                    ? 'bg-mn-h2 text-white shadow-lg shadow-mn-h2/20'
                    : 'text-mn-text-muted hover:bg-mn-card-hover hover:text-mn-text'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label.replace(' Console', '')}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
