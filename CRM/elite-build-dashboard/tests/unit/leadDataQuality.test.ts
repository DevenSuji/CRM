import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import { buildLeadCleanupCsv, getLeadDataQualityIssues, getRequiredGovernanceNoteForStatusChange, summarizeLeadDataQuality } from '@/lib/utils/leadDataQuality';

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    status: 'Nurturing',
    source: 'Meta Ads',
    source_normalized: 'Meta Ads',
    created_at: Timestamp.fromDate(new Date('2026-04-01T00:00:00Z')),
    assigned_to: 'sales1',
    raw_data: {
      lead_name: 'Buyer',
      phone: '9999999999',
      email: 'buyer@example.com',
      budget: 75_00_000,
      plan_to_buy: '1-3 months',
      profession: 'Business',
      location: 'Mysuru',
      note: '',
      pref_facings: [],
      interest: 'Plotted Land',
      interests: ['Plotted Land'],
    },
    ...overrides,
  };
}

describe('getLeadDataQualityIssues', () => {
  it('flags missing core buyer fields and ownership gaps', () => {
    const issues = getLeadDataQualityIssues(lead({
      assigned_to: null,
      source: 'Unknown',
      source_normalized: undefined,
      raw_data: {
        ...lead().raw_data,
        lead_name: '',
        phone: 'N/A',
        budget: 0,
        location: 'Unknown',
        interest: '',
        interests: [],
      },
    }));

    expect(issues.map(issue => issue.id)).toEqual(expect.arrayContaining([
      'missing_name',
      'missing_phone',
      'missing_interest',
      'missing_budget',
      'missing_location',
      'missing_assignee',
      'missing_source',
    ]));
    expect(issues.find(issue => issue.id === 'missing_phone')?.severity).toBe('blocking');
  });

  it('flags legacy or mismatched clean source labels for data sanitization', () => {
    expect(getLeadDataQualityIssues(lead({ source: 'FB Lead', source_normalized: undefined })).map(issue => issue.id))
      .toContain('source_needs_normalization');
    expect(getLeadDataQualityIssues(lead({ source: 'FB Lead', source_normalized: 'Google Ads' })).map(issue => issue.id))
      .toContain('source_needs_normalization');
  });

  it('flags stage-specific gaps for matched, visit, booked, closed, and rejected leads', () => {
    expect(getLeadDataQualityIssues(lead({ status: 'Property Matched', interested_properties: [] })).map(issue => issue.id))
      .toContain('matched_without_property');
    expect(getLeadDataQualityIssues(lead({ status: 'Site Visit', site_visits: [] })).map(issue => issue.id))
      .toContain('site_visit_without_visit');
    expect(getLeadDataQualityIssues(lead({ status: 'Booked', booked_unit: null })).map(issue => issue.id))
      .toContain('booked_without_unit');
    expect(getLeadDataQualityIssues(lead({ status: 'Closed' })).map(issue => issue.id))
      .toContain('closed_without_details');
    expect(getLeadDataQualityIssues(lead({ status: 'Rejected' })).map(issue => issue.id))
      .toContain('rejected_without_reason');
  });

  it('does not flag terminal reason gaps when the status-change log carries the reason', () => {
    const closedIssues = getLeadDataQualityIssues(lead({
      status: 'Closed',
      activity_log: [{
        id: 'stage1',
        type: 'status_change',
        text: 'Stage moved from Booked to Closed. Closure details: agreement signed.',
        author: 'Admin',
        created_at: '2026-04-27T00:00:00.000Z',
      }],
    }));

    expect(closedIssues.map(issue => issue.id)).not.toContain('closed_without_details');
  });
});

describe('summarizeLeadDataQuality', () => {
  it('summarizes blocking and warning issue counts for cleanup queues', () => {
    const summary = summarizeLeadDataQuality(lead({
      source_normalized: undefined,
      raw_data: {
        ...lead().raw_data,
        phone: '',
        budget: 0,
      },
    }));

    expect(summary.totalIssues).toBeGreaterThanOrEqual(3);
    expect(summary.blockingIssues).toBe(1);
    expect(summary.warningIssues).toBeGreaterThanOrEqual(2);
    expect(summary.issueIds).toEqual(expect.arrayContaining(['missing_phone', 'missing_budget', 'source_needs_normalization']));
  });
});

describe('buildLeadCleanupCsv', () => {
  it('exports lead quality fields and issue labels as CSV', () => {
    const csv = buildLeadCleanupCsv([
      lead({
        id: 'lead-1',
        assigned_to: 'sales1',
        source: 'FB Lead',
        source_normalized: undefined,
        raw_data: {
          ...lead().raw_data,
          lead_name: 'Buyer "One"',
          phone: '',
          budget: 0,
        },
      }),
    ], { sales1: 'Asha Sales' });

    expect(csv.split('\n')[0]).toContain('"Lead ID","Lead Name","Phone"');
    expect(csv).toContain('"lead-1","Buyer ""One"""');
    expect(csv).toContain('"Asha Sales"');
    expect(csv).toContain('Lead source not normalized');
    expect(csv).toContain('Phone missing');
    expect(csv).toContain('Budget missing');
  });
});

describe('getRequiredGovernanceNoteForStatusChange', () => {
  it('requires notes for rejection, closure, and booking cancellation transitions', () => {
    expect(getRequiredGovernanceNoteForStatusChange('Nurturing', 'Rejected')).toMatchObject({ kind: 'rejection', label: 'Rejection Reason' });
    expect(getRequiredGovernanceNoteForStatusChange('Booked', 'Closed')).toMatchObject({ kind: 'closure', label: 'Closure Details' });
    expect(getRequiredGovernanceNoteForStatusChange('Booked', 'Site Visit')).toMatchObject({ kind: 'booking_cancellation', label: 'Cancellation Reason' });
  });

  it('does not require notes for ordinary operating stage changes', () => {
    expect(getRequiredGovernanceNoteForStatusChange('Nurturing', 'Site Visit')).toBeNull();
  });
});
