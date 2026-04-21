import { Lead } from '@/lib/types/lead';
import { CRMUser } from '@/lib/types/user';
import { MarketingTeam } from '@/lib/types/config';

/** useFirestoreCollection spreads the doc id into `id`, so CRMUser objects
 *  coming from that hook have both `uid` and `id`. Keep them in sync here. */
type UserWithDocId = CRMUser & { id?: string };
const userIdentifier = (u: UserWithDocId): string | undefined => u.uid || u.id;

/* ==================== Shared Types ==================== */

export interface NameValue {
  name: string;
  value: number;
}

export interface LeaderboardEntry {
  uid: string;
  name: string;
  leadsClosed: number;
  pipelineValue: number;
  callsThisWeek: number;
}

/* ==================== Shared Helpers ==================== */

const TERMINAL_STATUSES = ['Closed', 'Rejected'];

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ==================== Marketing Team Metrics ==================== */

export interface MarketingMetrics {
  totalLeads: number;
  cpl: number;
  costPerSiteVisit: number;
  leadToSVRatio: number;
  leadQualityScore: number;
  rejectionRate: number;
  sourceBreakdown: NameValue[];
  campaignPerformance: NameValue[];
  projectAttribution: NameValue[];
  funnelStages: NameValue[];
}

export function computeMarketingMetrics(leads: Lead[], team: MarketingTeam): MarketingMetrics {
  const teamLeads = leads.filter(l => team.sources.includes(l.source));
  const total = teamLeads.length;
  const spend = team.monthly_spend;

  let siteVisitPlus = 0;
  let rejected = 0;
  let highUrgency = 0;
  let audited = 0;

  const sourceMap = new Map<string, number>();
  const campaignMap = new Map<string, number>();
  const projectMap = new Map<string, number>();
  const stageMap = new Map<string, number>();

  for (const lead of teamLeads) {
    stageMap.set(lead.status, (stageMap.get(lead.status) || 0) + 1);

    if (['Site Visit', 'Booked', 'Closed'].includes(lead.status)) {
      siteVisitPlus++;
    }
    if (lead.status === 'Rejected') rejected++;

    if (lead.ai_audit_complete && lead.ai_audit) {
      audited++;
      if (lead.ai_audit.urgency === 'High') highUrgency++;
    }

    sourceMap.set(lead.source, (sourceMap.get(lead.source) || 0) + 1);

    const campaign = lead.utm?.campaign;
    if (campaign) {
      campaignMap.set(campaign, (campaignMap.get(campaign) || 0) + 1);
    }

    if (lead.interested_properties) {
      for (const prop of lead.interested_properties) {
        projectMap.set(prop.projectName, (projectMap.get(prop.projectName) || 0) + 1);
      }
    }
  }

  const toSorted = (map: Map<string, number>): NameValue[] =>
    Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

  return {
    totalLeads: total,
    cpl: total > 0 ? spend / total : 0,
    costPerSiteVisit: siteVisitPlus > 0 ? spend / siteVisitPlus : 0,
    leadToSVRatio: total > 0 ? (siteVisitPlus / total) * 100 : 0,
    leadQualityScore: audited > 0 ? (highUrgency / audited) * 100 : 0,
    rejectionRate: total > 0 ? (rejected / total) * 100 : 0,
    sourceBreakdown: toSorted(sourceMap),
    campaignPerformance: toSorted(campaignMap),
    projectAttribution: toSorted(projectMap),
    funnelStages: toSorted(stageMap),
  };
}

/* ==================== Internal Team Metrics ==================== */

export interface InternalMetrics {
  speedToLeadMins: number;
  leadToSVRatio: number;
  svToBookingRatio: number;
  pipelineValue: number;
  revenueClosed: number;
  avgClosingCycleDays: number;
  leadLeakageRate: number;
  callsThisWeek: number;
  avgTalkTimeMins: number;
  agingLeads: AgingLead[];
  funnelStages: NameValue[];
}

export interface AgingLead {
  id: string;
  name: string;
  status: string;
  hoursStuck: number;
  assignedTo: string;
}

