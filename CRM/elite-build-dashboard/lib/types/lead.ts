import { Timestamp } from 'firebase/firestore';

export interface LeadRawData {
  lead_name: string;
  phone: string;
  /** WhatsApp number if captured separately from phone */
  whatsapp?: string;
  whatsapp_number?: string;
  email: string;
  budget: number;
  plan_to_buy: string;
  profession: string;
  location: string;
  note: string;
  pref_facings: string[];
  interest: string;
  /** Multi-select property types (new field, supersedes single `interest`) */
  interests?: string[];
  /** BHK preference (1, 2, 3, 4, etc.) — non-negotiable for Villa/Apartment/Individual House */
  bhk?: number;
  /** Individual House variant — Simplex, Duplex, Triplex, Quadraplex */
  house_variant?: string;
  /** Geocoded coordinates for proximity matching */
  geo?: { lat: number; lng: number };
}

export interface AIAudit {
  intent: 'Construction' | 'Investment' | 'Speculation' | 'General';
  urgency: 'High' | 'Medium' | 'Low';
}

export type LeadObjection =
  | 'price'
  | 'location'
  | 'legal'
  | 'family_decision'
  | 'loan_payment'
  | 'comparison'
  | 'timing';

export type ActivityEntryType = 'note' | 'call' | 'status_change' | 'site_visit_scheduled' | 'site_visit_cancelled' | 'whatsapp_sent' | 'whatsapp_received' | 'whatsapp_linked' | 'callback_scheduled' | 'property_details_sent' | 'lead_merged' | 'lead_assigned' | 'task_completed' | 'objection_updated';

export interface InterestedProperty {
  projectId: string;
  projectName: string;
  location: string;
  propertyType: string;
  heroImage?: string | null;
  tagged_at: string; // ISO string
  tagged_by: string;
  /** Number of matching units in this project (auto-match only) */
  matchedUnitCount?: number;
  /** Lowest matching unit price (auto-match only) */
  bestPrice?: number;
  /** Distance from lead's location in km (auto-match only, when geo available) */
  distanceKm?: number;
  /** Explainable match score from 0-100 (auto-match only) */
  matchScore?: number;
  /** Human-readable reasons behind the auto-match score */
  matchReasons?: string[];
}

export interface ActivityLogEntry {
  id: string;
  type: ActivityEntryType;
  text: string;
  author: string;
  created_at: string; // ISO string for easy storage/display
  /** For call entries */
  call_duration?: number;
  call_recording_url?: string;
  merged_lead_id?: string;
  assigned_to?: string;
  task_id?: string;
  /** Structured stage-change governance fields for rejection/closure/cancellation analytics. */
  stage_reason_kind?: string;
  stage_reason_category?: string;
}

export interface CallbackRequest {
  id: string;
  scheduled_at: string; // ISO string — when to call back
  notes: string;
  created_at: string;
  created_by: string;
  /** UID of the user who should receive the alarm */
  assigned_to: string;
  status: 'pending' | 'completed' | 'missed';
}

export interface SiteVisit {
  id: string;
  scheduled_at: string; // ISO string
  location: string;
  notes: string;
  created_at: string;
  /** Reminder tracking */
  reminder_on_agreement: boolean;
  reminder_day_before: boolean;
  reminder_morning_of: boolean;
  /** Visit status */
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
}

/** The unit booked by a lead when their card enters the Booked lane.
 *  Paired with InventoryUnit.booked_by_lead_id — both must be kept in sync
 *  via a batched write so a unit can never be double-booked. */
export interface BookedUnit {
  projectId: string;
  projectName: string;
  unitId: string;
  unitLabel: string; // unit_number / plot_number / etc. shown to users
  booked_at: string; // ISO
  booked_by: string; // uid of booking user
}

export interface Lead {
  id: string;
  status: string;
  created_at: Timestamp | null;
  /** Original lead source label exactly as captured/imported. */
  source: string;
  /** Canonical source used for reporting/filtering while preserving `source`. */
  source_normalized?: string;
  raw_data: LeadRawData;
  /** UID of the user who created/owns this lead. Used by channel_partner scoping. */
  owner_uid?: string | null;
  /** Normalized keys used by Phase 2 duplicate detection / merge workflows. */
  duplicate_keys?: {
    phones: string[];
    email: string | null;
    name: string;
  };
  ai_audit?: AIAudit;
  ai_audit_complete?: boolean;
  suggested_plot?: string | null;
  matched_at?: Timestamp | null;
  assigned_to?: string | null;
  lane_moved_at?: Timestamp | null;
  /** Append-only activity log */
  activity_log?: ActivityLogEntry[];
  /** Scheduled site visits */
  site_visits?: SiteVisit[];
  /** Callback requests */
  callback_requests?: CallbackRequest[];
  /** Structured objections blocking this buyer from moving forward. */
  objections?: LeadObjection[];
  /** Properties the lead is interested in (manual tags + auto-matches) */
  interested_properties?: InterestedProperty[];
  /** Project IDs the user manually removed from auto-match — prevents re-adding */
  dismissed_matches?: string[];
  /** Per-lead match threshold override (if set, overrides global threshold) */
  match_threshold?: number;
  /** Card background color (hex) */
  card_color?: string;
  /** The unit booked when this lead moves to the Booked lane. */
  booked_unit?: BookedUnit | null;
  /** Duplicate lead document ids that were merged into this primary lead. */
  merged_from?: string[];
  merged_at?: string;
  /** Soft-archive metadata. Archived leads are hidden from active workflows. */
  archived_at?: Timestamp | null;
  archived_at_iso?: string;
  archived_by?: string;
  archived_by_uid?: string;
  archive_reason?: string;
  archive_kind?: 'manual' | 'merged';
  merged_into?: string;
  /** UTM campaign tracking from ad platforms */
  utm?: {
    source: string;
    medium: string;
    campaign: string;
  };
}

export const DEFAULT_LANES = [
  'New',
  'First Call',
  'Nurturing',
  'Site Visit',
  'Booked',
  'Closed',
  'Rejected',
] as const;

export type LaneId = typeof DEFAULT_LANES[number];
