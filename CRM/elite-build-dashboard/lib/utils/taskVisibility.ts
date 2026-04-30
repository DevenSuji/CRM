import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';

export function filterTaskQueueLeads(
  leads: Lead[],
  currentUser: CRMUser | null | undefined,
  users: CRMUser[] = [],
): Lead[] {
  if (!currentUser) return [];

  if (currentUser.role === 'superadmin') {
    return leads;
  }

  if (currentUser.role === 'admin') {
    const superadminUids = new Set(
      users
        .filter(user => user.role === 'superadmin')
        .map(user => user.uid),
    );
    return leads.filter(lead => !lead.assigned_to || !superadminUids.has(lead.assigned_to));
  }

  if (currentUser.role === 'sales_exec') {
    return leads.filter(lead => lead.assigned_to === currentUser.uid);
  }

  if (currentUser.role === 'channel_partner') {
    return leads.filter(lead => lead.owner_uid === currentUser.uid);
  }

  return [];
}