export function computeInternalMetrics(
  leads: Lead[],
  users: UserWithDocId[],
  filterUid?: string,
): InternalMetrics {
  const filtered = filterUid
    ? leads.filter(l => l.assigned_to === filterUid)
    : leads;

  const now = new Date();
  const weekStart = startOfWeek();
  const SV_PLUS = ['Site Visit', 'Booked', 'Closed'];

  let totalSpeedMs = 0;
  let speedCount = 0;
  let svPlus = 0;
  let booked = 0;
  let closed = 0;
  let closedValue = 0;
  let pipelineValue = 0;
  let totalClosingDays = 0;
  let closedWithDates = 0;
  let stuck48h = 0;
  let nonTerminal = 0;
  let callsWeek = 0;
  let totalTalkTime = 0;
  let totalCalls = 0;

  const stageMap = new Map<string, number>();
  const agingLeads: AgingLead[] = [];

  for (const lead of filtered) {
    const budget = lead.raw_data.budget || 0;
    stageMap.set(lead.status, (stageMap.get(lead.status) || 0) + 1);

    if (!TERMINAL_STATUSES.includes(lead.status)) {
      pipelineValue += budget;
      nonTerminal++;
    }
    if (lead.status === 'Closed') {
      closed++;
      closedValue += budget;
      if (lead.created_at && lead.lane_moved_at) {
        const days = (lead.lane_moved_at.toDate().getTime() - lead.created_at.toDate().getTime()) / (1000 * 60 * 60 * 24);
        if (days >= 0) { totalClosingDays += days; closedWithDates++; }
      }
    }

    if (SV_PLUS.includes(lead.status)) svPlus++;
    if (lead.status === 'Booked') booked++;

    if (lead.created_at && lead.activity_log) {
      const firstCall = lead.activity_log.find(e => e.type === 'call');
      if (firstCall) {
        const created = lead.created_at.toDate().getTime();
        const called = new Date(firstCall.created_at).getTime();
        const diffMs = called - created;
        if (diffMs >= 0) { totalSpeedMs += diffMs; speedCount++; }
      }
    }

    if (lead.activity_log) {
      for (const entry of lead.activity_log) {
        if (entry.type === 'call') {
          totalCalls++;
          totalTalkTime += entry.call_duration || 0;
          if (new Date(entry.created_at) >= weekStart) callsWeek++;
        }
      }
    }

    if (!TERMINAL_STATUSES.includes(lead.status)) {
      const lastActivity = lead.activity_log?.length
        ? new Date(lead.activity_log[lead.activity_log.length - 1].created_at)
        : lead.created_at?.toDate();
      if (lastActivity) {
        const hoursStuck = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
        if (hoursStuck > 48) {
          stuck48h++;
          const assignee = users.find(u => userIdentifier(u) === lead.assigned_to);
          agingLeads.push({
            id: lead.id,
            name: lead.raw_data.lead_name,
            status: lead.status,
            hoursStuck: Math.round(hoursStuck),
            assignedTo: assignee?.name || 'Unassigned',
          });
        }
      }
    }
  }

  agingLeads.sort((a, b) => b.hoursStuck - a.hoursStuck);

  const toSorted = (map: Map<string, number>): NameValue[] =>
    Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

  const nonRejected = filtered.filter(l => l.status !== 'Rejected').length;

  return {
    speedToLeadMins: speedCount > 0 ? Math.round(totalSpeedMs / speedCount / 60000) : 0,
    leadToSVRatio: nonRejected > 0 ? (svPlus / nonRejected) * 100 : 0,
    svToBookingRatio: svPlus > 0 ? ((booked + closed) / svPlus) * 100 : 0,
    pipelineValue,
    revenueClosed: closedValue,
    avgClosingCycleDays: closedWithDates > 0 ? totalClosingDays / closedWithDates : 0,
    leadLeakageRate: nonTerminal > 0 ? (stuck48h / nonTerminal) * 100 : 0,
    callsThisWeek: callsWeek,
    avgTalkTimeMins: totalCalls > 0 ? Math.round(totalTalkTime / totalCalls / 60) : 0,
    agingLeads: agingLeads.slice(0, 10),
    funnelStages: toSorted(stageMap),
  };
}

/* ==================== Time-Series Metrics ==================== */

export type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface TimeSeriesPoint {
  label: string;       // Display label (e.g., "Apr 15", "Week 16", "Apr 2026")
  timestamp: number;   // For sorting
  newLeads: number;
  siteVisits: number;
  bookings: number;
  closedDeals: number;
  revenue: number;
  pipelineValue: number;
  calls: number;
}

