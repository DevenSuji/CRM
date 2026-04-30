import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { Lead } from '@/lib/types/lead';
import { computeInventoryIntelligence } from '@/lib/utils/inventoryIntelligence';

function unit(overrides: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: 'u1',
    projectId: 'p1',
    projectName: 'Rare Earth',
    location: 'Mysuru',
    propertyType: 'Plotted Land',
    status: 'Available',
    price: 50_00_000,
    fields: {},
    created_at: Timestamp.fromDate(new Date('2026-02-01T00:00:00Z')),
    ...overrides,
  };
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    status: 'Nurturing',
    created_at: Timestamp.fromDate(new Date('2026-04-01T00:00:00Z')),
    source: 'Meta Ads',
    raw_data: {
      lead_name: 'Buyer',
      phone: '',
      email: '',
      budget: 60_00_000,
      plan_to_buy: '',
      profession: '',
      location: 'Mysuru',
      note: '',
      pref_facings: [],
      interest: 'Plotted Land',
      interests: ['Plotted Land'],
    },
    ...overrides,
  };
}

describe('computeInventoryIntelligence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('summarizes inventory counts, value, stale units, and project health', () => {
    const result = computeInventoryIntelligence([
      unit({ id: 'a', price: 40_00_000 }),
      unit({ id: 'b', status: 'Booked', price: 55_00_000 }),
      unit({ id: 'c', status: 'Sold', price: 60_00_000 }),
    ], [
      lead({
        id: 'buyer1',
        interested_properties: [{ projectId: 'p1', projectName: 'Rare Earth', location: 'Mysuru', propertyType: 'Plotted Land', tagged_at: '2026-04-20T00:00:00Z', tagged_by: 'u1' }],
      }),
    ]);

    expect(result.totalUnits).toBe(3);
    expect(result.availableUnits).toBe(1);
    expect(result.bookedUnits).toBe(1);
    expect(result.soldUnits).toBe(1);
    expect(result.availableValue).toBe(40_00_000);
    expect(result.staleAvailableUnits).toBe(1);
    expect(result.projectsNeedingPush[0]).toMatchObject({
      projectId: 'p1',
      bestBuyerCount: 1,
      staleAvailableUnits: 1,
    });
  });

  it('compares open lead demand against available inventory supply', () => {
    const result = computeInventoryIntelligence([
      unit({ id: 'plot', propertyType: 'Plotted Land', price: 45_00_000 }),
      unit({ id: 'villa', projectId: 'p2', projectName: 'Palm Grove', propertyType: 'Villa', price: 1_20_00_000, location: 'Sarjapur' }),
    ], [
      lead({ id: 'plot-buyer', raw_data: { ...lead().raw_data, interests: ['Plotted Land'], budget: 45_00_000 } }),
      lead({ id: 'villa-buyer', raw_data: { ...lead().raw_data, interest: 'Villa', interests: ['Villa'], budget: 1_30_00_000, location: '  Sarjapur  ' } }),
      lead({ id: 'closed', status: 'Closed', raw_data: { ...lead().raw_data, interests: ['Villa'], budget: 1_30_00_000 } }),
    ]);

    expect(result.demandSupplyByType.find(item => item.key === 'Plotted Land')).toMatchObject({ demand: 1, supply: 1 });
    expect(result.demandSupplyByType.find(item => item.key === 'Villa')).toMatchObject({ demand: 1, supply: 1 });
    expect(result.demandSupplyByBudget.find(item => item.key === 'under_50l')).toMatchObject({ demand: 1, supply: 1 });
    expect(result.demandSupplyByBudget.find(item => item.key === '1cr_2cr')).toMatchObject({ demand: 1, supply: 1 });
    expect(result.demandSupplyByLocation.find(item => item.key === 'Mysuru')).toMatchObject({ demand: 1, supply: 1 });
    expect(result.demandSupplyByLocation.find(item => item.key === 'Sarjapur')).toMatchObject({ demand: 1, supply: 1 });
  });
});
