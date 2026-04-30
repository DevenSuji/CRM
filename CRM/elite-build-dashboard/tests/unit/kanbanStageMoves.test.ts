import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import {
  buildStageMoveLog,
  getRequiredStageMoveNoteKind,
  getRequiredStageMoveNoteLabel,
  getStageMoveDialogTitle,
  getStageMoveReasonOptions,
} from '@/lib/utils/kanbanStageMoves';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? 'l1',
    status: overrides.status ?? 'Site Visit',
    source: overrides.source ?? 'Manual',
    created_at: overrides.created_at ?? Timestamp.fromMillis(1_000),
    raw_data: {
      lead_name: 'Test Lead',
      phone: '111',
      email: 'a@b',
      budget: 0,
      plan_to_buy: 'x',
      profession: 'x',
      location: 'x',
      note: '',
      pref_facings: [],
      interest: '',
    },
    ...overrides,
  };
}

describe('stage move note requirements', () => {
  it('requires a rejection reason only for Rejected', () => {
    expect(getRequiredStageMoveNoteKind('Site Visit', 'Rejected')).toBe('rejection');
    expect(getRequiredStageMoveNoteLabel('Site Visit', 'Rejected')).toBe('Rejection Reason');
    expect(getStageMoveDialogTitle('Site Visit', 'Rejected')).toBe('Reject Lead');
  });

  it('requires closure details only for Closed', () => {
    expect(getRequiredStageMoveNoteKind('Booked', 'Closed')).toBe('closure');
    expect(getRequiredStageMoveNoteLabel('Booked', 'Closed')).toBe('Closure Details');
    expect(getStageMoveDialogTitle('Booked', 'Closed')).toBe('Close Sale');
  });

  it('requires a cancellation reason when moving a booked lead back to an open lane', () => {
    expect(getRequiredStageMoveNoteKind('Booked', 'Nurturing')).toBe('booking_cancellation');
    expect(getRequiredStageMoveNoteLabel('Booked', 'Nurturing')).toBe('Cancellation Reason');
    expect(getStageMoveDialogTitle('Booked', 'Nurturing')).toBe('Cancel Booking');
  });

  it('prioritizes rejection reason over cancellation reason for Booked -> Rejected', () => {
    expect(getRequiredStageMoveNoteKind('Booked', 'Rejected')).toBe('rejection');
    expect(getRequiredStageMoveNoteLabel('Booked', 'Rejected')).toBe('Rejection Reason');
  });

  it('does not require notes for operational lane moves', () => {
    expect(getRequiredStageMoveNoteKind('Site Visit', 'Booked')).toBeNull();
    expect(getRequiredStageMoveNoteKind('Nurturing', 'Site Visit')).toBeNull();
    expect(getRequiredStageMoveNoteKind('New', 'Nurturing')).toBeNull();
  });
});

describe('buildStageMoveLog', () => {
  it('logs ordinary stage moves without forcing note text', () => {
    vi.setSystemTime(new Date('2026-04-27T10:00:00.000Z'));
    const log = buildStageMoveLog(makeLead({ status: 'Nurturing' }), 'Site Visit', 'Admin');
    expect(log).toMatchObject({
      type: 'status_change',
      text: 'Stage moved from Nurturing to Site Visit.',
      author: 'Admin',
      created_at: '2026-04-27T10:00:00.000Z',
    });
    vi.useRealTimers();
  });

  it('trims and records rejection reason', () => {
    const log = buildStageMoveLog(makeLead({ status: 'Site Visit' }), 'Rejected', 'Admin', '  buyer wants 30L lower  ', 'budget_mismatch');
    expect(log.text).toBe('Stage moved from Site Visit to Rejected. Rejection reason: Budget mismatch - buyer wants 30L lower.');
    expect(log.stage_reason_kind).toBe('rejection');
    expect(log.stage_reason_category).toBe('budget_mismatch');
  });

  it('trims and records closure details', () => {
    const log = buildStageMoveLog(makeLead({ status: 'Booked' }), 'Closed', 'Admin', '  agreement signed  ', 'agreement_signed');
    expect(log.text).toBe('Stage moved from Booked to Closed. Closure details: Agreement signed - agreement signed.');
    expect(log.stage_reason_kind).toBe('closure');
    expect(log.stage_reason_category).toBe('agreement_signed');
  });

  it('trims and records booking cancellation reason', () => {
    const log = buildStageMoveLog(makeLead({ status: 'Booked' }), 'Nurturing', 'Admin', '  buyer loan declined  ', 'loan_issue');
    expect(log.text).toBe('Stage moved from Booked to Nurturing. Cancellation reason: Loan issue - buyer loan declined.');
    expect(log.stage_reason_kind).toBe('booking_cancellation');
    expect(log.stage_reason_category).toBe('loan_issue');
  });

  it('exposes reason categories by stage-change kind', () => {
    expect(getStageMoveReasonOptions('rejection').map(option => option.value)).toContain('bought_elsewhere');
    expect(getStageMoveReasonOptions('closure').map(option => option.value)).toContain('payment_received');
    expect(getStageMoveReasonOptions('booking_cancellation').map(option => option.value)).toContain('inventory_unavailable');
  });
});
