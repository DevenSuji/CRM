import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import { normalizeLeadSource } from '@/lib/utils/leadSourceHygiene';

export function isChannelPartnerLead(lead: Pick<Lead, 'source' | 'source_normalized'>): boolean {
  return [lead.source, lead.source_normalized].some(source => normalizeLeadSource(source) === 'Channel Partner');
}

export function isLeadUnassigned(lead: Pick<Lead, 'assigned_to'>): boolean {
  return !lead.assigned_to;
}

export function filterLeadPageLeads(
  leads: Lead[],
  currentUser: CRMUser | null | undefined,
): Lead[] {
  if (!currentUser) return [];

  if (currentUser.role === 'sales_exec') {
    return leads.filter(lead =>
      lead.assigned_to === currentUser.uid
      || (isLeadUnassigned(lead) && !isChannelPartnerLead(lead))
    );
  }

  if (currentUser.role === 'channel_partner') {
    return leads.filter(lead => lead.owner_uid === currentUser.uid);
  }

  return leads;
}
