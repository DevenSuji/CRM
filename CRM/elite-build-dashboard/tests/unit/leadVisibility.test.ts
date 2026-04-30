import { describe, expect, it } from 'vitest';
import type { Lead } from '@/lib/types/lead';
import type { CRMUser, UserRole } from '@/lib/types/user';
import { filterLeadPageLeads, isChannelPartnerLead } from '@/lib/utils/leadVisibility';

function user(uid: string, role: UserRole): CRMUser {
  return {
    uid,
    email: `${uid}@example.com`,
    name: uid,
    role,
    active: true,
    created_at: null,
  };
}

function lead(id: string, patch: Partial<Lead> = {}): Lead {
  return {
    id,
    status: 'New',
    created_at: null,
    source: 'Walk-in',
    owner_uid: 'owner1',
    assigned_to: null,
    raw_data: {
      lead_name: id,
      phone: '+919999999999',
      email: '',
      budget: 0,
      plan_to_buy: '',
      profession: '',
      location: '',
      note: '',
      pref_facings: [],
      interest: '',
      interests: [],
    },
    ...patch,
  } as Lead;
}

describe('isChannelPartnerLead', () => {
  it('detects channel partner source labels and normalized labels', () => {
    expect(isChannelPartnerLead(lead('manual-cp', { source: 'Channel Partner' }))).toBe(true);
    expect(isChannelPartnerLead(lead('csv-cp', { source: 'Channel Partner CSV' }))).toBe(true);
    expect(isChannelPartnerLead(lead('normalized-cp', { source: 'Unknown', source_normalized: 'Channel Partner' }))).toBe(true);
    expect(isChannelPartnerLead(lead('walk-in', { source: 'Walk-in' }))).toBe(false);
  });
});

describe('filterLeadPageLeads', () => {
  const leads = [
    lead('assigned-to-current-sales', { assigned_to: 'sales1', owner_uid: 'admin1' }),
    lead('unassigned-admin-created', { assigned_to: null, owner_uid: 'admin1' }),
    lead('unassigned-sales-created', { assigned_to: null, owner_uid: 'sales2' }),
    lead('assigned-to-superadmin', { assigned_to: 'superadmin1', owner_uid: 'admin1' }),
    lead('assigned-to-admin', { assigned_to: 'admin1', owner_uid: 'admin1' }),
    lead('assigned-to-other-sales', { assigned_to: 'sales2', owner_uid: 'admin1' }),
    lead('unassigned-channel-partner', { assigned_to: null, owner_uid: 'cp1', source: 'Channel Partner' }),
    lead('channel-partner-owned', { assigned_to: 'cp1', owner_uid: 'cp1', source: 'Channel Partner' }),
  ];

  it('scopes sales exec to assigned self plus unassigned non-channel-partner leads', () => {
    expect(filterLeadPageLeads(leads, user('sales1', 'sales_exec')).map(item => item.id)).toEqual([
      'assigned-to-current-sales',
      'unassigned-admin-created',
      'unassigned-sales-created',
    ]);
  });

  it('removes a previously unassigned lead as soon as it is assigned away from the sales exec', () => {
    const reassigned = lead('manoj-hegde', { assigned_to: 'superadmin1', owner_uid: 'admin1' });

    expect(filterLeadPageLeads([reassigned], user('sales1', 'sales_exec'))).toEqual([]);
  });

  it('scopes channel partner to own leads only', () => {
    expect(filterLeadPageLeads(leads, user('cp1', 'channel_partner')).map(item => item.id)).toEqual([
      'unassigned-channel-partner',
      'channel-partner-owned',
    ]);
  });

  it.each(['superadmin', 'admin', 'viewer'] as UserRole[])(
    'does not narrow %s lead visibility',
    (role) => {
      expect(filterLeadPageLeads(leads, user(role, role))).toHaveLength(leads.length);
    },
  );
});
