import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead, LeadRawData } from '@/lib/types/lead';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { Project } from '@/lib/types/project';
import {
  resolveInterests,
  resolveBHK,
  computeMatches,
  diagnoseMatches,
} from '@/lib/utils/propertyMatcher';

// ==================== Test helpers ====================

function makeRaw(overrides: Partial<LeadRawData> = {}): LeadRawData {
  return {
    lead_name: 'Test',
    phone: '111',
    email: 'a@b',
    budget: 0,
    plan_to_buy: 'x',
    profession: 'x',
    location: 'x',
    note: '',
    pref_facings: [],
    interest: 'General Query',
    ...overrides,
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? 'l1',
    status: overrides.status ?? 'New',
    source: overrides.source ?? 'Manual',
    created_at: overrides.created_at ?? Timestamp.fromMillis(1_000),
    raw_data: overrides.raw_data ?? makeRaw(),
    ...overrides,
  };
}

function makeUnit(overrides: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: overrides.id ?? 'u1',
    projectId: overrides.projectId ?? 'p1',
    projectName: overrides.projectName ?? 'Project One',
    location: overrides.location ?? 'Bangalore',
    propertyType: overrides.propertyType ?? 'Plot',
    status: overrides.status ?? 'Available',
    price: overrides.price ?? 5_000_000,
    fields: overrides.fields ?? {},
  } as InventoryUnit;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Project One',
    location: overrides.location ?? 'Bangalore',
    propertyType: overrides.propertyType ?? 'Plot',
    status: overrides.status ?? 'Active',
    ...overrides,
  } as Project;
}

// ==================== resolveInterests ====================

describe('resolveInterests', () => {
  it('returns new interests array when present and non-empty', () => {
    expect(resolveInterests(makeRaw({ interests: ['Plot', 'Villa'] }))).toEqual(['Plot', 'Villa']);
  });

  it('falls back to legacy interest string when interests is absent', () => {
    expect(resolveInterests(makeRaw({ interest: 'Apartment' }))).toEqual(['Apartment']);
  });

  it('falls back to legacy interest when interests is empty array', () => {
    expect(resolveInterests(makeRaw({ interests: [], interest: 'Villa' }))).toEqual(['Villa']);
  });

  it('ignores the "General Query" sentinel (not a real interest)', () => {
    // Pins a subtle behavior: CSV-imported leads get interest='General Query'
    // as the default when no interest was specified. The matcher must not treat
    // that as a real property-type signal, otherwise no real inventory would match.
    expect(resolveInterests(makeRaw({ interest: 'General Query' }))).toEqual([]);
  });

  it('returns empty array when both fields are missing', () => {
    expect(resolveInterests(makeRaw({ interest: '' }))).toEqual([]);
  });

  it('prefers interests[] even if interest is also set', () => {
    expect(resolveInterests(makeRaw({ interests: ['Plot'], interest: 'Villa' }))).toEqual(['Plot']);
  });
});

// ==================== resolveBHK ====================

describe('resolveBHK', () => {
  it('returns the bhk number when set and positive', () => {
    expect(resolveBHK(makeRaw({ bhk: 3 }))).toBe(3);
  });

  it('returns null when bhk is 0 (sentinel: not set)', () => {
    expect(resolveBHK(makeRaw({ bhk: 0 }))).toBeNull();
  });

  it('returns null when bhk is undefined', () => {
    expect(resolveBHK(makeRaw())).toBeNull();
  });

  it('returns null when bhk is negative (defensive)', () => {
    expect(resolveBHK(makeRaw({ bhk: -1 }))).toBeNull();
  });
});

// ==================== computeMatches: early-exit guards ====================

