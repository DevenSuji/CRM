import { describe, expect, it } from 'vitest';
import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import { chooseLeadAssignee, eligibleAssignees } from '@/lib/utils/leadAssignment';

function user(uid: string, name: string, active = true): CRMUser {
  return {
    uid,
    name,
    email: `${uid}@test.local`,
    role: 'sales_exec',
    active,
    created_at: null,
  };
}

function lead(id: string, assigned_to: string | null, status = 'New'): Lead {
  return {
    id,
    status,
    assigned_to,
    created_at: null,
    source: 'Walk-in',
    raw_data: {
      lead_name: id,
      phone: 'N/A',
      email: 'N/A',
      budget: 0,
      plan_to_buy: 'Not Specified',
      profession: 'Not Specified',
      location: 'Unknown',
      note: '',
      pref_facings: [],
      interest: 'General Query',
    },
  };
}

describe('eligibleAssignees', () => {
  it('uses active sales executives by default', () => {
    expect(eligibleAssignees([
      user('a', 'Alice'),
      { ...user('admin', 'Admin'), role: 'admin' },
      user('inactive', 'Inactive', false),
    ], {
      enabled: true,
      strategy: 'workload',
      eligible_roles: ['sales_exec'],
      eligible_user_uids: [],
      source_rules: [],
    }).map(item => item.uid)).toEqual(['a']);
  });

  it('honors explicit eligible users', () => {
    expect(eligibleAssignees([
      user('b', 'Bob'),
      user('a', 'Alice'),
    ], {
      enabled: true,
      strategy: 'workload',
      eligible_roles: ['sales_exec'],
      eligible_user_uids: ['b'],
      source_rules: [],
    }).map(item => item.uid)).toEqual(['b']);
  });
});

describe('chooseLeadAssignee', () => {
  it('chooses lowest open workload', () => {
    const result = chooseLeadAssignee(
      { source: 'Walk-in' },
      [user('a', 'Alice'), user('b', 'Bob')],
      [lead('l1', 'a'), lead('l2', 'a'), lead('closed', 'b', 'Closed')],
      { enabled: true, strategy: 'workload', eligible_roles: ['sales_exec'], eligible_user_uids: [], source_rules: [] },
    );

    expect(result.assigneeUid).toBe('b');
    expect(result.reason).toMatch(/workload/i);
  });

  it('advances round-robin cursor', () => {
    const result = chooseLeadAssignee(
      { source: 'Walk-in' },
      [user('a', 'Alice'), user('b', 'Bob')],
      [],
      { enabled: true, strategy: 'round_robin', eligible_roles: ['sales_exec'], eligible_user_uids: [], source_rules: [], round_robin_cursor: 1 },
    );

    expect(result.assigneeUid).toBe('b');
    expect(result.nextCursor).toBe(0);
  });

  it('uses matching source rule before fallback', () => {
    const result = chooseLeadAssignee(
      { source: 'Meta Ads' },
      [user('a', 'Alice'), user('b', 'Bob')],
      [lead('l1', 'b')],
      {
        enabled: true,
        strategy: 'workload',
        eligible_roles: ['sales_exec'],
        eligible_user_uids: [],
        source_rules: [{
          id: 'meta',
          label: 'Meta',
          source_contains: 'meta',
          assignee_uids: ['b'],
          active: true,
        }],
      },
    );

    expect(result.assigneeUid).toBe('b');
    expect(result.reason).toMatch(/source rule/i);
  });

  it('returns unassigned when disabled', () => {
    expect(chooseLeadAssignee(
      { source: 'Walk-in' },
      [user('a', 'Alice')],
      [],
      { enabled: false },
    ).assigneeUid).toBeNull();
  });
});
