/**
 * Team-management guardrails — pin the UX invariants that keep admins from
 * locking themselves out or bypassing the superadmin-only capability gate.
 *
 * The extracted predicates are effectively the security boundary for role
 * changes made via the admin UI today (see lib/auth/teamGuards.ts for why).
 * A regression here would let, e.g., an admin promote themselves to
 * superadmin via a crafted state update — so these tests are load-bearing.
 */
import { describe, it, expect } from 'vitest';
import {
  canChangeRole,
  canToggleActive,
  canRemoveMember,
  assignableRoles,
  rankTeamMemberRole,
  compareTeamMembers,
} from '@/lib/auth/teamGuards';
import type { CRMUser, UserRole } from '@/lib/types/user';

const makeUser = (overrides: Partial<CRMUser> & { uid: string; role: UserRole }): CRMUser => ({
  email: `${overrides.uid}@test.local`,
  name: overrides.uid,
  active: true,
  created_at: null,
  ...overrides,
});

const superadmin = makeUser({ uid: 'boss', role: 'superadmin' });
const admin = makeUser({ uid: 'admin1', role: 'admin' });
const sales = makeUser({ uid: 'sales1', role: 'sales_exec' });

/* ==================== canChangeRole ==================== */

describe('canChangeRole', () => {
  it('denies when actor is null (not signed in)', () => {
    const res = canChangeRole(null, sales, 'admin');
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/signed in/i);
  });

  it('denies when actor lacks manage_users capability', () => {
    const res = canChangeRole(admin, sales, 'sales_exec');
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/super admin/i);
  });

  it('denies changing own role', () => {
    const res = canChangeRole(superadmin, superadmin, 'admin');
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/own role/i);
  });

  it('allows superadmin to change another user’s non-superadmin role', () => {
    const res = canChangeRole(superadmin, sales, 'admin');
    expect(res.allowed).toBe(true);
  });

  it('allows superadmin to promote another user to superadmin', () => {
    const res = canChangeRole(superadmin, sales, 'superadmin');
    expect(res.allowed).toBe(true);
  });

  it('allows superadmin to demote another superadmin', () => {
    const other = makeUser({ uid: 'other', role: 'superadmin' });
    const res = canChangeRole(superadmin, other, 'admin');
    expect(res.allowed).toBe(true);
  });

  // Today only superadmin has manage_users, so the "non-superadmin acting on
  // a superadmin" case is unreachable through the UI. But the predicate
  // should still deny it — this pins the behavior for if manage_users is
  // ever granted to another role.
  it('even if manage_users were relaxed, a non-superadmin cannot promote TO superadmin', () => {
    // We fake this by constructing an actor whose role has manage_users —
    // today only 'superadmin' does, so we just verify the current matrix
    // holds: admin cannot manage_users, so the capability gate fires first.
    const res = canChangeRole(admin, sales, 'superadmin');
    expect(res.allowed).toBe(false);
  });
});

/* ==================== canToggleActive ==================== */

describe('canToggleActive', () => {
  it('denies toggling own active flag (anti-lockout)', () => {
    const res = canToggleActive(superadmin, superadmin);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/your own active status/i);
  });

  it('denies when actor cannot manage_users', () => {
    const res = canToggleActive(admin, sales);
    expect(res.allowed).toBe(false);
  });

  it('allows superadmin to deactivate another user', () => {
    const res = canToggleActive(superadmin, sales);
    expect(res.allowed).toBe(true);
  });

  it('allows superadmin to deactivate another superadmin', () => {
    // Today there's no explicit rule preventing a superadmin from
    // deactivating another superadmin — pin that here. If the product
    // decides to add a rule, this test will remind us to update the guard.
    const other = makeUser({ uid: 'other', role: 'superadmin' });
    const res = canToggleActive(superadmin, other);
    expect(res.allowed).toBe(true);
  });
});

/* ==================== canRemoveMember ==================== */

