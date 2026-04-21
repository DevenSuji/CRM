"use client";
import { useMemo, useState } from 'react';
import { orderBy } from 'firebase/firestore';
import { LayoutDashboard, Megaphone, Users } from 'lucide-react';
import { useFirestoreCollection, useFirestoreCollectionKeyed } from '@/lib/hooks/useFirestoreCollection';
import { where } from 'firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { Lead } from '@/lib/types/lead';
import { CRMUser } from '@/lib/types/user';
import { MarketingTeam } from '@/lib/types/config';
import { PageHeader } from '@/components/ui/PageHeader';
import { MarketingDashboard } from '@/components/dashboard/MarketingDashboard';
import { InternalDashboard } from '@/components/dashboard/InternalDashboard';
import { ChannelPartnerDashboard } from '@/components/dashboard/ChannelPartnerDashboard';
import { can } from '@/lib/utils/permissions';

type Tab = 'marketing' | 'internal';

const TABS: { id: Tab; label: string; icon: typeof Megaphone }[] = [
  { id: 'internal', label: 'Internal Team', icon: Users },
  { id: 'marketing', label: 'Marketing Team', icon: Megaphone },
];

export default function DashboardPage() {
  const { crmUser } = useAuth();
  const isChannelPartner = crmUser?.role === 'channel_partner';

  return isChannelPartner
    ? <ChannelPartnerView uid={crmUser!.uid} />
    : <TeamView currentUid={crmUser?.uid} />;
}

/* ==================== Channel Partner view ==================== */
/** CPs only see their own leads. We do NOT fetch /users or /marketing_teams
 *  because Firestore rules block those reads for non-admin roles. */
function ChannelPartnerView({ uid }: { uid: string }) {
  // CP subscription must filter by owner_uid at the query level — Firestore
  // rules deny a full-collection listener for channel partners.
  const constraints = useMemo(
    () => [where('owner_uid', '==', uid), orderBy('created_at', 'desc')],
    [uid],
  );
  const { data: myLeads, loading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    `own:${uid}`,
    constraints,
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader title="Dashboard" subtitle="My Pipeline" />
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <LayoutDashboard className="w-12 h-12 text-mn-border mx-auto mb-3 animate-pulse" />
            <p className="text-mn-text-muted font-medium">Loading dashboard...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6 pb-12">
          <ChannelPartnerDashboard leads={myLeads} />
        </div>
      )}
    </div>
  );
}

/* ==================== Internal / Marketing team view ==================== */
function TeamView({ currentUid }: { currentUid?: string }) {
  const { crmUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('internal');

  const { data: allLeads, loading: leadsLoading } = useFirestoreCollection<Lead>(
    'leads',
    orderBy('created_at', 'desc'),
  );
  const { data: users } = useFirestoreCollection<CRMUser & { id: string }>('users');
  const { data: marketingTeams } = useFirestoreCollection<MarketingTeam & { id: string }>('marketing_teams');

  const ownLeadsOnly = can(crmUser?.role, 'view_own_leads_only') && !can(crmUser?.role, 'view_all_leads');
  const leads = useMemo(() => {
    if (!ownLeadsOnly || !crmUser?.uid) return allLeads;
    return allLeads.filter(l => l.owner_uid === crmUser.uid);
  }, [allLeads, ownLeadsOnly, crmUser?.uid]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Dashboard"
        subtitle={
          (crmUser?.role === 'admin' || crmUser?.role === 'superadmin') ? 'Leadership Overview'
          : 'My Pipeline'
        }
      />

      {/* Tabs */}
      <div className="px-8 pt-4 flex gap-1 border-b border-mn-border/40">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition-all ${
                active
                  ? 'bg-mn-card border border-mn-border border-b-mn-card text-mn-h2 -mb-px'
                  : 'text-mn-text-muted hover:text-mn-text hover:bg-mn-card/40'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {leadsLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <LayoutDashboard className="w-12 h-12 text-mn-border mx-auto mb-3 animate-pulse" />
            <p className="text-mn-text-muted font-medium">Loading dashboard...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6 pb-12">
          {activeTab === 'marketing' && (
            <MarketingDashboard leads={leads} marketingTeams={marketingTeams} />
          )}
          {activeTab === 'internal' && (
            <InternalDashboard leads={leads} users={users} currentUid={currentUid} />
          )}
        </div>
      )}
    </div>
  );
}
