import { describe, it, expect } from 'vitest';
import { can, ROLE_LABELS, PLACEHOLDER_ROLES, defaultLandingPath } from '@/lib/utils/permissions';
import type { UserRole } from '@/lib/types/user';
import type { Capability } from '@/lib/utils/permissions';

const ALL_ROLES: UserRole[] = [
  'superadmin',
  'admin',
  'sales_exec',
  'hr',
  'payroll_finance',
  'digital_marketing',
  'channel_partner',
  'viewer',
];

const ALL_CAPABILITIES: Capability[] = [
  'view_dashboard',
  'view_tasks',
  'view_all_leads',
  'view_own_leads_only',
  'create_lead',
  'bulk_upload_leads',
  'edit_lead',
  'delete_lead',
  'view_whatsapp_inbox',
  'view_projects',
  'edit_project_core',
  'tag_project_campaigns',
  'view_admin_console',
  'onboard_users',
  'manage_users',
  'promote_to_superadmin',
];

describe('can(role, capability) — permission matrix', () => {
  describe('null / undefined role', () => {
    it.each(ALL_CAPABILITIES)('denies %s when role is undefined', (cap) => {
      expect(can(undefined, cap)).toBe(false);
    });
    it.each(ALL_CAPABILITIES)('denies %s when role is null', (cap) => {
      expect(can(null, cap)).toBe(false);
    });
  });

  describe('superadmin', () => {
    const role: UserRole = 'superadmin';
    const granted: Capability[] = [
      'view_dashboard', 'view_tasks', 'view_all_leads', 'create_lead', 'bulk_upload_leads',
      'edit_lead', 'delete_lead', 'view_whatsapp_inbox', 'view_projects', 'edit_project_core',
      'tag_project_campaigns', 'view_admin_console', 'onboard_users', 'manage_users',
      'promote_to_superadmin',
    ];
    it.each(granted)('allows %s', (cap) => expect(can(role, cap)).toBe(true));

    it('is the only role with promote_to_superadmin', () => {
      for (const r of ALL_ROLES) {
        expect(can(r, 'promote_to_superadmin')).toBe(r === 'superadmin');
      }
    });
  });

  describe('admin', () => {
    const role: UserRole = 'admin';
    it('has full lead CRUD, project core edit, bulk upload, admin console', () => {
      expect(can(role, 'create_lead')).toBe(true);
      expect(can(role, 'edit_lead')).toBe(true);
      expect(can(role, 'delete_lead')).toBe(true);
      expect(can(role, 'view_whatsapp_inbox')).toBe(true);
      expect(can(role, 'edit_project_core')).toBe(true);
      expect(can(role, 'bulk_upload_leads')).toBe(true);
      expect(can(role, 'view_admin_console')).toBe(true);
    });
    it('can onboard users, but cannot manage_users or promote_to_superadmin', () => {
      expect(can(role, 'onboard_users')).toBe(true);
      expect(can(role, 'manage_users')).toBe(false);
      expect(can(role, 'promote_to_superadmin')).toBe(false);
    });
  });

  describe('sales_exec', () => {
    const role: UserRole = 'sales_exec';
    it('can access the scoped lead workspace, scoped WhatsApp inbox, and create/edit, but not delete or bulk upload', () => {
      expect(can(role, 'view_all_leads')).toBe(true);
      expect(can(role, 'create_lead')).toBe(true);
      expect(can(role, 'edit_lead')).toBe(true);
      expect(can(role, 'delete_lead')).toBe(false);
      expect(can(role, 'bulk_upload_leads')).toBe(false);
      expect(can(role, 'view_whatsapp_inbox')).toBe(true);
    });
    it('cannot access admin console', () => {
      expect(can(role, 'view_admin_console')).toBe(false);
      expect(can(role, 'manage_users')).toBe(false);
    });
  });

  describe('channel_partner', () => {
    const role: UserRole = 'channel_partner';
    it('sees only own leads — never all leads', () => {
      expect(can(role, 'view_own_leads_only')).toBe(true);
      expect(can(role, 'view_all_leads')).toBe(false);
    });
    it('can create + edit but cannot bulk upload or delete', () => {
      expect(can(role, 'create_lead')).toBe(true);
      expect(can(role, 'edit_lead')).toBe(true);
      expect(can(role, 'bulk_upload_leads')).toBe(false);
      expect(can(role, 'delete_lead')).toBe(false);
    });
    it('can access the scoped overdue task queue', () => {
      expect(can(role, 'view_tasks')).toBe(true);
    });
    it('can view assigned projects, but has no project edit or admin access', () => {
      expect(can(role, 'view_projects')).toBe(true);
      expect(can(role, 'edit_project_core')).toBe(false);
      expect(can(role, 'view_admin_console')).toBe(false);
    });
  });

  describe('digital_marketing', () => {
    const role: UserRole = 'digital_marketing';
    it('can view projects and tag campaigns, cannot edit project core', () => {
      expect(can(role, 'view_projects')).toBe(true);
      expect(can(role, 'tag_project_campaigns')).toBe(true);
      expect(can(role, 'edit_project_core')).toBe(false);
    });
    it('has no lead access', () => {
      expect(can(role, 'view_all_leads')).toBe(false);
      expect(can(role, 'view_own_leads_only')).toBe(false);
      expect(can(role, 'create_lead')).toBe(false);
      expect(can(role, 'edit_lead')).toBe(false);
    });
  });

  describe('hr and payroll_finance (placeholder roles)', () => {
    it.each(['hr', 'payroll_finance'] as UserRole[])('%s has no capabilities', (role) => {
      for (const cap of ALL_CAPABILITIES) {
        expect(can(role, cap)).toBe(false);
      }
    });
  });

  describe('viewer', () => {
    const role: UserRole = 'viewer';
    it('read-only: dashboard + leads + projects', () => {
      expect(can(role, 'view_dashboard')).toBe(true);
      expect(can(role, 'view_all_leads')).toBe(true);
      expect(can(role, 'view_projects')).toBe(true);
    });
    it('cannot write anything', () => {
      expect(can(role, 'create_lead')).toBe(false);
      expect(can(role, 'edit_lead')).toBe(false);
      expect(can(role, 'delete_lead')).toBe(false);
      expect(can(role, 'tag_project_campaigns')).toBe(false);
      expect(can(role, 'edit_project_core')).toBe(false);
    });
  });

  describe('cross-role invariants', () => {
    it('only admin + superadmin can delete leads', () => {
      for (const r of ALL_ROLES) {
        const expected = r === 'admin' || r === 'superadmin';
        expect(can(r, 'delete_lead')).toBe(expected);
      }
    });

    it('only admin + superadmin can view the admin console', () => {
      for (const r of ALL_ROLES) {
        const expected = r === 'admin' || r === 'superadmin';
        expect(can(r, 'view_admin_console')).toBe(expected);
      }
    });

    it('admin, superadmin, and sales exec can view the WhatsApp inbox route', () => {
      for (const r of ALL_ROLES) {
        const expected = ['admin', 'superadmin', 'sales_exec'].includes(r);
        expect(can(r, 'view_whatsapp_inbox')).toBe(expected);
      }
    });

    it('only admin + superadmin can onboard users', () => {
      for (const r of ALL_ROLES) {
        const expected = r === 'admin' || r === 'superadmin';
        expect(can(r, 'onboard_users')).toBe(expected);
      }
    });

    it('overdue tasks are visible only to operational owner roles', () => {
      for (const r of ALL_ROLES) {
        const expected = ['superadmin', 'admin', 'sales_exec', 'channel_partner'].includes(r);
        expect(can(r, 'view_tasks')).toBe(expected);
      }
    });

    it('only superadmin can manage_users or promote_to_superadmin', () => {
      for (const r of ALL_ROLES) {
        const expected = r === 'superadmin';
        expect(can(r, 'manage_users')).toBe(expected);
        expect(can(r, 'promote_to_superadmin')).toBe(expected);
      }
    });

    it('bulk_upload_leads was removed from channel_partner (regression guard)', () => {
      // CRITICAL — this was the capability revoked during the CP workflow fix.
      expect(can('channel_partner', 'bulk_upload_leads')).toBe(false);
    });
  });
});

describe('ROLE_LABELS', () => {
  it('has a label for every role', () => {
    for (const r of ALL_ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(typeof ROLE_LABELS[r]).toBe('string');
    }
  });
});

describe('PLACEHOLDER_ROLES', () => {
  it('contains exactly hr and payroll_finance', () => {
    expect(PLACEHOLDER_ROLES.sort()).toEqual(['hr', 'payroll_finance'].sort());
  });
});

describe('defaultLandingPath', () => {
  it('routes placeholder roles to /coming-soon', () => {
    expect(defaultLandingPath('hr')).toBe('/coming-soon');
    expect(defaultLandingPath('payroll_finance')).toBe('/coming-soon');
  });
  it('routes digital_marketing to /projects', () => {
    expect(defaultLandingPath('digital_marketing')).toBe('/projects');
  });
  it('routes everyone else to /', () => {
    expect(defaultLandingPath('superadmin')).toBe('/');
    expect(defaultLandingPath('admin')).toBe('/');
    expect(defaultLandingPath('sales_exec')).toBe('/');
    expect(defaultLandingPath('channel_partner')).toBe('/');
    expect(defaultLandingPath('viewer')).toBe('/');
  });
});
