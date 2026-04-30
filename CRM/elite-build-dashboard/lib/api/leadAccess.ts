import 'server-only';

import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import { isChannelPartnerLead } from '@/lib/utils/leadVisibility';

export function canReadLeadForRole(user: CRMUser, lead: Lead): boolean {
  if (user.role === 'superadmin' || user.role === 'admin' || user.role === 'viewer') {
    return true;
  }

  if (user.role === 'sales_exec') {
    return lead.assigned_to === user.uid || (!lead.assigned_to && !isChannelPartnerLead(lead));
  }

  if (user.role === 'channel_partner') {
    return lead.owner_uid === user.uid;
  }

  return false;
}

export function canMutateLeadForRole(user: CRMUser, lead: Lead): boolean {
  if (user.role === 'superadmin' || user.role === 'admin') {
    return true;
  }

  if (user.role === 'sales_exec') {
    return lead.assigned_to === user.uid || (!lead.assigned_to && !isChannelPartnerLead(lead));
  }

  if (user.role === 'channel_partner') {
    return lead.owner_uid === user.uid;
  }

  return false;
}