describe('computeMatches — lead-level guards', () => {
  it('returns empty when lead has no interests', () => {
    const lead = makeLead({ raw_data: makeRaw({ budget: 1_000_000 }) });
    const units = [makeUnit()];
    expect(computeMatches(lead, units, [], 10)).toEqual([]);
  });

  it('returns empty when lead has zero budget', () => {
    const lead = makeLead({ raw_data: makeRaw({ interests: ['Plot'], budget: 0 }) });
    expect(computeMatches(lead, [makeUnit()], [], 10)).toEqual([]);
  });

  it('returns empty when budget is negative', () => {
    const lead = makeLead({ raw_data: makeRaw({ interests: ['Plot'], budget: -500_000 }) });
    expect(computeMatches(lead, [makeUnit()], [], 10)).toEqual([]);
  });

  it('returns empty when inventory is empty (no crash)', () => {
    const lead = makeLead({ raw_data: makeRaw({ interests: ['Plot'], budget: 1_000_000 }) });
    expect(computeMatches(lead, [], [], 10)).toEqual([]);
  });
});

// ==================== computeMatches: per-unit filters ====================

describe('computeMatches — per-unit filters', () => {
  const lead = makeLead({
    raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
  });

  it('excludes units whose propertyType is not in lead interests', () => {
    const units = [
      makeUnit({ id: 'u1', propertyType: 'Apartment', price: 3_000_000 }),
      makeUnit({ id: 'u2', propertyType: 'Plot', price: 3_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results).toHaveLength(1);
    expect(results[0].propertyType).toBe('Plot');
  });

  it('excludes non-Available units', () => {
    const units = [
      makeUnit({ id: 'u1', status: 'Booked', price: 3_000_000 }),
      makeUnit({ id: 'u2', projectId: 'p2', projectName: 'P2', status: 'Available', price: 3_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results.map(r => r.projectId)).toEqual(['p2']);
  });

  it('excludes units with zero or negative price', () => {
    const units = [
      makeUnit({ id: 'u1', price: 0 }),
      makeUnit({ id: 'u2', price: -100 }),
      makeUnit({ id: 'u3', projectId: 'p3', price: 3_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results.map(r => r.projectId)).toEqual(['p3']);
  });

  it('excludes units above the budget ceiling (budget × (1 + threshold%))', () => {
    // budget 5M, threshold 10% → ceiling 5.5M
    const units = [
      makeUnit({ id: 'u1', price: 5_500_001 }),   // just over ceiling — excluded
      makeUnit({ id: 'u2', price: 5_500_000 }),   // exactly at ceiling — included
      makeUnit({ id: 'u3', price: 4_000_000 }),   // under — included
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results).toHaveLength(1); // same project, different units
    expect(results[0].matchedUnitCount).toBe(2);
    expect(results[0].bestPrice).toBe(4_000_000);
  });

  it('threshold 0 means ceiling equals budget exactly', () => {
    const units = [
      makeUnit({ id: 'u1', price: 5_000_001 }),   // over — excluded
      makeUnit({ id: 'u2', price: 5_000_000 }),   // at budget — included
    ];
    const results = computeMatches(lead, units, [], 0);
    expect(results).toHaveLength(1);
    expect(results[0].matchedUnitCount).toBe(1);
  });

  it('excludes units whose projectId is in the lead dismissed_matches list', () => {
    const leadWithDismissal = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
      dismissed_matches: ['p1'],
    });
    const units = [
      makeUnit({ id: 'u1', projectId: 'p1' }),    // dismissed — excluded
      makeUnit({ id: 'u2', projectId: 'p2', projectName: 'P2' }),
    ];
    const results = computeMatches(leadWithDismissal, units, [], 10);
    expect(results.map(r => r.projectId)).toEqual(['p2']);
  });
});

// ==================== computeMatches: BHK non-negotiable gate ====================

describe('computeMatches — BHK non-negotiable for Villa/Apartment/Individual House', () => {
  const bhkTypes = ['Apartment', 'Villa', 'Individual House'] as const;

  it.each(bhkTypes)('excludes %s units below lead BHK requirement', (propertyType) => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: [propertyType], budget: 5_000_000, bhk: 3 }),
    });
    const units = [
      makeUnit({ id: 'u1', propertyType, price: 3_000_000, fields: { bhk: 2 } }),  // below — excluded
      makeUnit({ id: 'u2', propertyType, price: 3_000_000, fields: { bhk: 3 }, projectId: 'p2', projectName: 'P2' }),  // match
      makeUnit({ id: 'u3', propertyType, price: 3_000_000, fields: { bhk: 4 }, projectId: 'p3', projectName: 'P3' }),  // above requirement — included
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results.map(r => r.projectId).sort()).toEqual(['p2', 'p3']);
  });

  it('does NOT gate on BHK for Plot properties (even if lead specified bhk)', () => {
    // Leads can set bhk even when also interested in plots. The BHK gate must
    // not apply to plots — plots don't have a BHK concept.
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000, bhk: 3 }),
    });
    const units = [
      makeUnit({ id: 'u1', propertyType: 'Plot', price: 3_000_000, fields: {} }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results).toHaveLength(1);
  });

  it('treats unit with missing bhk field as 0 (below any lead BHK requirement)', () => {
    // Pins that Apartment/Villa units without bhk field don't accidentally match
    // a lead that set BHK = 2. A missing bhk is a data-quality issue; better to
    // under-match than mis-match.
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Apartment'], budget: 5_000_000, bhk: 2 }),
    });
    const units = [makeUnit({ propertyType: 'Apartment', price: 3_000_000, fields: {} })];
    expect(computeMatches(lead, units, [], 10)).toEqual([]);
  });

  it('when lead BHK not set, BHK gate is skipped entirely', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Apartment'], budget: 5_000_000 }),
    });
    const units = [
      makeUnit({ propertyType: 'Apartment', price: 3_000_000, fields: { bhk: 1 } }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results).toHaveLength(1);
  });
});

