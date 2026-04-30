import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import { computeLeadIntelligence, generateLeadActivitySummary, generateLeadPitch } from '@/lib/utils/leadIntelligence';

const NOW = new Date('2026-04-27T10:00:00.000Z');

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id || 'lead_1',
    status: overrides.status || 'New',
    source: overrides.source || 'Manual',
    created_at: overrides.created_at ?? Timestamp.fromDate(new Date('2026-04-27T08:00:00.000Z')),
    raw_data: {
      lead_name: 'Test Lead',
      phone: '9999999999',
      email: 'test@example.com',
      budget: 7500000,
      plan_to_buy: 'Immediately',
      profession: 'Founder',
      location: 'Mysuru',
      note: '',
      pref_facings: [],
      interest: 'Villa',
      interests: ['Villa'],
      ...(overrides.raw_data || {}),
    },
    activity_log: [],
    ...overrides,
  };
}

describe('computeLeadIntelligence', () => {
  it('identifies a high-intent matched site-visit lead as hot', () => {
    const result = computeLeadIntelligence(lead({
      status: 'Site Visit',
      ai_audit: { intent: 'Investment', urgency: 'High' },
      interested_properties: [{
        projectId: 'p1',
        projectName: 'Rare Earth',
        location: 'Mysuru',
        propertyType: 'Villa',
        tagged_at: '2026-04-27T08:30:00.000Z',
        tagged_by: 'system-match',
        matchScore: 88,
      }],
      site_visits: [{
        id: 'v1',
        scheduled_at: '2026-04-28T10:00:00.000Z',
        location: 'Mysuru',
        notes: '',
        created_at: '2026-04-27T09:00:00.000Z',
        reminder_on_agreement: false,
        reminder_day_before: false,
        reminder_morning_of: false,
        status: 'scheduled',
      }],
      activity_log: [
        { id: 'a1', type: 'call', text: 'Called', author: 'Sales', created_at: '2026-04-27T09:00:00.000Z' },
        { id: 'a2', type: 'property_details_sent', text: 'Sent', author: 'Sales', created_at: '2026-04-27T09:10:00.000Z' },
      ],
    }), NOW);

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.temperature).toBe('Hot');
    expect(result.reasons.some(reason => reason.includes('Strong property fit'))).toBe(true);
    expect(result.nextBestAction).toContain('Confirm the site visit');
  });

  it('flags a stale uncontacted lead as risk', () => {
    const result = computeLeadIntelligence(lead({
      status: 'New',
      created_at: Timestamp.fromDate(new Date('2026-04-10T10:00:00.000Z')),
      raw_data: {
        lead_name: 'Cold Lead',
        phone: '9999999999',
        email: 'cold@example.com',
        budget: 0,
        plan_to_buy: 'Just exploring',
        profession: '',
        location: '',
        note: '',
        pref_facings: [],
        interest: '',
      },
      activity_log: [],
      interested_properties: [],
    }), NOW);

    expect(result.temperature).toBe('Risk');
    expect(result.risks).toEqual(expect.arrayContaining([
      'Budget is missing.',
      'No property is tagged yet.',
      'No contact activity recorded.',
    ]));
    expect(result.nextBestAction).toBe('Call this lead now and capture the outcome.');
  });

  it('keeps terminal statuses explicit', () => {
    expect(computeLeadIntelligence(lead({ status: 'Closed' }), NOW)).toMatchObject({
      score: 100,
      temperature: 'Closed',
    });
    expect(computeLeadIntelligence(lead({ status: 'Rejected' }), NOW)).toMatchObject({
      score: 0,
      temperature: 'Lost',
    });
  });

  it('prioritizes pending callbacks as the next best action', () => {
    const result = computeLeadIntelligence(lead({
      status: 'Nurturing',
      callback_requests: [{
        id: 'cb1',
        scheduled_at: '2026-04-27T11:00:00.000Z',
        notes: '',
        created_at: '2026-04-27T09:00:00.000Z',
        created_by: 'Sales',
        assigned_to: 'u1',
        status: 'pending',
      }],
    }), NOW);

    expect(result.nextBestAction).toBe('Call the buyer for the scheduled callback.');
    expect(result.reasons).toContain('Pending callback exists.');
  });

  it('lowers score and prioritizes active buyer objections', () => {
    const baseLead = lead({
      status: 'Property Matched',
      interested_properties: [{
        projectId: 'p1',
        projectName: 'Rare Earth',
        location: 'Mysuru',
        propertyType: 'Villa',
        tagged_at: '2026-04-27T08:30:00.000Z',
        tagged_by: 'system-match',
        matchScore: 85,
      }],
      activity_log: [
        { id: 'a1', type: 'call', text: 'Called', author: 'Sales', created_at: '2026-04-27T09:00:00.000Z' },
        { id: 'a2', type: 'property_details_sent', text: 'Sent', author: 'Sales', created_at: '2026-04-27T09:10:00.000Z' },
      ],
    });

    const withoutObjection = computeLeadIntelligence(baseLead, NOW);
    const withObjection = computeLeadIntelligence({
      ...baseLead,
      objections: ['price', 'legal'],
    }, NOW);

    expect(withObjection.score).toBe(withoutObjection.score - 12);
    expect(withObjection.nextBestAction).toBe('Handle price concern before pushing the next stage.');
    expect(withObjection.risks).toContain('Active objection: Price concern, Legal/RERA concern.');
  });
});

