import { Timestamp } from 'firebase/firestore';

export type UserRole =
  | 'superadmin'
  | 'admin'
  | 'sales_exec'
  | 'hr'
  | 'payroll_finance'
  | 'digital_marketing'
  | 'channel_partner'
  | 'viewer';

export interface CRMUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  photo_url?: string;
  created_at: Timestamp | null;
}
