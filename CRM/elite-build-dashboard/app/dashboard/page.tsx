"use client";
import { useMemo, useState } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { LayoutDashboard, Megaphone, Users } from 'lucide-react';
import { useFirestoreCollectionKeyed } from '@/lib/hooks/useFirestoreCollection';
import { useAuth } from '@/lib/context/AuthContext';
import { Lead } from '@/lib/types/lead';
import { CRMUser } from '@/lib/types/user';
import { MarketingTeam } from '@/lib/types/config';
import { InventoryUnit } from '@/lib/types/inventory';
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
  const activeLeads = useMemo(
    () => myLeads.filter(lead => !lead.archived_at && !lead.archived_at_iso),
    [myLeads],
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
        <div className="flex-1 overflow-y-auto px-4 py-6 pb-12 sm:px-8">
          <ChannelPartnerDashboard leads={activeLeads} />
        </div>
      )}
    </div>
  );
}

/* ==================== Internal / Marketing team view ==================== */
function TeamView({ currentUid }: { currentUid?: string }) {
  const { crmUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('internal');
  const crmUserUid = crmUser?.uid;
  const isLeadership = crmUser?.role === 'admin' || crmUser?.role === 'superadmin';
  const isSalesExecutive = crmUser?.role === 'sales_exec';
  const resolvedActiveTab: Tab = isLeadership ? activeTab : 'internal';

  const leadConstraints = useMemo(
    () => isSalesExecutive && crmUserUid
      ? [where('assigned_to', '==', crmUserUid)]
      : [orderBy('created_at', 'desc')],
    [isSalesExecutive, crmUserUid],
  );
  const leadsSubscriptionKey = isSalesExecutive
    ? (crmUserUid ? `assigned:${crmUserUid}` : null)
    : 'all';

  const { data: allLeads, loading: leadsLoading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    leadsSubscriptionKey,
    leadConstraints,
  );
  const { data: leadershipUsers } = useFirestoreCollectionKeyed<CRMUser & { id: string }>(
    'users',
    isLeadership ? 'dashboard-team-users' : null,
    [],
  );
  const { data: marketingTeams } = useFirestoreCollectionKeyed<MarketingTeam & { id: string }>(
    'marketing_teams',
    isLeadership ? 'dashboard-marketing-teams' : null,
    [],
  );
  const { data: inventory } = useFirestoreCollectionKeyed<InventoryUnit>(
    'inventory',
    isLeadership ? 'dashboard-inventory' : null,
    [],
  );

  const ownLeadsOnly = can(crmUser?.role, 'view_own_leads_only') && !can(crmUser?.role, 'view_all_leads');
  const leads = useMemo(() => {
    const activeLeads = allLeads.filter(lead => !lead.archived_at && !lead.archived_at_iso);
    if (!ownLeadsOnly || !crmUser?.uid) return activeLeads;
    return activeLeads.filter(l => l.owner_uid === crmUser.uid);
  }, [allLeads, ownLeadsOnly, crmUser]);
  const dashboardUsers = useMemo(
    () => isLeadership
      ? leadershipUsers
      : crmUser
        ? [{ ...crmUser, id: crmUser.uid }]
        : [],
    [isLeadership, leadershipUsers, crmUser],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Dashboard"
        subtitle={
          (crmUser?.role === 'admin' || crmUser?.role === 'superadmin') ? 'Leadership Overview'
          : 'My Pipeline'
        }
      />

      {isLeadership && (
        <div className="px-4 pt-4 sm:px-8">
          <div className="mn-segmented flex gap-1 overflow-x-auto px-2 py-2">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = resolvedActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all ${
                    active
                      ? 'mn-segmented-active'
                      : 'mn-segmented-idle'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      {leadsLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <LayoutDashboard className="w-12 h-12 text-mn-border mx-auto mb-3 animate-pulse" />
            <p className="text-mn-text-muted font-medium">Loading dashboard...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-6 pb-12 sm:px-8">
          {isLeadership && resolvedActiveTab === 'marketing' && (
            <MarketingDashboard leads={leads} marketingTeams={marketingTeams} />
          )}
          {resolvedActiveTab === 'internal' && (
            <InternalDashboard
              leads={leads}
              users={dashboardUsers}
              inventory={inventory}
              marketingTeams={marketingTeams}
              currentUid={currentUid}
              scopeUid={isSalesExecutive ? currentUid : undefined}
              allowUserScopeSelection={isLeadership}
              showTeamInsights={isLeadership}
              showRoi={isLeadership}
              showDemandGap={isLeadership}
            />
          )}
        </div>
      )}
    </div>
  );
}
