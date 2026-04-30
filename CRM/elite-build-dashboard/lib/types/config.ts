import { Timestamp } from 'firebase/firestore';
import type { UserRole } from '@/lib/types/user';

export interface LaneConfig {
  id: string;
  label: string;
  color: string;
  order: number;
  emoji?: string;
}

export interface KanbanConfig {
  lanes: LaneConfig[];
  updated_at?: Timestamp | null;
}

export const DEFAULT_KANBAN_CONFIG: KanbanConfig = {
  lanes: [
    { id: 'new', label: 'New Leads', color: '#9290C3', order: 0, emoji: '🌟' },
    { id: 'first_call', label: 'First Call', color: '#D89216', order: 1, emoji: '📞' },
    { id: 'nurturing', label: 'Nurturing', color: '#7C3AED', order: 2, emoji: '🌱' },
    { id: 'property_matched', label: 'Property Matched', color: '#3B82F6', order: 3, emoji: '🏘️' },
    { id: 'site_visit', label: 'Site Visit', color: '#22C55E', order: 4, emoji: '🏠' },
    { id: 'booked', label: 'Booked', color: '#F59E0B', order: 5, emoji: '📋' },
    { id: 'closed', label: 'Closed', color: '#10B981', order: 6, emoji: '🎉' },
    { id: 'rejected', label: 'Rejected', color: '#EF4444', order: 7, emoji: '❌' },
  ],
};

/** Maps any lead status string to a known lane ID. Unknown statuses go to 'new'. */
export function statusToLaneId(status: string): string {
  const map: Record<string, string> = {
    'New': 'new',
    'Property Matched': 'property_matched',
    'Matched': 'property_matched',
    'First Call': 'first_call',
    'Nurturing': 'nurturing',
    'Site Visit': 'site_visit',
    'Booked': 'booked',
    'Closed': 'closed',
    'Rejected': 'rejected',
  };
  return map[status] || 'new';
}

/* ==================== WhatsApp Business API Config ==================== */
export interface WhatsAppConfig {
  phone_number_id: string;
  business_account_id: string;
  /** Pre-approved template names */
  template_site_visit_confirmation: string;
  template_site_visit_reminder: string;
  template_property_match: string;
  enabled: boolean;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  phone_number_id: '',
  business_account_id: '',
  template_site_visit_confirmation: 'site_visit_confirmation',
  template_site_visit_reminder: 'site_visit_reminder',
  template_property_match: '',
  enabled: false,
};

/* ==================== AI (Gemini) Config ====================
 * Secrets must not be stored here. Gemini credentials are read server-side from
 * GEMINI_API_KEY, and WhatsApp credentials from WHATSAPP_ACCESS_TOKEN. */
export interface AIConfig {
  model: string; // e.g. 'gemini-2.5-flash'
  enabled: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  model: 'gemini-2.5-flash',
  enabled: false,
};

/* ==================== Lead Card Colors Config ==================== */
export interface LeadCardColorsConfig {
  colors: string[];
  updated_at?: Timestamp | null;
}

export const DEFAULT_LEAD_CARD_COLORS: LeadCardColorsConfig = {
  colors: ['#6FCF97', '#FFC81E', '#F9B2D7', '#5E7AC4', '#48A111', '#261CC1', '#002455'],
};

/* ==================== Marketing Team Config ==================== */
export interface MarketingTeam {
  id: string;
  name: string;
  sources: string[];       // e.g., ["Meta Ads", "Instagram"]
  monthly_spend: number;
  active: boolean;
  created_at: Timestamp | null;
}

/* ==================== Property Match Config ==================== */
export interface PropertyMatchConfig {
  threshold_percent: number;  // 20, 25, 30, ... 100
  updated_at?: Timestamp | null;
}

export const DEFAULT_PROPERTY_MATCH_CONFIG: PropertyMatchConfig = {
  threshold_percent: 5,
};

/* ==================== Lead Assignment Config ==================== */
export type LeadAssignmentStrategy = 'workload' | 'round_robin';

export interface LeadAssignmentRule {
  id: string;
  label: string;
  source_contains: string;
  assignee_uids: string[];
  active: boolean;
}

export interface LeadAssignmentConfig {
  enabled: boolean;
  strategy: LeadAssignmentStrategy;
  eligible_roles: UserRole[];
  eligible_user_uids: string[];
  source_rules: LeadAssignmentRule[];
  round_robin_cursor?: number;
  updated_at?: Timestamp | null;
}

export const DEFAULT_LEAD_ASSIGNMENT_CONFIG: LeadAssignmentConfig = {
  enabled: true,
  strategy: 'workload',
  eligible_roles: ['sales_exec'],
  eligible_user_uids: [],
  source_rules: [],
  round_robin_cursor: 0,
};

/* ==================== SLA / Follow-up Config ==================== */
export interface SLAConfig {
  enabled: boolean;
  first_call_minutes: number;
  stale_lead_days: number;
  no_follow_up_days: number;
  missed_callback_minutes: number;
  updated_at?: Timestamp | null;
}

export const DEFAULT_SLA_CONFIG: SLAConfig = {
  enabled: true,
  first_call_minutes: 60,
  stale_lead_days: 3,
  no_follow_up_days: 2,
  missed_callback_minutes: 15,
};

/* ==================== Nurture Sequence Config ==================== */
export interface NurtureConfig {
  enabled: boolean;
  welcome_enabled: boolean;
  welcome_delay_minutes: number;
  property_match_follow_up_enabled: boolean;
  property_match_follow_up_days: number;
  site_visit_reminder_enabled: boolean;
  site_visit_reminder_hours_before: number;
  post_site_visit_follow_up_enabled: boolean;
  post_site_visit_follow_up_hours_after: number;
  old_lead_reactivation_enabled: boolean;
  old_lead_reactivation_days: number;
  no_response_follow_up_enabled: boolean;
  no_response_follow_up_days: number;
  updated_at?: Timestamp | null;
}

export const DEFAULT_NURTURE_CONFIG: NurtureConfig = {
  enabled: true,
  welcome_enabled: true,
  welcome_delay_minutes: 0,
  property_match_follow_up_enabled: true,
  property_match_follow_up_days: 1,
  site_visit_reminder_enabled: true,
  site_visit_reminder_hours_before: 24,
  post_site_visit_follow_up_enabled: true,
  post_site_visit_follow_up_hours_after: 2,
  old_lead_reactivation_enabled: true,
  old_lead_reactivation_days: 30,
  no_response_follow_up_enabled: true,
  no_response_follow_up_days: 2,
};

/** Maps a lane ID back to the Firestore status value */
export function laneIdToStatus(laneId: string): string {
  const map: Record<string, string> = {
    'new': 'New',
    'property_matched': 'Property Matched',
    'first_call': 'First Call',
    'nurturing': 'Nurturing',
    'site_visit': 'Site Visit',
    'booked': 'Booked',
    'closed': 'Closed',
    'rejected': 'Rejected',
  };
  return map[laneId] || 'New';
}