// ==================== computeMatches: grouping + aggregation ====================

describe('computeMatches — project grouping', () => {
  const lead = makeLead({
    raw_data: makeRaw({ interests: ['Plot'], budget: 10_000_000 }),
  });

  it('groups multiple matching units from the same project', () => {
    const units = [
      makeUnit({ id: 'u1', projectId: 'p1', price: 5_000_000 }),
      makeUnit({ id: 'u2', projectId: 'p1', price: 4_000_000 }),
      makeUnit({ id: 'u3', projectId: 'p1', price: 6_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results).toHaveLength(1);
    expect(results[0].matchedUnitCount).toBe(3);
    expect(results[0].bestPrice).toBe(4_000_000);
  });

  it('produces one result per project', () => {
    const units = [
      makeUnit({ id: 'u1', projectId: 'p1', projectName: 'Alpha', price: 5_000_000 }),
      makeUnit({ id: 'u2', projectId: 'p2', projectName: 'Beta',  price: 6_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results.map(r => r.projectId).sort()).toEqual(['p1', 'p2']);
  });

  it('prefers project document fields when available, falls back to unit fields', () => {
    const units = [
      makeUnit({ id: 'u1', projectId: 'p1', projectName: 'Stale Name From Unit', location: 'Stale Loc', price: 5_000_000 }),
    ];
    const projects = [makeProject({ id: 'p1', name: 'Fresh Project Name', location: 'Fresh Loc' })];
    const results = computeMatches(lead, units, projects, 10);
    expect(results[0].projectName).toBe('Fresh Project Name');
    expect(results[0].location).toBe('Fresh Loc');
  });

  it('uses unit-level fallback when project is not in the projects list', () => {
    const units = [
      makeUnit({ id: 'u1', projectId: 'orphan', projectName: 'Unit Fallback', location: 'Somewhere', price: 5_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results[0].projectName).toBe('Unit Fallback');
    expect(results[0].location).toBe('Somewhere');
  });

  it('uses "Unknown" when both project and unit name are missing', () => {
    const units = [
      makeUnit({ id: 'u1', projectId: 'orphan', projectName: '', price: 5_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results[0].projectName).toBe('Unknown');
  });
});

// ==================== computeMatches: distance + sorting ====================

describe('computeMatches — distance sorting', () => {
  it('attaches haversine distance when both lead and project have geo', () => {
    const lead = makeLead({
      raw_data: makeRaw({
        interests: ['Plot'],
        budget: 10_000_000,
        geo: { lat: 12.9716, lng: 77.5946 }, // Bangalore
      }),
    });
    const units = [makeUnit({ projectId: 'p1', price: 5_000_000 })];
    const projects = [makeProject({ id: 'p1', geo: { lat: 13.0827, lng: 80.2707 } })]; // Chennai, ~290km
    const results = computeMatches(lead, units, projects, 10);
    expect(results[0].distanceKm).toBeDefined();
    expect(results[0].distanceKm).toBeGreaterThan(250);
    expect(results[0].distanceKm).toBeLessThan(310);
  });

  it('returns distanceKm undefined when lead has no geo', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 10_000_000 }),
    });
    const projects = [makeProject({ geo: { lat: 13, lng: 80 } })];
    const results = computeMatches(lead, [makeUnit({ price: 5_000_000 })], projects, 10);
    expect(results[0].distanceKm).toBeUndefined();
  });

  it('returns distanceKm undefined when project has no geo', () => {
    const lead = makeLead({
      raw_data: makeRaw({
        interests: ['Plot'],
        budget: 10_000_000,
        geo: { lat: 13, lng: 80 },
      }),
    });
    const results = computeMatches(lead, [makeUnit({ price: 5_000_000 })], [makeProject()], 10);
    expect(results[0].distanceKm).toBeUndefined();
  });

  it('sorts by proximity when distance difference > 1km', () => {
    const lead = makeLead({
      raw_data: makeRaw({
        interests: ['Plot'],
        budget: 20_000_000,
        geo: { lat: 12.9716, lng: 77.5946 },
      }),
    });
    const units = [
      makeUnit({ id: 'u1', projectId: 'far', projectName: 'Far', price: 1_000_000 }),    // cheaper but far
      makeUnit({ id: 'u2', projectId: 'near', projectName: 'Near', price: 5_000_000 }),  // pricier but near
    ];
    const projects = [
      makeProject({ id: 'far', geo: { lat: 13.0827, lng: 80.2707 } }),    // Chennai
      makeProject({ id: 'near', geo: { lat: 12.9800, lng: 77.6000 } }),   // near Bangalore
    ];
    const results = computeMatches(lead, units, projects, 10);
    expect(results.map(r => r.projectId)).toEqual(['near', 'far']);
  });

  it('falls back to price when distance difference ≤ 1km', () => {
    const lead = makeLead({
      raw_data: makeRaw({
        interests: ['Plot'],
        budget: 10_000_000,
        geo: { lat: 12.9716, lng: 77.5946 },
      }),
    });
    const units = [
      makeUnit({ id: 'u1', projectId: 'a', projectName: 'A', price: 5_000_000 }),
      makeUnit({ id: 'u2', projectId: 'b', projectName: 'B', price: 3_000_000 }),
    ];
    // Two projects essentially colocated
    const projects = [
      makeProject({ id: 'a', geo: { lat: 12.9716, lng: 77.5946 } }),
      makeProject({ id: 'b', geo: { lat: 12.9720, lng: 77.5950 } }),
    ];
    const results = computeMatches(lead, units, projects, 10);
    // Same neighborhood → cheaper one wins
    expect(results[0].projectId).toBe('b');
  });

  it('sorts by price when neither project has geo (no distance)', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 10_000_000 }),
    });
    const units = [
      makeUnit({ id: 'u1', projectId: 'a', projectName: 'A', price: 5_000_000 }),
      makeUnit({ id: 'u2', projectId: 'b', projectName: 'B', price: 3_000_000 }),
    ];
    const results = computeMatches(lead, units, [], 10);
    expect(results.map(r => r.projectId)).toEqual(['b', 'a']);
  });
});

