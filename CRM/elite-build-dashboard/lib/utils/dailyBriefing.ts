import type { SLAConfig } from '@/lib/types/config';
import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import { computeInventoryIntelligence, type InventoryIntelligence } from '@/lib/utils/inventoryIntelligence';
import { computeLeadIntelligence } from '@/lib/utils/leadIntelligence';
import { computeLeadSLA } from '@/lib/utils/leadSla';

export type DailyBriefingSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface DailyBriefingItem {
  id: string;
  leadId?: string;
  projectId?: string;
  title: string;
  detail: string;
  owner?: string;
  meta?: string;
  score?: number;
  value?: number;
  severity: DailyBriefingSeverity;
  actionHref?: string;
  actionLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export interface DailyBriefing {
  generatedAt: string;
  summary: {
    hotLeadCount: number;
    overdueActionCount: number;
    newMatchCount: number;
    inventoryOpportunityCount: number;
    blockedRevenueValue: number;
  };
  hotLeads: DailyBriefingItem[];
  overdueActions: DailyBriefingItem[];
  newMatches: DailyBriefingItem[];
  inventoryOpportunities: DailyBriefingItem[];
  blockedRevenue: DailyBriefingItem[];
}

const OPEN_STATUSES = new Set(['New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit', 'Booked']);
const RECENT_MATCH_HOURS = 48;

function timestampToMs(value: Lead['created_at'] | string | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value.toDate?.().getTime?.() ?? null;
}

function budgetValue(lead: Lead): number {
  const value = Number(lead.raw_data?.budget || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function leadName(lead: Lead): string {
  return lead.raw_data?.lead_name?.trim() || 'Unnamed lead';
}

function userNameByUid(users: CRMUser[]): Map<string, string> {
  return new Map(users.map(user => [user.uid, user.name || user.email || user.uid]));
}

function ownerName(lead: Lead, usersByUid: Map<string, string>): string {
  return lead.assigned_to ? usersByUid.get(lead.assigned_to) || 'Assigned user' : 'Unassigned';
}

function leadHref(lead: Lead): string {
  return `/?leadId=${encodeURIComponent(lead.id)}`;
}

function projectHref(projectId: string): string {
  return `/projects?id=${encodeURIComponent(projectId)}`;
}

function topMatch(lead: Lead) {
  return [...(lead.interested_properties || [])]
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0] || null;
}

function leadMatchTimeMs(lead: Lead): number | null {
  const propertyTimes = (lead.interested_properties || [])
    .map(property => timestampToMs(property.tagged_at))
    .filter((value): value is number => value !== null);
  const matchedAt = timestampToMs(lead.matched_at);
  return Math.max(0, matchedAt || 0, ...propertyTimes) || null;
}

function severityRank(severity: DailyBriefingSeverity): number {
  switch (severity) {
    case 'critical': return 0;
    case 'warning': return 1;
    case 'success': return 2;
    default: return 3;
  }
}

interface DailyBriefingOptions {
  leads: Lead[];
  users?: CRMUser[];
  inventoryIntelligence?: InventoryIntelligence;
  slaConfig: SLAConfig;
  selectedUid?: string;
  now?: Date;
}

export function computeDailyBriefing({
  leads,
  users = [],
  inventoryIntelligence = computeInventoryIntelligence([], leads),
  slaConfig,
  selectedUid,
  now = new Date(),
}: DailyBriefingOptions): DailyBriefing {
  const visibleLeads = selectedUid ? leads.filter(lead => lead.assigned_to === selectedUid) : leads;
  const openLeads = visibleLeads.filter(lead => OPEN_STATUSES.has(lead.status));
  const usersByUid = userNameByUid(users);
  const nowMs = now.getTime();

  const scoredLeads = openLeads.map(lead => ({
    lead,
    intelligence: computeLeadIntelligence(lead, now),
    sla: computeLeadSLA(lead, slaConfig, now),
    value: budgetValue(lead),
  }));

  const hotLeads = scoredLeads
    .filter(item => item.intelligence.temperature === 'Hot' || item.intelligence.score >= 78)
    .sort((a, b) => b.intelligence.score - a.intelligence.score || b.value - a.value)
    .slice(0, 5)
    .map(({ lead, intelligence, value }): DailyBriefingItem => ({
      id: `hot-${lead.id}`,
      leadId: lead.id,
      title: leadName(lead),
      detail: intelligence.nextBestAction,
      owner: ownerName(lead, usersByUid),
      meta: `${lead.status} · ${intelligence.temperature}`,
      score: intelligence.score,
      value,
      severity: 'success',
      actionHref: leadHref(lead),
      actionLabel: 'Open lead',
    }));

  const overdueActions = scoredLeads
    .filter(item => item.sla.alerts.length > 0)
    .sort((a, b) => severityRank(a.sla.highestSeverity === 'critical' ? 'critical' : 'warning') - severityRank(b.sla.highestSeverity === 'critical' ? 'critical' : 'warning') || b.value - a.value)
    .slice(0, 5)
    .map(({ lead, sla, intelligence, value }): DailyBriefingItem => {
      const alert = sla.alerts[0];
      return {
        id: `sla-${lead.id}-${alert.id}`,
        leadId: lead.id,
        title: `${leadName(lead)}: ${alert.label}`,
        detail: `${alert.detail} ${intelligence.nextBestAction}`,
        owner: ownerName(lead, usersByUid),
        meta: lead.status,
        score: intelligence.score,
        value,
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        actionHref: leadHref(lead),
        actionLabel: 'Open lead',
      };
    });

  const newMatches = scoredLeads
    .map(item => ({ ...item, match: topMatch(item.lead), matchTimeMs: leadMatchTimeMs(item.lead) }))
    .filter(item => item.match && item.matchTimeMs !== null && nowMs - item.matchTimeMs <= RECENT_MATCH_HOURS * 60 * 60 * 1000)
    .sort((a, b) => (b.match?.matchScore || 0) - (a.match?.matchScore || 0) || (b.matchTimeMs || 0) - (a.matchTimeMs || 0))
    .slice(0, 5)
    .map(({ lead, match, intelligence, value }): DailyBriefingItem => ({
      id: `match-${lead.id}-${match?.projectId || 'project'}`,
      leadId: lead.id,
      projectId: match?.projectId,
      title: `${leadName(lead)} matched with ${match?.projectName || 'a project'}`,
      detail: intelligence.nextBestAction,
      owner: ownerName(lead, usersByUid),
      meta: `${match?.location || 'Location pending'} · ${match?.matchScore || intelligence.score}/100 fit`,
      score: match?.matchScore || intelligence.score,
      value,
      severity: 'info',
      actionHref: leadHref(lead),
      actionLabel: 'Open lead',
      secondaryHref: match?.projectId ? projectHref(match.projectId) : undefined,
      secondaryLabel: match?.projectId ? 'Open project' : undefined,
    }));

  const projectOpportunities = inventoryIntelligence.projectsNeedingPush.slice(0, 4).map(project => ({
    id: `inventory-${project.projectId}`,
    projectId: project.projectId,
    title: project.projectName,
    detail: project.recommendation,
    meta: `${project.availableUnits} available · ${project.bestBuyerCount} buyers`,
    score: project.healthScore,
    value: project.availableValue,
    severity: project.staleAvailableUnits > 0 || project.bestBuyerCount === 0 ? 'warning' as const : 'info' as const,
    actionHref: projectHref(project.projectId),
    actionLabel: 'Open project',
  }));

  const demandGaps = [
    ...inventoryIntelligence.demandSupplyByLocation,
    ...inventoryIntelligence.demandSupplyByType,
    ...inventoryIntelligence.demandSupplyByBudget,
  ]
    .filter(item => item.demand > item.supply)
    .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply))
    .slice(0, Math.max(0, 5 - projectOpportunities.length))
    .map(item => ({
      id: `demand-gap-${item.key}`,
      title: `Demand gap: ${item.label}`,
      detail: 'Buyer demand is ahead of available supply. Review matching projects or campaign focus.',
      meta: `Demand ${item.demand} · Supply ${item.supply}`,
      score: item.demand - item.supply,
      severity: 'info' as const,
      actionHref: '/projects',
      actionLabel: 'Review projects',
    }));

  const inventoryOpportunities = [...projectOpportunities, ...demandGaps];

  const blockedRevenueCandidates = scoredLeads
    .map(item => {
      const blockers: string[] = [];
      if (!item.lead.assigned_to) blockers.push('unassigned');
      if (item.sla.highestSeverity === 'critical') blockers.push('critical SLA');
      if ((item.lead.objections || []).length > 0) blockers.push('buyer objection');
      if (item.lead.status === 'Booked') blockers.push('booking not closed');
      return { ...item, blockers };
    })
    .filter(item => item.blockers.length > 0)
    .sort((a, b) => b.value - a.value || severityRank(a.sla.highestSeverity === 'critical' ? 'critical' : 'warning') - severityRank(b.sla.highestSeverity === 'critical' ? 'critical' : 'warning'))
    .slice(0, 5);

  const blockedRevenue = blockedRevenueCandidates.map(({ lead, blockers, intelligence, value }): DailyBriefingItem => ({
    id: `blocked-${lead.id}`,
    leadId: lead.id,
    title: leadName(lead),
    detail: `${blockers.join(', ')}. ${intelligence.nextBestAction}`,
    owner: ownerName(lead, usersByUid),
    meta: lead.status,
    score: intelligence.score,
    value,
    severity: blockers.includes('critical SLA') ? 'critical' : 'warning',
    actionHref: leadHref(lead),
    actionLabel: 'Open lead',
  }));

  return {
    generatedAt: now.toISOString(),
    summary: {
      hotLeadCount: hotLeads.length,
      overdueActionCount: overdueActions.length,
      newMatchCount: newMatches.length,
      inventoryOpportunityCount: inventoryOpportunities.length,
      blockedRevenueValue: blockedRevenueCandidates.reduce((sum, item) => sum + item.value, 0),
    },
    hotLeads,
    overdueActions,
    newMatches,
    inventoryOpportunities,
    blockedRevenue,
  };
}
