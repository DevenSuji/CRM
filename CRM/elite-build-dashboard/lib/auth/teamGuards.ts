/**
 * Pure guard predicates for the admin Team tab.
 *
 * These encode the UX-level guardrails that keep an admin from locking
 * themselves out or bypassing the superadmin-only capability gate.
 *
 * IMPORTANT: these are *UI* guards — they sit in front of Firestore writes
 * but the Firestore rules today do not fully enforce all of them (notably,
 * the rules currently allow a user to self-promote via their own doc — see
 * docs/TechDebtAndSecurityPosture.md §5.6). Until the rules are hardened,
 * these predicates are the effective security boundary for role changes
 * made through the admin UI. That makes unit tests on them load-bearing.
 */
import { CRMUser, UserRole } from '@/lib/types/user';
import { can } from '@/lib/utils/permissions';

export interface GuardResult {
  allowed: boolean;
  /** User-facing reason when allowed=false. Present only on denial. */
  reason?: string;
}

const ALLOWED: GuardResult = { allowed: true };

/** A caller is a "super admin authority" iff they can promote others to superadmin. */
function canActAsSuperAdmin(actor: CRMUser | null | undefined): boolean {
  return can(actor?.role, 'promote_to_superadmin');
}

export function canChangeRole(
  actor: CRMUser | null | undefined,
  target: CRMUser,
  newRole: UserRole,
): GuardResult {
  if (!actor) return { allowed: false, reason: 'Not signed in.' };
  if (!can(actor.role, 'manage_users')) {
    return { allowed: false, reason: 'Only a Super Admin can manage users.' };
  }
  if (actor.uid === target.uid) {
    return { allowed: false, reason: 'You cannot change your own role.' };
  }
  const touchesSuperAdmin = newRole === 'superadmin' || target.role === 'superadmin';
  if (touchesSuperAdmin && !canActAsSuperAdmin(actor)) {
    return { allowed: false, reason: 'Only a Super Admin can change Super Admin roles.' };
  }
  return ALLOWED;
}

export function canToggleActive(
  actor: CRMUser | null | undefined,
  target: CRMUser,
): GuardResult {
  if (!actor) return { allowed: false, reason: 'Not signed in.' };
  if (!can(actor.role, 'manage_users')) {
    return { allowed: false, reason: 'Only a Super Admin can manage users.' };
  }
  if (actor.uid === target.uid) {
    // Covers both activate and deactivate self — UI only exposes the latter,
    // but a buggy re-render that flipped active locally would still be blocked.
    return { allowed: false, reason: 'You cannot change your own active status.' };
  }
  return ALLOWED;
}

export function canRemoveMember(
  actor: CRMUser | null | undefined,
  target: CRMUser,
): GuardResult {
  if (!actor) return { allowed: false, reason: 'Not signed in.' };
  if (!can(actor.role, 'manage_users')) {
    return { allowed: false, reason: 'Only a Super Admin can manage users.' };
  }
  if (actor.uid === target.uid) {
    return { allowed: false, reason: 'You cannot remove yourself.' };
  }
  if (target.role === 'superadmin' && !canActAsSuperAdmin(actor)) {
    return { allowed: false, reason: 'Only a Super Admin can remove a Super Admin.' };
  }
  return ALLOWED;
}

/**
 * Filters the role options the UI should show as assignable based on the
 * actor's privilege level. Non-superadmins never see a superadmin option.
 */
export function assignableRoles<T extends { value: UserRole; superadminOnly?: boolean }>(
  actor: CRMUser | null | undefined,
  roleOptions: readonly T[],
): T[] {
  const canPromote = canActAsSuperAdmin(actor);
  return roleOptions.filter(r => !r.superadminOnly || canPromote);
}

/**
 * Sort rank for a team member — lower = higher on the list.
 * Used to group team by privilege tier in the admin UI.
 */
export function rankTeamMemberRole(role: UserRole): number {
  const order: UserRole[] = [
    'superadmin', 'admin', 'sales_exec', 'digital_marketing',
    'channel_partner', 'hr', 'payroll_finance', 'viewer',
  ];
  const idx = order.indexOf(role);
  return idx === -1 ? 99 : idx;
}

/** Sort comparator: rank asc, then name asc. Pure and stable. */
export function compareTeamMembers(a: CRMUser, b: CRMUser): number {
  const dr = rankTeamMemberRole(a.role) - rankTeamMemberRole(b.role);
  if (dr !== 0) return dr;
  return (a.name || '').localeCompare(b.name || '');
}
