import type { Timestamp } from 'firebase/firestore';
import type { Lead, ActivityEntryType } from '@/lib/types/lead';
import type { SLAConfig } from '@/lib/types/config';

export type SLASeverity = 'critical' | 'warning' | 'info';
export type SLABadgeVariant = 'danger' | 'warning' | 'info';

export interface LeadSLAAlert {
  id: 'missed_callback' | 'first_call' | 'no_follow_up' | 'stale';
  label: string;
  detail: string;
  severity: SLASeverity;
  variant: SLABadgeVariant;
}

export interface LeadSLAState {
  alerts: LeadSLAAlert[];
  highestSeverity: SLASeverity | null;
  isOverdue: boolean;
}

const CLOSED_STATUSES = new Set(['Booked', 'Closed', 'Rejected']);
const CONTACT_ACTIVITY_TYPES = new Set<ActivityEntryType>([
  'call',
  'note',
  'whatsapp_sent',
  'property_details_sent',
  'site_visit_scheduled',
]);

function timestampToMs(value: Timestamp | Date | string | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if ('toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

function minutesBetween(laterMs: number, earlierMs: number): number {
  return Math.max(0, Math.floor((laterMs - earlierMs) / 60000));
}

function daysBetween(laterMs: number, earlierMs: number): number {
  return Math.max(0, Math.floor((laterMs - earlierMs) / 86400000));
}

function latestActivityMs(lead: Lead): number | null {
  const activityTimes = (lead.activity_log || [])
    .map(entry => timestampToMs(entry.created_at))
    .filter((value): value is number => value !== null);

  if (activityTimes.length === 0) return null;
  return Math.max(...activityTimes);
}

function firstContactMs(lead: Lead): number | null {
  const contactTimes = (lead.activity_log || [])
    .filter(entry => CONTACT_ACTIVITY_TYPES.has(entry.type))
    .map(entry => timestampToMs(entry.created_at))
    .filter((value): value is number => value !== null);

  if (contactTimes.length === 0) return null;
  return Math.min(...contactTimes);
}

export function computeLeadSLA(lead: Lead, config: SLAConfig, now: Date = new Date()): LeadSLAState {
  if (!config.enabled || CLOSED_STATUSES.has(lead.status)) {
    return { alerts: [], highestSeverity: null, isOverdue: false };
  }

  const nowMs = now.getTime();
  const createdMs = timestampToMs(lead.created_at);
  const lastActivityMs = latestActivityMs(lead) ?? createdMs;
  const firstContact = firstContactMs(lead);
  const alerts: LeadSLAAlert[] = [];

  const missedCallback = (lead.callback_requests || []).some(callback => {
    if (callback.status !== 'pending') return false;
    const scheduledMs = timestampToMs(callback.scheduled_at);
    if (scheduledMs === null) return false;
    return nowMs - scheduledMs > config.missed_callback_minutes * 60000;
  });

  if (missedCallback) {
    alerts.push({
      id: 'missed_callback',
      label: 'Missed callback',
      detail: `Pending callback is more than ${config.missed_callback_minutes} min overdue.`,
      severity: 'critical',
      variant: 'danger',
    });
  }

  if (createdMs !== null && !firstContact) {
    const ageMinutes = minutesBetween(nowMs, createdMs);
    if (ageMinutes > config.first_call_minutes) {
      alerts.push({
        id: 'first_call',
        label: 'First call overdue',
        detail: `No first contact in ${ageMinutes} min.`,
        severity: 'critical',
        variant: 'danger',
      });
    }
  }

  if (lastActivityMs !== null) {
    const idleDays = daysBetween(nowMs, lastActivityMs);

    if (idleDays >= config.stale_lead_days) {
      alerts.push({
        id: 'stale',
        label: 'Stale lead',
        detail: `No activity for ${idleDays} days.`,
        severity: 'warning',
        variant: 'warning',
      });
    } else if (firstContact && idleDays >= config.no_follow_up_days) {
      alerts.push({
        id: 'no_follow_up',
        label: 'Follow-up due',
        detail: `Last activity was ${idleDays} days ago.`,
        severity: 'warning',
        variant: 'warning',
      });
    }
  }

  const highestSeverity = alerts.some(alert => alert.severity === 'critical')
    ? 'critical'
    : alerts.some(alert => alert.severity === 'warning')
      ? 'warning'
      : alerts.some(alert => alert.severity === 'info')
        ? 'info'
        : null;

  return {
    alerts,
    highestSeverity,
    isOverdue: highestSeverity === 'critical',
  };
}
