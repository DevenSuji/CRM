import type { Lead } from '@/lib/types/lead';
import { getRequiredStageMoveNoteKind, type StageMoveNoteKind } from '@/lib/utils/kanbanStageMoves';
import { normalizeLeadSource } from '@/lib/utils/leadSourceHygiene';

export type LeadDataQualitySeverity = 'blocking' | 'warning';

export interface LeadDataQualityIssue {
  id: string;
  label: string;
  detail: string;
  severity: LeadDataQualitySeverity;
}

const PLACEHOLDER_VALUES = new Set(['n/a', 'na', 'none', 'null', 'unknown', 'not specified', '-']);

function hasText(value: unknown): boolean {
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !PLACEHOLDER_VALUES.has(normalized);
}

function hasInterest(lead: Lead): boolean {
  const raw = lead.raw_data || {};
  return Boolean(raw.interests?.some(hasText) || hasText(raw.interest));
}

function hasScheduledOrCompletedVisit(lead: Lead): boolean {
  return (lead.site_visits || []).some(visit => visit.status === 'scheduled' || visit.status === 'completed');
}

function hasStageReason(lead: Lead, kind: Exclude<StageMoveNoteKind, null>): boolean {
  const needle = kind === 'rejection'
    ? 'Rejection reason:'
    : kind === 'closure'
      ? 'Closure details:'
      : 'Cancellation reason:';
  return (lead.activity_log || []).some(entry => entry.type === 'status_change' && entry.text.includes(needle));
}

export function getLeadDataQualityIssues(lead: Lead): LeadDataQualityIssue[] {
  const raw = lead.raw_data || {};
  const issues: LeadDataQualityIssue[] = [];

  const normalizedSource = normalizeLeadSource(lead.source);
  if (!hasText(lead.source) || normalizedSource === 'Unknown') {
    issues.push({
      id: 'missing_source',
      label: 'Lead source missing',
      detail: 'Capture a real lead source so campaign and channel analysis stays useful.',
      severity: 'warning',
    });
  } else if (lead.source_normalized && lead.source_normalized !== normalizedSource) {
    issues.push({
      id: 'source_needs_normalization',
      label: 'Lead source normalization mismatch',
      detail: 'Update the clean source label so reporting groups this lead under the right channel.',
      severity: 'warning',
    });
  } else if (!lead.source_normalized) {
    issues.push({
      id: 'source_needs_normalization',
      label: 'Lead source not normalized',
      detail: 'Stamp the clean source label so future reports do not fragment this channel.',
      severity: 'warning',
    });
  }

  if (!hasText(raw.lead_name)) {
    issues.push({
      id: 'missing_name',
      label: 'Buyer name missing',
      detail: 'Capture the buyer name so sales, merge, and audit trails stay readable.',
      severity: 'blocking',
    });
  }

  if (!hasText(raw.phone)) {
    issues.push({
      id: 'missing_phone',
      label: 'Phone missing',
      detail: 'A lead cannot move cleanly through call, WhatsApp, and follow-up workflows without a phone number.',
      severity: 'blocking',
    });
  }

  if (!hasInterest(lead)) {
    issues.push({
      id: 'missing_interest',
      label: 'Property interest missing',
      detail: 'Choose at least one property type so matching and demand intelligence can classify the buyer.',
      severity: 'warning',
    });
  }

  if (!Number(raw.budget || 0)) {
    issues.push({
      id: 'missing_budget',
      label: 'Budget missing',
      detail: 'Budget is needed for match scoring, forecast value, and demand-gap reporting.',
      severity: 'warning',
    });
  }

  if (!hasText(raw.location)) {
    issues.push({
      id: 'missing_location',
      label: 'Location missing',
      detail: 'Location improves proximity matching and demand-vs-supply reporting.',
      severity: 'warning',
    });
  }

  if (!lead.assigned_to && !['Closed', 'Rejected'].includes(lead.status)) {
    issues.push({
      id: 'missing_assignee',
      label: 'Assignee missing',
      detail: 'Assign the lead so SLA, task, and accountability views stay accurate.',
      severity: 'warning',
    });
  }

  if (lead.status === 'Property Matched' && (lead.interested_properties || []).length === 0) {
    issues.push({
      id: 'matched_without_property',
      label: 'Property Matched without a property',
      detail: 'Tag or restore a matching property before keeping this lead in Property Matched.',
      severity: 'warning',
    });
  }

  if (lead.status === 'Site Visit' && !hasScheduledOrCompletedVisit(lead)) {
    issues.push({
      id: 'site_visit_without_visit',
      label: 'Site Visit stage needs visit details',
      detail: 'Schedule or record the site visit so follow-up and reminders can work.',
      severity: 'warning',
    });
  }

  if (lead.status === 'Booked' && !lead.booked_unit) {
    issues.push({
      id: 'booked_without_unit',
      label: 'Booked stage needs a booked unit',
      detail: 'Select the unit so inventory cannot be double-booked or left out of sync.',
      severity: 'blocking',
    });
  }

  if (lead.status === 'Closed' && !hasStageReason(lead, 'closure')) {
    issues.push({
      id: 'closed_without_details',
      label: 'Closure details missing',
      detail: 'Record closure details so revenue and win analysis have context.',
      severity: 'warning',
    });
  }

  if (lead.status === 'Rejected' && !hasStageReason(lead, 'rejection')) {
    issues.push({
      id: 'rejected_without_reason',
      label: 'Rejection reason missing',
      detail: 'Record why the buyer was rejected so demand and source quality stay honest.',
      severity: 'warning',
    });
  }

  return issues;
}

export interface LeadDataQualitySummary {
  totalIssues: number;
  blockingIssues: number;
  warningIssues: number;
  issueIds: string[];
}

export function summarizeLeadDataQuality(lead: Lead): LeadDataQualitySummary {
  const issues = getLeadDataQualityIssues(lead);
  return {
    totalIssues: issues.length,
    blockingIssues: issues.filter(issue => issue.severity === 'blocking').length,
    warningIssues: issues.filter(issue => issue.severity === 'warning').length,
    issueIds: issues.map(issue => issue.id),
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildLeadCleanupCsv(leads: Lead[], assigneeNameByUid: Record<string, string> = {}): string {
  const headers = [
    'Lead ID',
    'Lead Name',
    'Phone',
    'Status',
    'Source',
    'Normalized Source',
    'Assignee',
    'Issue Count',
    'Blocking Issues',
    'Warning Issues',
    'Issue Labels',
  ];

  const rows = leads
    .map(lead => {
      const issues = getLeadDataQualityIssues(lead);
      const summary = summarizeLeadDataQuality(lead);
      return [
        lead.id,
        lead.raw_data?.lead_name || '',
        lead.raw_data?.phone || '',
        lead.status,
        lead.source || '',
        lead.source_normalized || '',
        lead.assigned_to ? assigneeNameByUid[lead.assigned_to] || lead.assigned_to : '',
        summary.totalIssues,
        summary.blockingIssues,
        summary.warningIssues,
        issues.map(issue => issue.label).join('; '),
      ];
    });

  return [headers, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
}

export function getRequiredGovernanceNoteForStatusChange(currentStatus: string, newStatus: string): {
  kind: Exclude<StageMoveNoteKind, null>;
  label: string;
} | null {
  const kind = getRequiredStageMoveNoteKind(currentStatus, newStatus);
  if (!kind) return null;
  if (kind === 'rejection') return { kind, label: 'Rejection Reason' };
  if (kind === 'closure') return { kind, label: 'Closure Details' };
  return { kind, label: 'Cancellation Reason' };
}
