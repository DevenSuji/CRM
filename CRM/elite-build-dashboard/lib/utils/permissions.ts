import { UserRole } from '@/lib/types/user';

/** Capabilities are intentionally named after the user-visible action, not
 *  the underlying Firestore collection. This keeps the call-sites readable:
 *  `if (can(role, 'manage_users'))` > `if (role === 'admin' || role === 'superadmin')` */
export type Capability =
  | 'view_dashboard'
  | 'view_all_leads'
  | 'view_own_leads_only'
  | 'create_lead'
  | 'bulk_upload_leads'
  | 'edit_lead'
  | 'delete_lead'
  | 'view_projects'
  | 'edit_project_core'
  | 'tag_project_campaigns'
  | 'view_admin_console'
  | 'manage_users'
  | 'promote_to_superadmin';

const MATRIX: Record<UserRole, Capability[]> = {
  superadmin: [
    'view_dashboard', 'view_all_leads', 'create_lead', 'bulk_upload_leads',
    'edit_lead', 'delete_lead', 'view_projects', 'edit_project_core',
    'tag_project_campaigns', 'view_admin_console', 'manage_users',
    'promote_to_superadmin',
  ],
  admin: [
    'view_dashboard', 'view_all_leads', 'create_lead', 'bulk_upload_leads',
    'edit_lead', 'delete_lead', 'view_projects', 'edit_project_core',
    'tag_project_campaigns', 'view_admin_console',
  ],
  sales_exec: [
    'view_dashboard', 'view_all_leads', 'create_lead', 'edit_lead',
    'view_projects',
  ],
  channel_partner: [
    'view_dashboard', 'view_own_leads_only', 'create_lead', 'edit_lead',
  ],
  digital_marketing: [
    'view_projects', 'tag_project_campaigns',
  ],
  hr: [],
  payroll_finance: [],
  viewer: [
    'view_dashboard', 'view_all_leads', 'view_projects',
  ],
};

export function can(role: UserRole | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(capability) ?? false;
}

/** Labels shown in the admin console role picker. */
export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  sales_exec: 'Sales Executive',
  hr: 'HR',
  payroll_finance: 'Payroll & Finance',
  digital_marketing: 'Digital Marketing',
  channel_partner: 'Channel Partner',
  viewer: 'Viewer',
};

/** Roles that get a "Module coming soon" screen instead of real access. */
export const PLACEHOLDER_ROLES: UserRole[] = ['hr', 'payroll_finance'];

/** Landing route per role, used after sign-in. */
export function defaultLandingPath(role: UserRole): string {
  if (PLACEHOLDER_ROLES.includes(role)) return '/coming-soon';
  if (role === 'digital_marketing') return '/projects';
  return '/';
}
