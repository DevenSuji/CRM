import { Lead, type ActivityLogEntry } from '@/lib/types/lead';

export type StageMoveNoteKind = 'rejection' | 'closure' | 'booking_cancellation' | null;
export type StageMoveReasonKind = Exclude<StageMoveNoteKind, null>;
export type StageMoveReasonCategory =
  | 'budget_mismatch'
  | 'location_mismatch'
  | 'not_reachable'
  | 'bought_elsewhere'
  | 'loan_issue'
  | 'family_decision'
  | 'duplicate_or_junk'
  | 'inventory_unavailable'
  | 'pricing_or_payment'
  | 'legal_or_documentation'
  | 'agreement_signed'
  | 'payment_received'
  | 'other';

export interface StageMoveReasonOption {
  value: StageMoveReasonCategory;
  label: string;
}

const REJECTION_REASON_OPTIONS: StageMoveReasonOption[] = [
  { value: 'budget_mismatch', label: 'Budget mismatch' },
  { value: 'location_mismatch', label: 'Location mismatch' },
  { value: 'not_reachable', label: 'Not reachable' },
  { value: 'bought_elsewhere', label: 'Bought elsewhere' },
  { value: 'loan_issue', label: 'Loan issue' },
  { value: 'family_decision', label: 'Family decision' },
  { value: 'duplicate_or_junk', label: 'Duplicate/junk lead' },
  { value: 'other', label: 'Other' },
];

const CLOSURE_REASON_OPTIONS: StageMoveReasonOption[] = [
  { value: 'agreement_signed', label: 'Agreement signed' },
  { value: 'payment_received', label: 'Payment received' },
  { value: 'pricing_or_payment', label: 'Payment plan confirmed' },
  { value: 'legal_or_documentation', label: 'Legal/documentation complete' },
  { value: 'other', label: 'Other' },
];

const CANCELLATION_REASON_OPTIONS: StageMoveReasonOption[] = [
  { value: 'loan_issue', label: 'Loan issue' },
  { value: 'family_decision', label: 'Family decision' },
  { value: 'pricing_or_payment', label: 'Pricing/payment issue' },
  { value: 'legal_or_documentation', label: 'Legal/documentation issue' },
  { value: 'inventory_unavailable', label: 'Inventory unavailable' },
  { value: 'bought_elsewhere', label: 'Bought elsewhere' },
  { value: 'other', label: 'Other' },
];

export function getStageMoveReasonOptions(kind: StageMoveReasonKind): StageMoveReasonOption[] {
  if (kind === 'rejection') return REJECTION_REASON_OPTIONS;
  if (kind === 'closure') return CLOSURE_REASON_OPTIONS;
  return CANCELLATION_REASON_OPTIONS;
}

export function getStageMoveReasonLabel(kind: StageMoveReasonKind, category?: string | null): string | null {
  if (!category) return null;
  return getStageMoveReasonOptions(kind).find(option => option.value === category)?.label || null;
}

export function getRequiredStageMoveNoteKind(currentStatus: string, newStatus: string): StageMoveNoteKind {
  if (newStatus === 'Rejected') return 'rejection';
  if (newStatus === 'Closed') return 'closure';
  if (currentStatus === 'Booked' && newStatus !== 'Booked') return 'booking_cancellation';
  return null;
}

export function getRequiredStageMoveNoteLabel(currentStatus: string, newStatus: string): string | null {
  const kind = getRequiredStageMoveNoteKind(currentStatus, newStatus);
  if (kind === 'rejection') return 'Rejection Reason';
  if (kind === 'closure') return 'Closure Details';
  if (kind === 'booking_cancellation') return 'Cancellation Reason';
  return null;
}

export function getStageMoveDialogTitle(currentStatus: string, newStatus: string): string {
  const kind = getRequiredStageMoveNoteKind(currentStatus, newStatus);
  if (kind === 'rejection') return 'Reject Lead';
  if (kind === 'closure') return 'Close Sale';
  if (kind === 'booking_cancellation') return 'Cancel Booking';
  return 'Move Lead';
}

export function buildStageMoveLog(
  lead: Lead,
  newStatus: string,
  author: string,
  note?: string,
  reasonCategory?: StageMoveReasonCategory | '',
): ActivityLogEntry {
  const noteText = note?.trim();
  const noteKind = getRequiredStageMoveNoteKind(lead.status, newStatus);
  const reasonLabel = noteKind ? getStageMoveReasonLabel(noteKind, reasonCategory) : null;
  const reasonPrefix = reasonLabel ? `${reasonLabel}${noteText ? ' - ' : ''}` : '';
  const detail = noteKind === 'rejection'
    ? ` Rejection reason: ${reasonPrefix}${noteText}.`
    : noteKind === 'closure'
      ? ` Closure details: ${reasonPrefix}${noteText}.`
      : noteKind === 'booking_cancellation'
        ? ` Cancellation reason: ${reasonPrefix}${noteText}.`
      : noteText
        ? ` Note: ${noteText}.`
        : '';

  return {
    id: `stage_${Date.now()}`,
    type: 'status_change',
    text: `Stage moved from ${lead.status} to ${newStatus}.${detail}`,
    author,
    created_at: new Date().toISOString(),
    ...(noteKind ? { stage_reason_kind: noteKind } : {}),
    ...(noteKind && reasonCategory ? { stage_reason_category: reasonCategory } : {}),
  };
}
