import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { DEFAULT_SLA_CONFIG } from '@/lib/types/config';
import type { InventoryIntelligence } from '@/lib/utils/inventoryIntelligence';
import type { Lead } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import { computeDailyBriefing } from '@/lib/utils/dailyBriefing';

const NOW = new Date('2026-04-28T10:00:00.000Z');
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

const user: CRMUser = {
  uid: 'sales_1',
  email: 'sales@example.com',
  name: 'Sales One',
  role: 'sales_exec',
  active: true,
  created_at: ts('2026-01-01T00:00:00.000Z'),
};

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id || 'lead_1',
    status: overrides.status || 'Property Matched',
    source: 'Meta Ads',
    assigned_to: 'sales_1',
    created_at: overrides.created_at ?? ts('2026-04-28T08:00:00.000Z'),
    raw_data: {
      lead_name: 'Asha Buyer',
      phone: '9999999999',
      email: '',
      budget: 95_00_000,
      plan_to_buy: 'Immediately',
      profession: '',
      location: 'Mysuru',
      note: '',
      pref_facings: [],
      interest: 'Villa',
      interests: ['Villa'],
      ...(overrides.raw_data || {}),
    },
    activity_log: [
      { id: 'call_1', type: 'call', text: 'Called', author: 'Sales One', created_at: '2026-04-28T08:15:00.000Z' },
      { id: 'sent_1', type: 'property_details_sent', text: 'Sent details', author: 'Sales One', created_at: '2026-04-28T08:20:00.000Z' },
    ],
    interested_properties: [{
      projectId: 'project_1',
      projectName: 'Rare Earth',
      location: 'Mysuru',
      propertyType: 'Villa',
      tagged_at: '2026-04-28T08:30:00.000Z',
      tagged_by: 'system-match',
      matchScore: 91,
    }],
    ...overrides,
  };
}

const inventoryIntelligence: InventoryIntelligence = {
  totalUnits: 3,
  availableUnits: 2,
  bookedUnits: 1,
  soldUnits: 0,
  availableValue: 1_80_00_000,
  staleAvailableUnits: 1,
  projectsNeedingPush: [{
    projectId: 'project_1',
    projectName: 'Rare Earth',
    propertyType: 'Villa',
    totalUnits: 3,
    availableUnits: 2,
    bookedUnits: 1,
    soldUnits: 0,
    availableValue: 1_80_00_000,
    bestBuyerCount: 0,
    staleAvailableUnits: 1,
    healthScore: 25,
    recommendation: 'Stale available inventory. Prioritize refreshed creative, pricing review, or buyer call list.',
  }],
  healthiestProjects: [],
  demandSupplyByType: [{ key: 'Villa', label: 'Villa', demand: 4, supply: 2 }],
  demandSupplyByBudget: [],
  demandSupplyByLocation: [],
};

describe('computeDailyBriefing', () => {
  it('builds a deterministic briefing from hot leads, matches, and inventory', () => {
    const result = computeDailyBriefing({
      leads: [lead()],
      users: [user],
      inventoryIntelligence,
      slaConfig: DEFAULT_SLA_CONFIG,
      now: NOW,
    });

    expect(result.summary.hotLeadCount).toBe(1);
    expect(result.summary.newMatchCount).toBe(1);
    expect(result.summary.inventoryOpportunityCount).toBeGreaterThan(0);
    expect(result.hotLeads[0]).toMatchObject({
      leadId: 'lead_1',
      title: 'Asha Buyer',
      owner: 'Sales One',
      severity: 'success',
      actionHref: '/?leadId=lead_1',
      actionLabel: 'Open lead',
    });
    expect(result.newMatches[0]).toMatchObject({
      projectId: 'project_1',
      secondaryHref: '/projects?id=project_1',
      secondaryLabel: 'Open project',
    });
    expect(result.newMatches[0].title).toContain('Rare Earth');
    expect(result.inventoryOpportunities[0]).toMatchObject({
      title: 'Rare Earth',
      actionHref: '/projects?id=project_1',
      actionLabel: 'Open project',
    });
  });

  it('prioritizes overdue actions and blocked revenue', () => {
    const staleLead = lead({
      id: 'stale',
      assigned_to: null,
      created_at: ts('2026-04-20T08:00:00.000Z'),
      raw_data: {
        ...lead().raw_data,
        lead_name: 'Blocked Buyer',
        budget: 1_20_00_000,
      },
      activity_log: [],
      interested_properties: [],
    });

    const result = computeDailyBriefing({
      leads: [staleLead],
      users: [user],
      inventoryIntelligence,
      slaConfig: DEFAULT_SLA_CONFIG,
      now: NOW,
    });

    expect(result.overdueActions[0]).toMatchObject({
      leadId: 'stale',
      severity: 'critical',
      actionHref: '/?leadId=stale',
    });
    expect(result.blockedRevenue[0]).toMatchObject({
      leadId: 'stale',
      owner: 'Unassigned',
      actionHref: '/?leadId=stale',
    });
    expect(result.summary.blockedRevenueValue).toBe(1_20_00_000);
  });

  it('scopes briefing to the selected assignee', () => {
    const result = computeDailyBriefing({
      leads: [
        lead({ id: 'selected', assigned_to: 'sales_1' }),
        lead({ id: 'other', assigned_to: 'sales_2' }),
      ],
      users: [user],
      inventoryIntelligence,
      slaConfig: DEFAULT_SLA_CONFIG,
      selectedUid: 'sales_1',
      now: NOW,
    });

    expect(result.hotLeads.map(item => item.leadId)).toEqual(['selected']);
  });
});