// ==================== computeMatches: score + reasons ====================

describe('computeMatches — explainable score', () => {
  it('attaches a 0-100 score and human-readable reasons to each match', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Villa'], budget: 8_000_000, bhk: 3 }),
    });
    const units = [
      makeUnit({ propertyType: 'Villa', price: 7_500_000, fields: { bhk: 3 } }),
    ];
    const results = computeMatches(lead, units, [], 20);

    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[0].score).toBeLessThanOrEqual(100);
    expect(results[0].reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/Property type matches/),
      expect.stringMatching(/available unit/),
      expect.stringMatching(/within budget/),
      expect.stringMatching(/3 BHK/),
    ]));
  });

  it('penalizes a price-stretched match that only fits through the threshold', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
    });
    const units = [
      makeUnit({ id: 'u1', projectId: 'within', projectName: 'Within', price: 5_000_000 }),
      makeUnit({ id: 'u2', projectId: 'stretch', projectName: 'Stretch', price: 5_950_000 }),
    ];
    const results = computeMatches(lead, units, [], 20);
    const within = results.find(r => r.projectId === 'within')!;
    const stretch = results.find(r => r.projectId === 'stretch')!;

    expect(within.score).toBeGreaterThan(stretch.score);
    expect(stretch.reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/within \+20% ceiling/),
    ]));
  });

  it('uses score before distance only when the score gap is meaningful', () => {
    const lead = makeLead({
      raw_data: makeRaw({
        interests: ['Plot'],
        budget: 10_000_000,
        geo: { lat: 12.9716, lng: 77.5946 },
      }),
    });
    const units = [
      makeUnit({ id: 'u1', projectId: 'near-stretch', projectName: 'Near Stretch', price: 11_900_000 }),
      makeUnit({ id: 'u2', projectId: 'far-budget', projectName: 'Far Budget', price: 8_000_000 }),
    ];
    const projects = [
      makeProject({ id: 'near-stretch', geo: { lat: 12.9720, lng: 77.5950 } }),
      makeProject({ id: 'far-budget', geo: { lat: 13.0827, lng: 80.2707 } }),
    ];
    const results = computeMatches(lead, units, projects, 20);

    expect(results[0].projectId).toBe('far-budget');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});

