/**
 * Dashboard metrics — pure-function coverage.
 *
 * These functions drive every chart on the dashboard. A silent arithmetic bug
 * here shows as "wrong revenue" or "wrong CPL" in a leadership view. Keeping
 * the tests pure (no emulator, no Firestore) means they run in milliseconds
 * and can assert exact numbers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  computeMarketingMetrics,
  computeInternalMetrics,
  computeTimeSeries,
  computeLeaderboard,
} from '@/lib/utils/dashboardMetrics';
import type { Lead, ActivityLogEntry } from '@/lib/types/lead';
import type { CRMUser, UserRole } from '@/lib/types/user';
import type { MarketingTeam } from '@/lib/types/config';

/* -------------------- Fixture factories -------------------- */

const iso = (d: Date) => d.toISOString();
const ts = (d: Date) => Timestamp.fromDate(d);

function makeLead(overrides: Partial<Lead> & {
  raw?: Partial<Lead['raw_data']>;
} = {}): Lead {
  const { raw, ...rest } = overrides;
  return {
    id: 'l1',
    status: 'New',
    created_at: ts(new Date('2026-04-01T10:00:00Z')),
    source: 'Meta Ads',
    raw_data: {
      lead_name: 'Test Lead',
      phone: '',
      email: '',
      budget: 0,
      plan_to_buy: '',
      profession: '',
      location: '',
      note: '',
      pref_facings: [],
      interest: '',
      ...(raw || {}),
    },
    activity_log: [],
    interested_properties: [],
    ...rest,
  };
}

function makeUser(overrides: Partial<CRMUser> = {}): CRMUser {
  return {
    uid: 'u1',
    email: 'u1@test.local',
    name: 'User One',
    role: 'sales_exec' as UserRole,
    active: true,
    created_at: null,
    ...overrides,
  };
}

function call(createdAt: Date, durationSec = 300): ActivityLogEntry {
  return {
    id: `call_${createdAt.getTime()}`,
    type: 'call',
    text: 'Called lead',
    author: 'u1',
    created_at: iso(createdAt),
    call_duration: durationSec,
  };
}

/* ==================== computeMarketingMetrics ==================== */