function formatDateKey(date: Date, period: TimePeriod): { key: string; label: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  switch (period) {
    case 'daily':
      return {
        key: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      };
    case 'weekly': {
      // ISO week number
      const jan1 = new Date(y, 0, 1);
      const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      return { key: `${y}-W${week}`, label: `W${week}` };
    }
    case 'monthly':
      return {
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      };
    case 'yearly':
      return { key: `${y}`, label: `${y}` };
  }
}

/** Number of time buckets to generate for each period */
function getBucketCount(period: TimePeriod): number {
  switch (period) {
    case 'daily': return 30;
    case 'weekly': return 12;
    case 'monthly': return 12;
    case 'yearly': return 5;
  }
}

/** Generate empty time buckets going backwards from today */
function generateBuckets(period: TimePeriod): Map<string, TimeSeriesPoint> {
  const buckets = new Map<string, TimeSeriesPoint>();
  const count = getBucketCount(period);
  const now = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now);
    switch (period) {
      case 'daily': date.setDate(date.getDate() - i); break;
      case 'weekly': date.setDate(date.getDate() - i * 7); break;
      case 'monthly': date.setMonth(date.getMonth() - i); break;
      case 'yearly': date.setFullYear(date.getFullYear() - i); break;
    }
    const { key, label } = formatDateKey(date, period);
    if (!buckets.has(key)) {
      buckets.set(key, {
        label,
        timestamp: date.getTime(),
        newLeads: 0, siteVisits: 0, bookings: 0,
        closedDeals: 0, revenue: 0, pipelineValue: 0, calls: 0,
      });
    }
  }
  return buckets;
}

export function computeTimeSeries(leads: Lead[], period: TimePeriod, filterUid?: string): TimeSeriesPoint[] {
  const filtered = filterUid ? leads.filter(l => l.assigned_to === filterUid) : leads;
  const buckets = generateBuckets(period);

  for (const lead of filtered) {
    if (!lead.created_at) continue;
    const createdDate = lead.created_at.toDate();
    const { key } = formatDateKey(createdDate, period);
    const bucket = buckets.get(key);
    if (!bucket) continue;

    bucket.newLeads++;
    const budget = lead.raw_data.budget || 0;

    if (['Site Visit', 'Booked', 'Closed'].includes(lead.status)) bucket.siteVisits++;
    if (lead.status === 'Booked') bucket.bookings++;
    if (lead.status === 'Closed') { bucket.closedDeals++; bucket.revenue += budget; }
    if (!TERMINAL_STATUSES.includes(lead.status)) bucket.pipelineValue += budget;

    // Count calls in this period
    if (lead.activity_log) {
      for (const entry of lead.activity_log) {
        if (entry.type === 'call') {
          const callDate = new Date(entry.created_at);
          const callKey = formatDateKey(callDate, period).key;
          const callBucket = buckets.get(callKey);
          if (callBucket) callBucket.calls++;
        }
      }
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/* ==================== Leaderboard ==================== */

export function computeLeaderboard(leads: Lead[], users: UserWithDocId[]): LeaderboardEntry[] {
  const weekStart = startOfWeek();
  const entries: LeaderboardEntry[] = [];

  for (const user of users) {
    if (!user.active || user.role === 'viewer') continue;

    const uid = userIdentifier(user);
    const userLeads = leads.filter(l => l.assigned_to === uid);
    let leadsClosed = 0;
    let pipelineValue = 0;
    let callsThisWeek = 0;

    for (const lead of userLeads) {
      if (lead.status === 'Closed') leadsClosed++;
      if (!TERMINAL_STATUSES.includes(lead.status)) {
        pipelineValue += lead.raw_data.budget || 0;
      }
      if (lead.activity_log) {
        for (const entry of lead.activity_log) {
          if (entry.type === 'call' && new Date(entry.created_at) >= weekStart) {
            callsThisWeek++;
          }
        }
      }
    }

    entries.push({ uid: userIdentifier(user) || '', name: user.name, leadsClosed, pipelineValue, callsThisWeek });
  }

  entries.sort((a, b) => b.leadsClosed - a.leadsClosed || b.pipelineValue - a.pipelineValue);
  return entries;
}