// ==================== diagnoseMatches ====================

describe('diagnoseMatches — eligible lead', () => {
  it('reports leadOk=true for a new lead with interests and budget', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
    });
    const d = diagnoseMatches(lead, [], [], 10);
    expect(d.leadOk).toBe(true);
    expect(d.leadReason).toBe('OK');
    expect(d.interests).toEqual(['Plot']);
    expect(d.budget).toBe(5_000_000);
    expect(d.maxPrice).toBe(5_500_000);
  });

  it('computes matchCount across all units', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
    });
    const units = [
      makeUnit({ id: 'u1', price: 3_000_000 }),                                 // match
      makeUnit({ id: 'u2', price: 3_000_000, status: 'Booked' }),               // reject — status
      makeUnit({ id: 'u3', propertyType: 'Villa', price: 3_000_000 }),          // reject — type
    ];
    const d = diagnoseMatches(lead, units, [], 10);
    expect(d.matchCount).toBe(1);
    expect(d.units).toHaveLength(3);
  });
});

describe('diagnoseMatches — ineligible lead reasons', () => {
  it('rejects lead with non-eligible status', () => {
    const lead = makeLead({
      status: 'Booked',
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
    });
    const d = diagnoseMatches(lead, [], [], 10);
    expect(d.leadOk).toBe(false);
    expect(d.leadReason).toMatch(/status "Booked"/);
  });

  it('rejects lead with no interests', () => {
    const lead = makeLead({ raw_data: makeRaw({ budget: 5_000_000 }) });
    const d = diagnoseMatches(lead, [], [], 10);
    expect(d.leadOk).toBe(false);
    expect(d.leadReason).toMatch(/no interests/i);
  });

  it('rejects lead with zero budget', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 0 }),
    });
    const d = diagnoseMatches(lead, [], [], 10);
    expect(d.leadOk).toBe(false);
    expect(d.leadReason).toMatch(/no budget/i);
  });

  it.each(['New', 'First Call', 'Nurturing', 'Property Matched'])(
    'accepts lead in eligible status "%s"',
    (status) => {
      const lead = makeLead({
        status,
        raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
      });
      const d = diagnoseMatches(lead, [], [], 10);
      expect(d.leadOk).toBe(true);
    },
  );
});

