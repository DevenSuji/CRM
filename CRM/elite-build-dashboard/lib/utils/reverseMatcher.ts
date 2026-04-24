import type { Lead } from '@/lib/types/lead';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { Project } from '@/lib/types/project';
import { computeMatches, type MatchResult } from '@/lib/utils/propertyMatcher';

const ACTIVE_BUYER_STATUSES = new Set([
  'New',
  'First Call',
  'Nurturing',
  'Property Matched',
  'Matched',
  'Site Visit',
]);

export interface BestBuyerResult {
  leadId: string;
  leadName: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  totalScore: number;
  baseMatchScore: number;
  reasons: string[];
  matchedUnitCount: number;
  bestPrice: number;
  distanceKm?: number;
  urgencyLabel: 'High' | 'Medium' | 'Low';
  urgencyPoints: number;
  stagePoints: number;
  recencyPoints: number;
  engagementPoints: number;
  engagementLabel: string;
  lastTouchMs: number;
  unitLabel?: string;
}

export interface ReverseMatchProjectSnapshot {
  projectId: string;
  projectName: string;
  propertyType: string;
  inventoryCount: number;
  buyerCount: number;
  buyers: BestBuyerResult[];
  updated_at: string;
}

export interface ReverseMatchUnitSnapshot {
  unitId: string;
  projectId: string;
  projectName: string;
  propertyType: string;
  unitLabel: string;
  status: string;
  price: number;
  buyerCount: number;
  buyers: BestBuyerResult[];
  updated_at: string;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function timestampMs(value: Lead['created_at']): number {
  return value?.toMillis?.() ?? 0;
}

function latestActivityMs(lead: Lead): number {
  const activityMs = (lead.activity_log || [])
    .map(entry => new Date(entry.created_at).getTime())
    .filter(ms => Number.isFinite(ms));
  const visitMs = (lead.site_visits || [])
    .map(visit => new Date(visit.scheduled_at).getTime())
    .filter(ms => Number.isFinite(ms));
  return Math.max(timestampMs(lead.created_at), ...activityMs, ...visitMs);
}

function inferUrgency(lead: Lead): { label: 'High' | 'Medium' | 'Low'; points: number; reason: string } {
  const explicit = lead.ai_audit?.urgency;
  if (explicit === 'High') return { label: 'High', points: 14, reason: 'AI audit marks this buyer as high urgency.' };
  if (explicit === 'Medium') return { label: 'Medium', points: 9, reason: 'AI audit marks this buyer as medium urgency.' };
  if (explicit === 'Low') return { label: 'Low', points: 4, reason: 'AI audit marks this buyer as low urgency.' };

  const plan = (lead.raw_data.plan_to_buy || '').toLowerCase();
  if (/(immediate|asap|urgent|this week|this month)/.test(plan)) {
    return { label: 'High', points: 12, reason: `Buying timeline suggests urgency (${lead.raw_data.plan_to_buy}).` };
  }
  if (/(1 month|2 month|3 month|quarter|soon|next month)/.test(plan)) {
    return { label: 'Medium', points: 8, reason: `Buying timeline is active (${lead.raw_data.plan_to_buy}).` };
  }
  return { label: 'Low', points: 5, reason: 'No strong urgency signal yet, so this buyer is treated as lower urgency.' };
}

function statusSignal(status: string): { points: number; reason: string } {
  switch (status) {
    case 'Site Visit':
      return { points: 16, reason: 'Lead is already in Site Visit, which is the strongest open-stage intent signal.' };
    case 'Property Matched':
    case 'Matched':
      return { points: 13, reason: 'Lead is already in Property Matched, so the team has prior fit confirmation.' };
    case 'Nurturing':
      return { points: 10, reason: 'Lead is in Nurturing, so there is active pipeline context to continue.' };
    case 'First Call':
      return { points: 8, reason: 'Lead has already progressed to First Call, reducing cold-start friction.' };
    case 'New':
      return { points: 6, reason: 'Lead is still new, so outreach is early but timely.' };
    default:
      return { points: 0, reason: `Lead stage is ${status}.` };
  }
}

function recencySignal(lead: Lead): { points: number; reason: string; lastTouchMs: number } {
  const lastTouchMs = latestActivityMs(lead);
  if (!lastTouchMs) return { points: 2, reason: 'No activity timestamp available; recency contribution is minimal.', lastTouchMs };

  const ageDays = (Date.now() - lastTouchMs) / (1000 * 60 * 60 * 24);
  if (ageDays <= 3) return { points: 12, reason: 'Recent activity in the last 3 days keeps this buyer hot.', lastTouchMs };
  if (ageDays <= 7) return { points: 10, reason: 'Recent activity in the last week keeps this buyer warm.', lastTouchMs };
  if (ageDays <= 14) return { points: 7, reason: 'Activity in the last two weeks keeps this buyer relevant.', lastTouchMs };
  if (ageDays <= 30) return { points: 4, reason: 'Buyer is not cold yet, but follow-up momentum is fading.', lastTouchMs };
  return { points: 2, reason: 'Buyer has been quiet for over a month.', lastTouchMs };
}

function engagementSignal(lead: Lead): { points: number; label: string; reason: string } {
  const activityCount = lead.activity_log?.length || 0;
  const visitCount = lead.site_visits?.length || 0;
  const callbackCount = lead.callback_requests?.length || 0;
  const interestedCount = lead.interested_properties?.length || 0;
  const rawPoints = Math.min(12, activityCount * 2 + visitCount * 4 + callbackCount * 2 + Math.min(2, interestedCount));
  const label = `${activityCount} activity log${activityCount === 1 ? '' : 's'}, ${visitCount} site visit${visitCount === 1 ? '' : 's'}`;

  if (rawPoints >= 10) {
    return { points: rawPoints, label, reason: 'Strong engagement history makes this buyer easier to activate.' };
  }
  if (rawPoints >= 5) {
    return { points: rawPoints, label, reason: 'Buyer has some engagement history already recorded in CRM.' };
  }
  return { points: rawPoints, label, reason: 'Limited engagement history means sales may need more qualification.' };
}

function buildBuyerResult(lead: Lead, match: MatchResult, unitLabel?: string): BestBuyerResult {
  const urgency = inferUrgency(lead);
  const stage = statusSignal(lead.status);
  const recency = recencySignal(lead);
  const engagement = engagementSignal(lead);
  const totalScore = clampScore(
    match.score * 0.62
    + urgency.points
    + stage.points
    + recency.points
    + engagement.points
  );

  return {
    leadId: lead.id,
    leadName: lead.raw_data.lead_name || 'Unnamed lead',
    phone: lead.raw_data.phone || '',
    email: lead.raw_data.email || '',
    source: lead.source || 'Unknown',
    status: lead.status,
    totalScore,
    baseMatchScore: match.score,
    reasons: [
      ...match.reasons,
      urgency.reason,
      stage.reason,
      recency.reason,
      engagement.reason,
    ],
    matchedUnitCount: match.matchedUnitCount,
    bestPrice: match.bestPrice,
    distanceKm: match.distanceKm,
    urgencyLabel: urgency.label,
    urgencyPoints: urgency.points,
    stagePoints: stage.points,
    recencyPoints: recency.points,
    engagementPoints: engagement.points,
    engagementLabel: engagement.label,
    lastTouchMs: recency.lastTouchMs,
    unitLabel,
  };
}

function sortBestBuyers(a: BestBuyerResult, b: BestBuyerResult): number {
  const scoreDiff = b.totalScore - a.totalScore;
  if (scoreDiff !== 0) return scoreDiff;

  const touchDiff = b.lastTouchMs - a.lastTouchMs;
  if (touchDiff !== 0) return touchDiff;

  return b.baseMatchScore - a.baseMatchScore;
}

export function rankBestBuyersForProject(
  project: Project,
  projectUnits: InventoryUnit[],
  leads: Lead[],
  thresholdPercent: number,
  limit = 12,
): BestBuyerResult[] {
  return leads
    .filter(lead => ACTIVE_BUYER_STATUSES.has(lead.status))
    .map(lead => {
      const effectiveThreshold = lead.match_threshold ?? thresholdPercent;
      const match = computeMatches(lead, projectUnits, [project], effectiveThreshold)
        .find(candidate => candidate.projectId === project.id);
      return match ? buildBuyerResult(lead, match) : null;
    })
    .filter((buyer): buyer is BestBuyerResult => buyer !== null)
    .sort(sortBestBuyers)
    .slice(0, limit);
}

export function rankBestBuyersForUnit(
  project: Project,
  unit: InventoryUnit,
  leads: Lead[],
  thresholdPercent: number,
  limit = 10,
): BestBuyerResult[] {
  const unitLabel = String(unit.fields?.unit_number || unit.fields?.plot_number || unit.id.slice(-6).toUpperCase());

  return leads
    .filter(lead => ACTIVE_BUYER_STATUSES.has(lead.status))
    .map(lead => {
      const effectiveThreshold = lead.match_threshold ?? thresholdPercent;
      const match = computeMatches(lead, [unit], [project], effectiveThreshold)[0];
      return match ? buildBuyerResult(lead, match, unitLabel) : null;
    })
    .filter((buyer): buyer is BestBuyerResult => buyer !== null)
    .sort(sortBestBuyers)
    .slice(0, limit);
}

function escapeCsv(value: string | number): string {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildBestBuyerCallListCsv(projectName: string, buyers: BestBuyerResult[]): string {
  const header = [
    'Rank',
    'Lead Name',
    'Phone',
    'Email',
    'Status',
    'Total Score',
    'Base Match Score',
    'Urgency',
    'Source',
    'Best Price',
    'Matched Units',
    'Why This Buyer',
    'Project',
  ];

  const rows = buyers.map((buyer, index) => ([
    index + 1,
    buyer.leadName,
    buyer.phone,
    buyer.email,
    buyer.status,
    buyer.totalScore,
    buyer.baseMatchScore,
    buyer.urgencyLabel,
    buyer.source,
    buyer.bestPrice,
    buyer.matchedUnitCount,
    buyer.reasons.slice(0, 4).join(' | '),
    projectName,
  ].map(escapeCsv).join(',')));

  return [header.join(','), ...rows].join('\n');
}
