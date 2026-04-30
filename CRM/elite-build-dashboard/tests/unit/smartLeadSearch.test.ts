import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import { buildSmartLeadSearchInsights, matchesSmartLeadSearch, parseSmartLeadSearch } from '@/lib/utils/smartLeadSearch';

const NOW = new Date('2026-04-27T10:00:00.000Z');

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id || 'lead_1',
    status: overrides.status || 'New',
    source: overrides.source || 'Manual',
    created_at: overrides.created_at ?? Timestamp.fromDate(new Date('2026-04-27T08:00:00.000Z')),
    raw_data: {
      lead_name: 'Pavithra M',
      phone: '9999999999',
      email: 'pavithra@example.com',
      budget: 9000000,
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

describe('parseSmartLeadSearch', () => {
  it('extracts budget, temperature, property type, and stage from natural language', () => {
    const search = parseSmartLeadSearch('show hot villa leads above 80L stuck in nurturing for 7 days');

    expect(search.temperature).toBe('Hot');
    expect(search.propertyTypes).toEqual(['Villa']);
    expect(search.minBudget).toBe(8000000);
    expect(search.stuck).toEqual({ status: 'Nurturing', days: 7 });
    expect(search.labels).toEqual(expect.arrayContaining([
      'AI: Hot',
      'Type: Villa',
      'Budget above 80L',
      'Stuck: Nurturing 7d',
    ]));
  });

  it('extracts objection and assignment intent', () => {
    const search = parseSmartLeadSearch('unassigned buyers with price objections');

    expect(search.assignee).toBe('unassigned');
    expect(search.objections).toEqual(['price']);
  });

  it('extracts project interest and no-contact intent', () => {
    const search = parseSmartLeadSearch('leads interested in Rare Earth but not contacted');

    expect(search.projectTerms).toEqual(['rare earth']);
    expect(search.noContact).toBe(true);
    expect(search.textTerms).toEqual([]);
  });
});

describe('matchesSmartLeadSearch', () => {
  it('matches a complex hot stuck nurturing buyer query', () => {
    const input = lead({
      status: 'Nurturing',
      lane_moved_at: Timestamp.fromDate(new Date('2026-04-15T10:00:00.000Z')),
      ai_audit: { intent: 'Investment', urgency: 'High' },
      interested_properties: [{
        projectId: 'p1',
        projectName: 'Rare Earth',
        location: 'Mysuru',
        propertyType: 'Villa',
        tagged_at: '2026-04-20T10:00:00.000Z',
        tagged_by: 'system-match',
        matchScore: 95,
      }],
      activity_log: [
        { id: 'a1', type: 'call', text: 'Call completed', author: 'Sales', created_at: '2026-04-20T09:00:00.000Z' },
        { id: 'a2', type: 'property_details_sent', text: 'Sent Rare Earth', author: 'Sales', created_at: '2026-04-20T09:10:00.000Z' },
        { id: 'a3', type: 'callback_scheduled', text: 'Callback scheduled', author: 'Sales', created_at: '2026-04-20T09:15:00.000Z' },
      ],
    });

    const search = parseSmartLeadSearch('hot villa leads above 80L stuck in nurturing for 7 days');

    expect(matchesSmartLeadSearch(input, search, { now: NOW })).toBe(true);
    expect(matchesSmartLeadSearch({ ...input, status: 'Site Visit' }, search, { now: NOW })).toBe(false);
  });

  it('matches site visits scheduled this week', () => {
    const search = parseSmartLeadSearch('site visits scheduled this week');
    const input = lead({
      status: 'Site Visit',
      site_visits: [{
        id: 'v1',
        scheduled_at: '2026-04-29T10:00:00.000Z',
        location: 'Rare Earth',
        notes: '',
        created_at: '2026-04-27T09:00:00.000Z',
        reminder_on_agreement: false,
        reminder_day_before: false,
        reminder_morning_of: false,
        status: 'scheduled',
      }],
    });

    expect(matchesSmartLeadSearch(input, search, { now: NOW })).toBe(true);
  });

  it('matches objections and unassigned leads', () => {
    const search = parseSmartLeadSearch('unassigned buyers with price objections');

    expect(matchesSmartLeadSearch(lead({ objections: ['price'], assigned_to: null }), search, { now: NOW })).toBe(true);
    expect(matchesSmartLeadSearch(lead({ objections: ['legal'], assigned_to: null }), search, { now: NOW })).toBe(false);
    expect(matchesSmartLeadSearch(lead({ objections: ['price'], assigned_to: 'u1' }), search, { now: NOW })).toBe(false);
  });

  it('keeps plain text search working for names and projects', () => {
    const search = parseSmartLeadSearch('rare earth pavithra');
    const input = lead({
      interested_properties: [{
        projectId: 'p1',
        projectName: 'Rare Earth',
        location: 'Mysuru',
        propertyType: 'Villa',
        tagged_at: '2026-04-20T10:00:00.000Z',
        tagged_by: 'system-match',
      }],
    });

    expect(matchesSmartLeadSearch(input, search, { now: NOW })).toBe(true);
  });

  it('matches project interest when the lead has not been contacted', () => {
    const search = parseSmartLeadSearch('leads interested in Rare Earth but not contacted');
    const input = lead({
      interested_properties: [{
        projectId: 'p1',
        projectName: 'Rare Earth',
        location: 'Mysuru',
        propertyType: 'Villa',
        tagged_at: '2026-04-20T10:00:00.000Z',
        tagged_by: 'system-match',
      }],
      activity_log: [],
    });

    expect(matchesSmartLeadSearch(input, search, { now: NOW })).toBe(true);
    expect(matchesSmartLeadSearch({
      ...input,
      activity_log: [{ id: 'a1', type: 'call', text: 'Called', author: 'Sales', created_at: '2026-04-27T09:00:00.000Z' }],
    }, search, { now: NOW })).toBe(false);
  });
});

describe('buildSmartLeadSearchInsights', () => {
  it('summarizes result risks, top projects, and the first recommended action', () => {
    const search = parseSmartLeadSearch('hot villa leads above 80L');
    const leads = [
      lead({
        id: 'hot_unassigned',
        assigned_to: null,
        ai_audit: { intent: 'Investment', urgency: 'High' },
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysuru',
          propertyType: 'Villa',
          tagged_at: '2026-04-20T10:00:00.000Z',
          tagged_by: 'system-match',
          matchScore: 95,
        }],
        objections: ['price'],
        activity_log: [
          { id: 'a1', type: 'call', text: 'Called', author: 'Sales', created_at: '2026-04-20T09:00:00.000Z' },
          { id: 'a2', type: 'property_details_sent', text: 'Sent Rare Earth', author: 'Sales', created_at: '2026-04-20T09:10:00.000Z' },
          { id: 'a3', type: 'callback_scheduled', text: 'Callback scheduled', author: 'Sales', created_at: '2026-04-20T09:15:00.000Z' },
        ],
      }),
      lead({
        id: 'quiet',
        assigned_to: 'u1',
        created_at: Timestamp.fromDate(new Date('2026-04-10T08:00:00.000Z')),
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysuru',
          propertyType: 'Villa',
          tagged_at: '2026-04-20T10:00:00.000Z',
          tagged_by: 'system-match',
          matchScore: 80,
        }],
        activity_log: [],
      }),
    ];

    const insights = buildSmartLeadSearchInsights(leads, search, { now: NOW });

    expect(insights.stats).toEqual(expect.arrayContaining([
      { label: 'Found', value: '2' },
      { label: 'Unassigned', value: '1' },
      { label: 'Price concern', value: '1' },
      { label: 'Not contacted', value: '1' },
    ]));
    expect(insights.topProjects).toEqual(['Rare Earth (2)']);
    expect(insights.suggestedAction).toBe('Assign the 1 unassigned high-priority lead first.');
  });

  it('returns a helpful action for empty result sets', () => {
    const insights = buildSmartLeadSearchInsights([], parseSmartLeadSearch('hot villas'), { now: NOW });

    expect(insights.stats).toEqual([{ label: 'Found', value: '0' }]);
    expect(insights.suggestedAction).toBe('No matching leads found. Loosen one search condition or clear filters.');
  });
});