describe('diagnoseMatches — per-unit rejection reasons', () => {
  const lead = makeLead({
    raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000, bhk: 3 }),
  });

  it('explains type mismatch', () => {
    const units = [makeUnit({ propertyType: 'Villa', price: 3_000_000 })];
    const d = diagnoseMatches(lead, units, [], 10);
    expect(d.units[0].matched).toBe(false);
    expect(d.units[0].reason).toMatch(/Villa/);
    expect(d.units[0].reason).toMatch(/not in lead interests/);
  });

  it('explains non-Available status', () => {
    const units = [makeUnit({ status: 'Booked', price: 3_000_000 })];
    const d = diagnoseMatches(lead, units, [], 10);
    expect(d.units[0].reason).toMatch(/"Booked"/);
  });

  it('explains zero price', () => {
    const units = [makeUnit({ price: 0 })];
    const d = diagnoseMatches(lead, units, [], 10);
    expect(d.units[0].reason).toMatch(/no price/i);
  });

  it('explains budget ceiling exceeded', () => {
    const units = [makeUnit({ price: 10_000_000 })];
    const d = diagnoseMatches(lead, units, [], 10);
    expect(d.units[0].reason).toMatch(/exceeds ceiling/);
  });

  it('explains project dismissal', () => {
    const leadWithDismiss = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
      dismissed_matches: ['p1'],
    });
    const units = [makeUnit({ projectId: 'p1', price: 3_000_000 })];
    const d = diagnoseMatches(leadWithDismiss, units, [], 10);
    expect(d.units[0].reason).toMatch(/dismissed/i);
    expect(d.dismissedProjectIds).toEqual(['p1']);
  });

  it('explains BHK shortfall for Villa/Apartment/House', () => {
    const villaLead = makeLead({
      raw_data: makeRaw({ interests: ['Villa'], budget: 5_000_000, bhk: 4 }),
    });
    const units = [makeUnit({ propertyType: 'Villa', price: 3_000_000, fields: { bhk: 2 } })];
    const d = diagnoseMatches(villaLead, units, [], 10);
    expect(d.units[0].reason).toMatch(/BHK \(2\)/);
    expect(d.units[0].reason).toMatch(/requirement of 4/);
  });

  it('returns reason="MATCH" for units that pass every gate', () => {
    const plotLead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
    });
    const units = [makeUnit({ price: 3_000_000 })];
    const d = diagnoseMatches(plotLead, units, [], 10);
    expect(d.units[0].matched).toBe(true);
    expect(d.units[0].reason).toBe('MATCH');
  });
});

describe('diagnoseMatches — unit metadata', () => {
  it('prefers project document name over unit.projectName in diagnosis output', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Plot'], budget: 5_000_000 }),
    });
    const units = [makeUnit({ projectId: 'p1', projectName: 'Stale', price: 3_000_000 })];
    const projects = [makeProject({ id: 'p1', name: 'Fresh' })];
    const d = diagnoseMatches(lead, units, projects, 10);
    expect(d.units[0].projectName).toBe('Fresh');
  });

  it('reports unitBHK as number when set, null when missing or empty string', () => {
    const lead = makeLead({
      raw_data: makeRaw({ interests: ['Apartment'], budget: 5_000_000 }),
    });
    const units = [
      makeUnit({ id: 'u1', propertyType: 'Apartment', price: 3_000_000, fields: { bhk: 3 } }),
      makeUnit({ id: 'u2', propertyType: 'Apartment', price: 3_000_000, fields: { bhk: '' }, projectId: 'p2' }),
      makeUnit({ id: 'u3', propertyType: 'Apartment', price: 3_000_000, fields: {}, projectId: 'p3' }),
    ];
    const d = diagnoseMatches(lead, units, [], 10);
    expect(d.units[0].unitBHK).toBe(3);
    expect(d.units[1].unitBHK).toBeNull();
    expect(d.units[2].unitBHK).toBeNull();
  });
});
