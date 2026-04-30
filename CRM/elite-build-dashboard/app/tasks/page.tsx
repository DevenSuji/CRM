"use client";
import { useMemo } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { ListChecks, Shield } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useFirestoreCollectionKeyed } from '@/lib/hooks/useFirestoreCollection';
import { useFirestoreDoc } from '@/lib/hooks/useFirestoreDoc';
import { can } from '@/lib/utils/permissions';
import { filterTaskQueueLeads } from '@/lib/utils/taskVisibility';
import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import type { InventoryUnit } from '@/lib/types/inventory';
import { DEFAULT_NURTURE_CONFIG, DEFAULT_SLA_CONFIG, NurtureConfig, SLAConfig } from '@/lib/types/config';
import { PageHeader } from '@/components/ui/PageHeader';
import { LeadTasksPanel } from '@/components/dashboard/LeadTasksPanel';

export default function TasksPage() {
  const { crmUser } = useAuth();
  const canViewTasks = can(crmUser?.role, 'view_tasks');
  const isAdmin = crmUser?.role === 'admin';
  const isSalesExec = crmUser?.role === 'sales_exec';
  const isChannelPartner = crmUser?.role === 'channel_partner';
  const currentUserUid = crmUser?.uid ?? '';
  const canReadInternalOpsData = canViewTasks && crmUser?.role !== 'channel_partner';

  const leadsKey = !crmUser || !canViewTasks
    ? null
    : isSalesExec
      ? `tasks:assigned:${currentUserUid}`
      : isChannelPartner
        ? `tasks:owner:${currentUserUid}`
        : 'tasks:all';
  const leadConstraints = useMemo(() => {
    if (isSalesExec && currentUserUid) {
      return [where('assigned_to', '==', currentUserUid)];
    }
    if (isChannelPartner && currentUserUid) {
      return [where('owner_uid', '==', currentUserUid), orderBy('created_at', 'desc')];
    }
    return [orderBy('created_at', 'desc')];
  }, [isChannelPartner, isSalesExec, currentUserUid]);

  const { data: leads, loading: leadsLoading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    leadsKey,
    leadConstraints,
  );
  const activeLeads = useMemo(
    () => leads.filter(lead => !lead.archived_at && !lead.archived_at_iso),
    [leads],
  );

  const canReadTeam = crmUser?.role === 'admin' || crmUser?.role === 'superadmin';
  const { data: teamUsers, loading: teamUsersLoading } = useFirestoreCollectionKeyed<CRMUser & { id: string }>(
    'users',
    canReadTeam && canReadInternalOpsData ? 'users' : null,
    [],
  );
  const { data: inventory } = useFirestoreCollectionKeyed<InventoryUnit>(
    'inventory',
    canReadInternalOpsData ? 'inventory' : null,
    [],
  );
  const { data: slaConfigDoc } = useFirestoreDoc<SLAConfig & { id: string }>('crm_config', canViewTasks ? 'sla' : '');
  const { data: nurtureConfigDoc } = useFirestoreDoc<NurtureConfig & { id: string }>('crm_config', canReadInternalOpsData ? 'nurture' : '');

  const users = useMemo(() => {
    const self = crmUser ? [{ ...crmUser, id: crmUser.uid }] : [];
    const known = new Map<string, CRMUser & { id?: string }>();
    for (const user of [...teamUsers, ...self]) {
      known.set(user.uid, user);
    }
    return Array.from(known.values());
  }, [teamUsers, crmUser]);
  const taskLeads = useMemo(
    () => filterTaskQueueLeads(activeLeads, crmUser, users),
    [activeLeads, crmUser, users],
  );
  const nurtureConfig = canReadInternalOpsData
    ? { ...DEFAULT_NURTURE_CONFIG, ...(nurtureConfigDoc || {}) }
    : undefined;
  const loadingTasks = leadsLoading || (isAdmin && teamUsersLoading);

  if (!canViewTasks) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Shield className="mb-4 h-16 w-16 text-mn-border" />
        <p className="text-lg font-bold text-mn-text-muted">Overdue Tasks Restricted</p>
        <p className="mt-1 text-sm text-mn-text-muted/70">Your role does not have access to task queues.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="Tasks & Briefing" subtitle="Today&apos;s operational follow-ups" />

      {loadingTasks ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <ListChecks className="mx-auto mb-3 h-12 w-12 animate-pulse text-mn-border" />
            <p className="font-medium text-mn-text-muted">Loading tasks...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-6 pb-12 sm:px-8">
          <LeadTasksPanel
            leads={taskLeads}
            users={users}
            inventory={inventory}
            currentUserUid={crmUser?.uid}
            currentUserName={crmUser?.name || 'System'}
            slaConfig={{ ...DEFAULT_SLA_CONFIG, ...(slaConfigDoc || {}) }}
            nurtureConfig={nurtureConfig}
          />
        </div>
      )}
    </div>
  );
}