describe('computeMarketingMetrics', () => {
  const team: MarketingTeam = {
    id: 't1',
    name: 'Paid Social',
    sources: ['Meta Ads', 'Instagram'],
    monthly_spend: 100_000,
    active: true,
    created_at: null,
  };

  it('returns zeroed metrics when no leads match the team sources', () => {
    const result = computeMarketingMetrics([makeLead({ source: 'Google Ads' })], team);
    expect(result.totalLeads).toBe(0);
    expect(result.cpl).toBe(0);
    expect(result.costPerSiteVisit).toBe(0);
    expect(result.leadToSVRatio).toBe(0);
    expect(result.leadQualityScore).toBe(0);
    expect(result.rejectionRate).toBe(0);
    expect(result.sourceBreakdown).toEqual([]);
  });

  it('filters leads to only those whose source is in team.sources', () => {
    const leads = [
      makeLead({ id: 'a', source: 'Meta Ads' }),
      makeLead({ id: 'b', source: 'Instagram' }),
      makeLead({ id: 'c', source: 'Google Ads' }),
      makeLead({ id: 'd', source: 'Organic' }),
    ];
    const result = computeMarketingMetrics(leads, team);
    expect(result.totalLeads).toBe(2);
  });

  it('computes CPL as spend / totalLeads', () => {
    const leads = Array.from({ length: 5 }, (_, i) =>
      makeLead({ id: `l${i}`, source: 'Meta Ads' })
    );
    const result = computeMarketingMetrics(leads, team);
    expect(result.cpl).toBe(20_000);
  });

  it('counts Site Visit + Booked + Closed as site-visit-plus for CPSV', () => {
    const leads = [
      makeLead({ id: 'a', source: 'Meta Ads', status: 'Site Visit' }),
      makeLead({ id: 'b', source: 'Meta Ads', status: 'Booked' }),
      makeLead({ id: 'c', source: 'Meta Ads', status: 'Closed' }),
      makeLead({ id: 'd', source: 'Meta Ads', status: 'New' }),
    ];
    const result = computeMarketingMetrics(leads, team);
    // 4 total leads, 3 SV+, spend 100k → CPSV = 100k/3
    expect(result.totalLeads).toBe(4);
    expect(result.costPerSiteVisit).toBeCloseTo(33_333.33, 1);
    expect(result.leadToSVRatio).toBe(75);
  });

  it('computes rejectionRate as rejected / total × 100', () => {
    const leads = [
      makeLead({ id: 'a', source: 'Meta Ads', status: 'Rejected' }),
      makeLead({ id: 'b', source: 'Meta Ads', status: 'Rejected' }),
      makeLead({ id: 'c', source: 'Meta Ads', status: 'New' }),
      makeLead({ id: 'd', source: 'Meta Ads', status: 'New' }),
    ];
    const result = computeMarketingMetrics(leads, team);
    expect(result.rejectionRate).toBe(50);
  });

  it('computes leadQualityScore from audited leads only (not total leads)', () => {
    const leads = [
      // Audited, high urgency
      makeLead({
        id: 'a', source: 'Meta Ads', ai_audit_complete: true,
        ai_audit: { intent: 'Construction', urgency: 'High' },
      }),
      // Audited, low urgency
      makeLead({
        id: 'b', source: 'Meta Ads', ai_audit_complete: true,
        ai_audit: { intent: 'Investment', urgency: 'Low' },
      }),
      // Not yet audited — must not be counted in either side of the ratio
      makeLead({ id: 'c', source: 'Meta Ads' }),
    ];
    const result = computeMarketingMetrics(leads, team);
    expect(result.leadQualityScore).toBe(50); // 1 high / 2 audited
  });

  it('groups source breakdown and sorts descending by count', () => {
    const leads = [
      makeLead({ id: 'a', source: 'Meta Ads' }),
      makeLead({ id: 'b', source: 'Meta Ads' }),
      makeLead({ id: 'c', source: 'Meta Ads' }),
      makeLead({ id: 'd', source: 'Instagram' }),
    ];
    const result = computeMarketingMetrics(leads, team);
    expect(result.sourceBreakdown).toEqual([
      { name: 'Meta Ads', value: 3 },
      { name: 'Instagram', value: 1 },
    ]);
  });

  it('only counts campaigns when lead.utm.campaign is present', () => {
    const leads = [
      makeLead({ id: 'a', source: 'Meta Ads', utm: { source: 'meta', medium: 'cpc', campaign: 'summer26' } }),
      makeLead({ id: 'b', source: 'Meta Ads', utm: { source: 'meta', medium: 'cpc', campaign: 'summer26' } }),
      makeLead({ id: 'c', source: 'Meta Ads' }), // no utm — must be ignored for campaignPerformance
    ];
    const result = computeMarketingMetrics(leads, team);
    expect(result.campaignPerformance).toEqual([{ name: 'summer26', value: 2 }]);
  });

  it('attributes projects via interested_properties', () => {
    const leads = [
      makeLead({
        id: 'a', source: 'Meta Ads',
        interested_properties: [
          { projectId: 'p1', projectName: 'Rare Earth', location: 'Mysore', propertyType: 'Plotted Land', tagged_at: iso(new Date()), tagged_by: 'u1' },
          { projectId: 'p2', projectName: 'Sunpure', location: 'Bangalore', propertyType: 'Apartment', tagged_at: iso(new Date()), tagged_by: 'u1' },
        ],
      }),
      makeLead({
        id: 'b', source: 'Instagram',
        interested_properties: [
          { projectId: 'p1', projectName: 'Rare Earth', location: 'Mysore', propertyType: 'Plotted Land', tagged_at: iso(new Date()), tagged_by: 'u1' },
        ],
      }),
    ];
    const result = computeMarketingMetrics(leads, team);
    expect(result.projectAttribution).toEqual([
      { name: 'Rare Earth', value: 2 },
      { name: 'Sunpure', value: 1 },
    ]);
  });
});

/* ==================== computeInternalMetrics ==================== */

