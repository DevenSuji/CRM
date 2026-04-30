import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { computeLeadSLA } from '@/lib/utils/leadSla';
import { DEFAULT_SLA_CONFIG } from '@/lib/types/config';
import type { ActivityLogEntry, Lead } from '@/lib/types/lead';

const now = new Date('2026-04-26T12:00:00Z');
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1',
    status: 'New',
    created_at: ts('2026-04-26T10:30:00Z'),
    source: 'Meta Ads',
    raw_data: {
      lead_name: 'Test Lead',
      phone: '9999999999',
      email: '',
      budget: 0,
      plan_to_buy: '',
      profession: '',
      location: '',
      note: '',
      pref_facings: [],
      interest: '',
    },
    activity_log: [],
    interested_properties: [],
    ...overrides,
  };
}

function activity(type: ActivityLogEntry['type'], createdAt: string): ActivityLogEntry {
  return {
    id: `${type}_${createdAt}`,
    type,
    text: type,
    author: 'Sales User',
    created_at: createdAt,
  };
}

describe('computeLeadSLA', () => {
  it('returns no alerts when SLA is disabled', () => {
    const result = computeLeadSLA(lead(), { ...DEFAULT_SLA_CONFIG, enabled: false }, now);
    expect(result.alerts).toEqual([]);
    expect(result.highestSeverity).toBeNull();
  });

  it('ignores booked, closed, and rejected leads', () => {
    for (const status of ['Booked', 'Closed', 'Rejected']) {
      const result = computeLeadSLA(lead({ status }), DEFAULT_SLA_CONFIG, now);
      expect(result.alerts).toEqual([]);
    }
  });

  it('flags leads with no first contact after the first-call SLA', () => {
    const result = computeLeadSLA(lead(), DEFAULT_SLA_CONFIG, now);
    expect(result.alerts.map(alert => alert.id)).toContain('first_call');
    expect(result.highestSeverity).toBe('critical');
    expect(result.isOverdue).toBe(true);
  });

  it('does not flag first call when a contact activity exists', () => {
    const result = computeLeadSLA(
      lead({ activity_log: [activity('call', '2026-04-26T10:45:00Z')] }),
      DEFAULT_SLA_CONFIG,
      now,
    );
    expect(result.alerts.map(alert => alert.id)).not.toContain('first_call');
  });

  it('flags missed pending callbacks after the configured grace period', () => {
    const result = computeLeadSLA(
      lead({
        callback_requests: [{
          id: 'cb1',
          scheduled_at: '2026-04-26T11:30:00Z',
          notes: '',
          created_at: '2026-04-26T10:00:00Z',
          created_by: 'u1',
          assigned_to: 'u1',
          status: 'pending',
        }],
      }),
      DEFAULT_SLA_CONFIG,
      now,
    );

    expect(result.alerts.map(alert => alert.id)).toContain('missed_callback');
    expect(result.highestSeverity).toBe('critical');
  });

  it('flags follow-up due after contact when the lead is idle', () => {
    const result = computeLeadSLA(
      lead({
        created_at: ts('2026-04-20T10:00:00Z'),
        activity_log: [activity('call', '2026-04-24T10:00:00Z')],
      }),
      DEFAULT_SLA_CONFIG,
      now,
    );

    expect(result.alerts.map(alert => alert.id)).toContain('no_follow_up');
    expect(result.alerts.map(alert => alert.id)).not.toContain('stale');
  });

  it('flags stale leads before follow-up when the stale threshold is reached', () => {
    const result = computeLeadSLA(
      lead({
        created_at: ts('2026-04-20T10:00:00Z'),
        activity_log: [activity('call', '2026-04-22T10:00:00Z')],
      }),
      DEFAULT_SLA_CONFIG,
      now,
    );

    expect(result.alerts.map(alert => alert.id)).toContain('stale');
    expect(result.alerts.map(alert => alert.id)).not.toContain('no_follow_up');
  });
});