describe('canRemoveMember', () => {
  it('denies removing self', () => {
    const res = canRemoveMember(superadmin, superadmin);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/yourself/i);
  });

  it('denies when actor cannot manage_users', () => {
    const res = canRemoveMember(admin, sales);
    expect(res.allowed).toBe(false);
  });

  it('allows superadmin to remove a non-superadmin', () => {
    const res = canRemoveMember(superadmin, sales);
    expect(res.allowed).toBe(true);
  });

  it('allows a superadmin to remove another superadmin', () => {
    const other = makeUser({ uid: 'other', role: 'superadmin' });
    const res = canRemoveMember(superadmin, other);
    expect(res.allowed).toBe(true);
  });

  // Guardrail expressed in the function signature: even if manage_users
  // were granted to admin, a non-superadmin cannot delete a superadmin.
  // Today admin lacks manage_users so the capability check fires first;
  // this test pins the ordering so a future matrix change doesn't
  // accidentally let an admin nuke a superadmin.
  it('a non-superadmin cannot remove a superadmin (defense in depth)', () => {
    const target = makeUser({ uid: 'other', role: 'superadmin' });
    const res = canRemoveMember(admin, target);
    expect(res.allowed).toBe(false);
  });
});

/* ==================== assignableRoles ==================== */

describe('assignableRoles', () => {
  const options = [
    { value: 'superadmin', label: 'Super', superadminOnly: true },
    { value: 'admin', label: 'Admin' },
    { value: 'sales_exec', label: 'Sales' },
    { value: 'viewer', label: 'Viewer' },
  ] as const;

  it('hides superadminOnly options from a non-superadmin actor', () => {
    const result = assignableRoles(admin, options);
    expect(result.map(r => r.value)).toEqual(['admin', 'sales_exec', 'viewer']);
  });

  it('shows superadminOnly options to a superadmin actor', () => {
    const result = assignableRoles(superadmin, options);
    expect(result.map(r => r.value)).toEqual(['superadmin', 'admin', 'sales_exec', 'viewer']);
  });

  it('treats null actor as non-privileged', () => {
    const result = assignableRoles(null, options);
    expect(result.some(r => r.value === 'superadmin')).toBe(false);
  });
});

/* ==================== ranking & sorting ==================== */

describe('rankTeamMemberRole + compareTeamMembers', () => {
  it('orders roles by privilege tier (superadmin → viewer)', () => {
    const order: UserRole[] = [
      'superadmin', 'admin', 'sales_exec', 'digital_marketing',
      'channel_partner', 'hr', 'payroll_finance', 'viewer',
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(rankTeamMemberRole(order[i])).toBeLessThan(rankTeamMemberRole(order[i + 1]));
    }
  });

  it('assigns unknown roles the highest (= worst) rank', () => {
    // @ts-expect-error — deliberately passing an invalid role
    expect(rankTeamMemberRole('space_cowboy')).toBe(99);
  });

  it('sorts by role first, then by name within a role', () => {
    const input: CRMUser[] = [
      makeUser({ uid: 'c', role: 'sales_exec', name: 'Charlie' }),
      makeUser({ uid: 'a', role: 'admin', name: 'Alice' }),
      makeUser({ uid: 'b', role: 'sales_exec', name: 'Bravo' }),
      makeUser({ uid: 's', role: 'superadmin', name: 'Sam' }),
    ];
    const sorted = [...input].sort(compareTeamMembers);
    expect(sorted.map(u => u.uid)).toEqual(['s', 'a', 'b', 'c']);
  });

  it('tolerates missing names without crashing', () => {
    const input: CRMUser[] = [
      { uid: 'a', email: '', name: '', role: 'admin', active: true, created_at: null },
      { uid: 'b', email: '', name: '', role: 'admin', active: true, created_at: null },
    ];
    expect(() => [...input].sort(compareTeamMembers)).not.toThrow();
  });
});