describe('computeInternalMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles an empty lead list gracefully', () => {
    const result = computeInternalMetrics([], []);
    expect(result.speedToLeadMins).toBe(0);
    expect(result.leadToSVRatio).toBe(0);
    expect(result.svToBookingRatio).toBe(0);
    expect(result.pipelineValue).toBe(0);
    expect(result.revenueClosed).toBe(0);
    expect(result.avgClosingCycleDays).toBe(0);
    expect(result.leadLeakageRate).toBe(0);
    expect(result.callsThisWeek).toBe(0);
    expect(result.avgTalkTimeMins).toBe(0);
    expect(result.agingLeads).toEqual([]);
  });

  it('scopes to a single user when filterUid is provided', () => {
    const leads = [
      makeLead({ id: 'a', assigned_to: 'alice', status: 'Closed', raw: { budget: 1_000_000 } }),
      makeLead({ id: 'b', assigned_to: 'bob', status: 'Closed', raw: { budget: 999 } }),
    ];
    const users = [makeUser({ uid: 'alice' }), makeUser({ uid: 'bob' })];
    const result = computeInternalMetrics(leads, users, 'alice');
    expect(result.revenueClosed).toBe(1_000_000);
  });

  it('excludes terminal-status leads from pipelineValue', () => {
    const leads = [
      makeLead({ id: 'a', status: 'New', raw: { budget: 100 } }),
      makeLead({ id: 'b', status: 'Closed', raw: { budget: 999 } }),
      makeLead({ id: 'c', status: 'Rejected', raw: { budget: 999 } }),
      makeLead({ id: 'd', status: 'Site Visit', raw: { budget: 200 } }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.pipelineValue).toBe(300);
    expect(result.revenueClosed).toBe(999);
  });

  it('computes speed-to-lead from first call entry in activity_log', () => {
    // Created 10 minutes before first call → 10-min speed
    const created = new Date('2026-04-10T10:00:00Z');
    const firstCall = new Date('2026-04-10T10:10:00Z');
    const leads = [
      makeLead({
        id: 'a', status: 'First Call',
        created_at: ts(created),
        activity_log: [call(firstCall)],
      }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.speedToLeadMins).toBe(10);
  });

  it('averages closing cycle across closed leads with both dates present', () => {
    const leads = [
      makeLead({
        id: 'a', status: 'Closed',
        created_at: ts(new Date('2026-04-10T00:00:00Z')),
        lane_moved_at: ts(new Date('2026-04-20T00:00:00Z')), // 10 days
      }),
      makeLead({
        id: 'b', status: 'Closed',
        created_at: ts(new Date('2026-04-01T00:00:00Z')),
        lane_moved_at: ts(new Date('2026-04-21T00:00:00Z')), // 20 days
      }),
      // Missing lane_moved_at — must be ignored from the average
      makeLead({ id: 'c', status: 'Closed', created_at: ts(new Date('2026-04-01T00:00:00Z')) }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.avgClosingCycleDays).toBe(15);
  });

  it('flags a lead as aging when last activity is >48h old', () => {
    // Current time is 2026-04-20T12:00:00Z; 72h ago = 2026-04-17T12:00
    const leads = [
      makeLead({
        id: 'old', status: 'Nurturing',
        created_at: ts(new Date('2026-04-01T00:00:00Z')),
        activity_log: [call(new Date('2026-04-17T12:00:00Z'))],
        assigned_to: 'alice',
        raw: { lead_name: 'Old Lead' },
      }),
      makeLead({
        id: 'fresh', status: 'Nurturing',
        created_at: ts(new Date('2026-04-01T00:00:00Z')),
        activity_log: [call(new Date('2026-04-20T10:00:00Z'))],
        assigned_to: 'bob',
        raw: { lead_name: 'Fresh Lead' },
      }),
    ];
    const users = [makeUser({ uid: 'alice', name: 'Alice' }), makeUser({ uid: 'bob', name: 'Bob' })];
    const result = computeInternalMetrics(leads, users);
    expect(result.agingLeads).toHaveLength(1);
    expect(result.agingLeads[0].id).toBe('old');
    expect(result.agingLeads[0].assignedTo).toBe('Alice');
    expect(result.agingLeads[0].hoursStuck).toBe(72);
  });

  it('never includes terminal-status leads in agingLeads', () => {
    const leads = [
      makeLead({
        id: 'c', status: 'Closed',
        created_at: ts(new Date('2026-04-01T00:00:00Z')),
        activity_log: [call(new Date('2026-04-01T00:00:00Z'))], // very stale
      }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.agingLeads).toEqual([]);
  });

  it('counts only calls this ISO week in callsThisWeek', () => {
    // 2026-04-20 is a Monday → week starts Mon Apr 20 00:00 local
    const thisWeek = new Date('2026-04-20T09:00:00Z');
    const lastWeek = new Date('2026-04-13T09:00:00Z');
    const leads = [
      makeLead({ id: 'a', activity_log: [call(thisWeek), call(lastWeek)] }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.callsThisWeek).toBe(1);
  });

  it('averages talk-time across every call entry (in minutes, rounded)', () => {
    // Two calls: 120s + 480s = 600s / 2 = 300s = 5 min
    const leads = [
      makeLead({
        id: 'a',
        activity_log: [
          call(new Date('2026-04-18T09:00:00Z'), 120),
          call(new Date('2026-04-19T09:00:00Z'), 480),
        ],
      }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.avgTalkTimeMins).toBe(5);
  });

  it('excludes Rejected leads from the denominator of leadToSVRatio', () => {
    // 1 site visit, 1 rejected, 0 others → SV% must be 100 (1/1), not 50 (1/2)
    const leads = [
      makeLead({ id: 'a', status: 'Site Visit' }),
      makeLead({ id: 'b', status: 'Rejected' }),
    ];
    const result = computeInternalMetrics(leads, []);
    expect(result.leadToSVRatio).toBe(100);
  });

  it('caps agingLeads at 10 entries', () => {
    const leads = Array.from({ length: 15 }, (_, i) =>
      makeLead({
        id: `stuck_${i}`,
        status: 'Nurturing',
        created_at: ts(new Date('2026-04-01T00:00:00Z')),
        activity_log: [call(new Date(Date.UTC(2026, 3, 10 + (i % 5), 0, 0, 0)))],
        assigned_to: 'u1',
      })
    );
    const result = computeInternalMetrics(leads, [makeUser({ uid: 'u1' })]);
    expect(result.agingLeads).toHaveLength(10);
  });
});

/* ==================== computeTimeSeries ==================== */

describe('computeTimeSeries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('daily period generates 30 buckets', () => {
    const result = computeTimeSeries([], 'daily');
    expect(result).toHaveLength(30);
  });

  it('weekly period generates 12 buckets', () => {
    const result = computeTimeSeries([], 'weekly');
    expect(result).toHaveLength(12);
  });

  it('monthly period generates 12 buckets', () => {
    const result = computeTimeSeries([], 'monthly');
    expect(result).toHaveLength(12);
  });

  it('yearly period generates 5 buckets', () => {
    const result = computeTimeSeries([], 'yearly');
    expect(result).toHaveLength(5);
  });

  it('drops leads whose created_at is older than the oldest bucket', () => {
    const leads = [
      makeLead({ id: 'today', created_at: ts(new Date('2026-04-20T10:00:00Z')) }),
      makeLead({ id: 'ancient', created_at: ts(new Date('2020-01-01T00:00:00Z')) }),
    ];
    const result = computeTimeSeries(leads, 'daily');
    const totalNew = result.reduce((sum, b) => sum + b.newLeads, 0);
    expect(totalNew).toBe(1);
  });

  it('buckets are returned in ascending chronological order', () => {
    const result = computeTimeSeries([], 'daily');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].timestamp).toBeGreaterThanOrEqual(result[i - 1].timestamp);
    }
  });

  it('increments revenue only for Closed leads', () => {
    const today = new Date('2026-04-20T10:00:00Z');
    const leads = [
      makeLead({ id: 'a', status: 'Closed', created_at: ts(today), raw: { budget: 500_000 } }),
      makeLead({ id: 'b', status: 'Booked', created_at: ts(today), raw: { budget: 999 } }),
      makeLead({ id: 'c', status: 'Site Visit', created_at: ts(today), raw: { budget: 999 } }),
    ];
    const result = computeTimeSeries(leads, 'daily');
    const totalRevenue = result.reduce((s, b) => s + b.revenue, 0);
    expect(totalRevenue).toBe(500_000);
  });

  it('siteVisits counts Site Visit + Booked + Closed (inclusive funnel)', () => {
    const today = new Date('2026-04-20T10:00:00Z');
    const leads = [
      makeLead({ id: 'a', status: 'Site Visit', created_at: ts(today) }),
      makeLead({ id: 'b', status: 'Booked', created_at: ts(today) }),
      makeLead({ id: 'c', status: 'Closed', created_at: ts(today) }),
      makeLead({ id: 'd', status: 'New', created_at: ts(today) }),
    ];
    const result = computeTimeSeries(leads, 'daily');
    const totalSV = result.reduce((s, b) => s + b.siteVisits, 0);
    expect(totalSV).toBe(3);
  });

  it('scopes to a single user when filterUid is passed', () => {
    const today = new Date('2026-04-20T10:00:00Z');
    const leads = [
      makeLead({ id: 'a', assigned_to: 'alice', created_at: ts(today) }),
      makeLead({ id: 'b', assigned_to: 'bob', created_at: ts(today) }),
    ];
    const result = computeTimeSeries(leads, 'daily', 'alice');
    const totalNew = result.reduce((s, b) => s + b.newLeads, 0);
    expect(totalNew).toBe(1);
  });

  it('call entries increment the call bucket at their own timestamp, not the lead creation bucket', () => {
    // Lead created today, but the call logged 5 days ago → call goes to the
    // "5 days ago" bucket, not today. This is a subtle behavior that would
    // break CSV-imported historical leads if regressed.
    const today = new Date('2026-04-20T10:00:00Z');
    const fiveDaysAgo = new Date('2026-04-15T10:00:00Z');
    const leads = [
      makeLead({
        id: 'a',
        created_at: ts(today),
        activity_log: [call(fiveDaysAgo)],
      }),
    ];
    const result = computeTimeSeries(leads, 'daily');
    const todayBucket = result[result.length - 1];
    const fiveDaysAgoBucket = result[result.length - 6];
    expect(todayBucket.calls).toBe(0);
    expect(fiveDaysAgoBucket.calls).toBe(1);
  });
});

