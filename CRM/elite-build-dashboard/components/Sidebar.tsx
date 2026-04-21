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
    <header className="bg-mn-surface border-b border-mn-border/40 flex-shrink-0">
      <div className="flex items-center h-14 px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 mr-10">
          {branding?.logo ? (
            <img
              src={branding.logo}
              alt={companyName}
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0 shadow-lg"
            />
          ) : (
            <div className="w-8 h-8 bg-mn-h2 rounded-lg flex items-center justify-center shadow-lg shadow-mn-h2/20 flex-shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-black text-mn-h2 tracking-wide">{companyName.toUpperCase()}</span>
            <span className="text-xs font-bold text-mn-text-muted">CRM</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {visibleItems.map(item => {
            const Icon = item.icon;
            const active = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[15px] font-black tracking-wide transition-all ${
                  active
                    ? 'bg-mn-h2/15 text-mn-h2 shadow-sm shadow-mn-h2/10'
                    : 'text-mn-text-muted hover:text-mn-text hover:bg-mn-card/60'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Light / Dark toggle */}
        <button
          onClick={() => setColor(activeColor === 'light' ? 'dark' : 'light')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-mn-card border border-mn-border/40 hover:border-mn-border transition-all mr-3"
          title={activeColor === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {activeColor === 'light' ? (
            <>
              <Sun className="w-4 h-4 text-mn-warning" />
              <span className="text-xs font-bold text-mn-text">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-mn-info" />
              <span className="text-xs font-bold text-mn-text">Dark</span>
            </>
          )}
        </button>

        {crmUser && (
          <div className="flex items-center gap-3 ml-2">
            <div className="text-right">
              <p className="text-xs font-bold text-mn-text">{crmUser.name}</p>
              <p className="text-[10px] text-mn-text-muted">{ROLE_LABELS[crmUser.role] || crmUser.role}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-mn-h2/15 flex items-center justify-center flex-shrink-0">
              {crmUser.photo_url ? (
                <img src={crmUser.photo_url} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <span className="text-mn-h2 font-black text-xs">{(crmUser.name || '?')[0].toUpperCase()}</span>
              )}
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg text-mn-text-muted hover:text-mn-danger hover:bg-mn-danger/10 transition-all"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
