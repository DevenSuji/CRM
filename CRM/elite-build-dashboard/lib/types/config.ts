import { Timestamp } from 'firebase/firestore';

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
  access_token: string;
  /** Pre-approved template names */
  template_site_visit_confirmation: string;
  template_site_visit_reminder: string;
  template_property_match: string;
  enabled: boolean;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  phone_number_id: '',
  business_account_id: '',
  access_token: '',
  template_site_visit_confirmation: 'site_visit_confirmation',
  template_site_visit_reminder: 'site_visit_reminder',
  template_property_match: '',
  enabled: false,
};

/* ==================== AI (Gemini) Config ====================
 * TODO(security): Migrate api_key (and the WhatsApp access_token) to Google
 * Secret Manager. Today these live in `crm_config/*` and are readable by any
 * active authenticated user per Firestore rules — see docs/WhatsAppHardening.md
 * and docs/AuditReport.md §4.1. */
export interface AIConfig {
  api_key: string;
  model: string; // e.g. 'gemini-2.5-flash'
  enabled: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  api_key: '',
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