/* ==================== computeLeaderboard ==================== */

describe('computeLeaderboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('excludes inactive users', () => {
    const users = [
      makeUser({ uid: 'a', name: 'Active', active: true }),
      makeUser({ uid: 'i', name: 'Inactive', active: false }),
    ];
    const result = computeLeaderboard([], users);
    expect(result.map(e => e.uid)).toEqual(['a']);
  });

  it('excludes viewers', () => {
    const users = [
      makeUser({ uid: 'v', name: 'Viewer', role: 'viewer' }),
      makeUser({ uid: 's', name: 'Sales' }),
    ];
    const result = computeLeaderboard([], users);
    expect(result.map(e => e.uid)).toEqual(['s']);
  });

  it('ranks by leadsClosed desc, then pipelineValue desc as tiebreaker', () => {
    const users = [
      makeUser({ uid: 'alice', name: 'Alice' }),
      makeUser({ uid: 'bob', name: 'Bob' }),
      makeUser({ uid: 'carol', name: 'Carol' }),
    ];
    const leads: Lead[] = [
      // Alice: 1 closed, no pipeline
      makeLead({ id: 'a1', assigned_to: 'alice', status: 'Closed', raw: { budget: 100 } }),
      // Bob: 2 closed, no pipeline — rank #1
      makeLead({ id: 'b1', assigned_to: 'bob', status: 'Closed', raw: { budget: 200 } }),
      makeLead({ id: 'b2', assigned_to: 'bob', status: 'Closed', raw: { budget: 300 } }),
      // Carol: 1 closed, big pipeline → beats Alice on tiebreaker
      makeLead({ id: 'c1', assigned_to: 'carol', status: 'Closed', raw: { budget: 100 } }),
      makeLead({ id: 'c2', assigned_to: 'carol', status: 'New', raw: { budget: 10_000_000 } }),
    ];
    const result = computeLeaderboard(leads, users);
    expect(result.map(e => e.uid)).toEqual(['bob', 'carol', 'alice']);
  });

  it('does not include terminal-status leads in pipelineValue', () => {
    const users = [makeUser({ uid: 'u1', name: 'U1' })];
    const leads = [
      makeLead({ id: 'a', assigned_to: 'u1', status: 'New', raw: { budget: 100 } }),
      makeLead({ id: 'b', assigned_to: 'u1', status: 'Closed', raw: { budget: 999 } }),
      makeLead({ id: 'c', assigned_to: 'u1', status: 'Rejected', raw: { budget: 999 } }),
    ];
    const result = computeLeaderboard(leads, users);
    expect(result[0].pipelineValue).toBe(100);
  });

  it('counts only calls within the current ISO week', () => {
    const users = [makeUser({ uid: 'u1', name: 'U1' })];
    const leads = [
      makeLead({
        id: 'a', assigned_to: 'u1',
        activity_log: [
          call(new Date('2026-04-20T09:00:00Z')), // this week (Monday)
          call(new Date('2026-04-13T09:00:00Z')), // last week
        ],
      }),
    ];
    const result = computeLeaderboard(leads, users);
    expect(result[0].callsThisWeek).toBe(1);
  });
});
