import { describe, expect, it } from 'vitest';
import type { Lead } from '@/lib/types/lead';
import type { CRMUser, UserRole } from '@/lib/types/user';
import { filterTaskQueueLeads } from '@/lib/utils/taskVisibility';

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
    owner_uid: 'owner',
    raw_data: {
      lead_name: id,
      phone: '+919999999999',
      email: '',
      budget: 0,
      location: '',
      interest: '',
      interests: [],
      plan_to_buy: '',
      profession: '',
      note: '',
      pref_facings: [],
    },
    ...patch,
  } as Lead;
}

const leads = [
  lead('sales-owned', { owner_uid: 'sales1', assigned_to: 'sales1' }),
  lead('sales-other', { owner_uid: 'sales2', assigned_to: 'sales2' }),
  lead('cp-owned', { owner_uid: 'cp1', assigned_to: 'cp1' }),
  lead('superadmin-task', { owner_uid: 'sa1', assigned_to: 'sa1' }),
  lead('unassigned', { owner_uid: 'admin1', assigned_to: null }),
];

describe('filterTaskQueueLeads', () => {
  it('allows superadmin to see every task lead', () => {
    expect(filterTaskQueueLeads(leads, user('sa1', 'superadmin')).map(item => item.id)).toEqual([
      'sales-owned',
      'sales-other',
      'cp-owned',
      'superadmin-task',
      'unassigned',
    ]);
  });

  it('allows admin to see all task leads except leads assigned to superadmins', () => {
    const result = filterTaskQueueLeads(leads, user('admin1', 'admin'), [
      user('sa1', 'superadmin'),
      user('sales1', 'sales_exec'),
      user('sales2', 'sales_exec'),
      user('cp1', 'channel_partner'),
    ]);

    expect(result.map(item => item.id)).toEqual([
      'sales-owned',
      'sales-other',
      'cp-owned',
      'unassigned',
    ]);
  });

  it('allows sales exec to see only assigned task leads', () => {
    expect(filterTaskQueueLeads(leads, user('sales1', 'sales_exec')).map(item => item.id)).toEqual([
      'sales-owned',
    ]);
  });

  it('allows channel partner to see only owned task leads', () => {
    expect(filterTaskQueueLeads(leads, user('cp1', 'channel_partner')).map(item => item.id)).toEqual([
      'cp-owned',
    ]);
  });

  it.each(['viewer', 'digital_marketing', 'hr', 'payroll_finance'] as UserRole[])(
    'denies task leads for %s',
    (role) => {
      expect(filterTaskQueueLeads(leads, user(role, role))).toEqual([]);
    },
  );
});