describe('generateLeadPitch', () => {
  it('builds a project-specific script from the best matched property', () => {
    const input = lead({
      status: 'Property Matched',
      raw_data: {
        lead_name: 'Pavithra M',
        phone: '9999999999',
        email: 'test@example.com',
        budget: 9000000,
        plan_to_buy: '1-3 months',
        profession: 'Founder',
        location: 'Mysuru',
        note: '',
        pref_facings: [],
        interest: 'Villa',
        interests: ['Villa'],
      },
      interested_properties: [
        {
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysuru',
          propertyType: 'Villa',
          tagged_at: '2026-04-27T08:30:00.000Z',
          tagged_by: 'system-match',
          matchScore: 91,
          matchReasons: ['Villa requirement and budget fit strongly.'],
        },
      ],
    });

    const pitch = generateLeadPitch(input, computeLeadIntelligence(input, NOW));
    expect(pitch.opener).toContain('Pavithra');
    expect(pitch.pitch).toContain('Rare Earth');
    expect(pitch.pitch).toContain('Villa requirement and budget fit strongly.');
    expect(pitch.ask).toContain('Rare Earth');
    expect(pitch.objectionHandlers.some(handler => handler.includes('Rs. 90 L'))).toBe(true);
  });

  it('falls back to qualification when no property is tagged', () => {
    const pitch = generateLeadPitch(lead({
      raw_data: {
        lead_name: 'Unmatched Buyer',
        phone: '9999999999',
        email: 'test@example.com',
        budget: 0,
        plan_to_buy: 'Not Specified',
        profession: '',
        location: '',
        note: '',
        pref_facings: [],
        interest: 'Apartment',
        interests: ['Apartment'],
      },
      interested_properties: [],
    }));

    expect(pitch.pitch).toContain('clarify the exact location and unit preference');
    expect(pitch.ask).toContain('should I filter options strictly');
    expect(pitch.objectionHandlers).toContain('Price: confirm budget before pitching inventory.');
  });

  it('uses selected buyer objections for the objection playbook', () => {
    const input = lead({
      objections: ['legal', 'loan_payment'],
      raw_data: {
        lead_name: 'Pavithra M',
        phone: '9999999999',
        email: 'test@example.com',
        budget: 9000000,
        plan_to_buy: '1-3 months',
        profession: 'Founder',
        location: 'Mysuru',
        note: '',
        pref_facings: [],
        interest: 'Villa',
        interests: ['Villa'],
      },
    });

    const pitch = generateLeadPitch(input, computeLeadIntelligence(input, NOW));

    expect(pitch.objectionHandlers).toEqual([
      'Legal/RERA: share approval status, title clarity, and the exact document checklist before asking for commitment.',
      'Loan/payment: clarify booking amount, loan eligibility, bank support, and payment milestones.',
    ]);
  });
});

describe('generateLeadActivitySummary', () => {
  it('summarizes buyer profile, blocker, latest activity, and site visit state', () => {
    const input = lead({
      status: 'Site Visit',
      objections: ['price'],
      interested_properties: [{
        projectId: 'p1',
        projectName: 'Rare Earth',
        location: 'Mysuru',
        propertyType: 'Villa',
        tagged_at: '2026-04-27T08:30:00.000Z',
        tagged_by: 'system-match',
        matchScore: 91,
      }],
      site_visits: [{
        id: 'v1',
        scheduled_at: '2026-04-28T10:00:00.000Z',
        location: 'Rare Earth',
        notes: 'Bring spouse for decision',
        created_at: '2026-04-27T09:00:00.000Z',
        reminder_on_agreement: false,
        reminder_day_before: false,
        reminder_morning_of: false,
        status: 'scheduled',
      }],
      activity_log: [
        { id: 'a1', type: 'call', text: 'First call completed', author: 'Sales', created_at: '2026-04-27T09:00:00.000Z' },
        { id: 'a2', type: 'note', text: 'Buyer asked for price breakup', author: 'Sales', created_at: '2026-04-27T09:30:00.000Z' },
      ],
    });

    const summary = generateLeadActivitySummary(input, computeLeadIntelligence(input, NOW));

    expect(summary.headline).toContain('Site Visit');
    expect(summary.headline).toContain('Rare Earth');
    expect(summary.buyerProfile).toContain('Villa');
    expect(summary.currentBlocker).toBe('Price concern');
    expect(summary.lastTouch).toContain('Buyer asked for price breakup');
    expect(summary.siteVisitSummary).toContain('scheduled visit');
    expect(summary.siteVisitSummary).toContain('Rare Earth');
    expect(summary.timeline[0]).toContain('Buyer asked for price breakup');
  });

  it('falls back cleanly when there is no activity history', () => {
    const summary = generateLeadActivitySummary(lead({
      activity_log: [],
      raw_data: {
        lead_name: 'Quiet Buyer',
        phone: '9999999999',
        email: 'test@example.com',
        budget: 0,
        plan_to_buy: 'Not Specified',
        profession: '',
        location: '',
        note: 'Imported lead with no conversation yet',
        pref_facings: [],
        interest: 'Apartment',
        interests: ['Apartment'],
      },
    }), undefined);

    expect(summary.lastTouch).toBe('Imported lead with no conversation yet');
    expect(summary.siteVisitSummary).toBe('No site visit is scheduled or completed yet.');
    expect(summary.timeline).toEqual(['Imported lead with no conversation yet']);
  });
});
