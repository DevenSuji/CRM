import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead, LeadRawData } from '@/lib/types/lead';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { Project } from '@/lib/types/project';
import {
  buildBestBuyerCallListCsv,
  rankBestBuyersForProject,
  rankBestBuyersForUnit,
} from '@/lib/utils/reverseMatcher';

function makeRaw(overrides: Partial<LeadRawData> = {}): LeadRawData {
  return {
    lead_name: 'Test Buyer',
    phone: '9999999999',
    email: 'buyer@example.com',
    budget: 0,
    plan_to_buy: 'Immediate',
    profession: 'Engineer',
    location: 'Mysuru',
    note: '',
    pref_facings: [],
    interest: 'General Query',
    ...overrides,
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? 'lead-1',
    status: overrides.status ?? 'New',
    source: overrides.source ?? 'Google Ads',
    created_at: overrides.created_at ?? Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
    raw_data: overrides.raw_data ?? makeRaw({
      interests: ['Villa'],
      budget: 80_00_000,
      geo: { lat: 12.2958, lng: 76.6394 },
    }),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Palm Grove',
    builder: overrides.builder ?? 'EliteBuild',
    location: overrides.location ?? 'Mysuru',
    propertyType: overrides.propertyType ?? 'Villa',
    status: overrides.status ?? 'Active',
    geo: overrides.geo ?? { lat: 12.3058, lng: 76.655 },
    ...overrides,
  } as Project;
}

function makeUnit(overrides: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: overrides.id ?? 'unit-1',
    projectId: overrides.projectId ?? 'project-1',
    projectName: overrides.projectName ?? 'Palm Grove',
    location: overrides.location ?? 'Mysuru',
    propertyType: overrides.propertyType ?? 'Villa',
    status: overrides.status ?? 'Available',
    price: overrides.price ?? 75_00_000,
    fields: overrides.fields ?? { unit_number: 'V-101', bhk: 3 },
    created_at: overrides.created_at ?? Timestamp.now(),
    ...overrides,
  };
}

describe('rankBestBuyersForProject', () => {
  it('ranks active matching leads and excludes closed/rejected buyers', () => {
    const project = makeProject();
    const units = [
      makeUnit(),
      makeUnit({ id: 'unit-2', price: 79_00_000, fields: { unit_number: 'V-102', bhk: 3 } }),
    ];
    const hotBuyer = makeLead({
      id: 'hot',
      status: 'Site Visit',
      ai_audit: { intent: 'Investment', urgency: 'High' },
      activity_log: [
        { id: 'a1', type: 'call', text: 'Called', author: 'sales', created_at: new Date().toISOString() },
      ],
    });
    const warmBuyer = makeLead({
      id: 'warm',
      status: 'First Call',
      created_at: Timestamp.fromDate(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)),
      raw_data: makeRaw({ interests: ['Villa'], budget: 78_00_000, geo: { lat: 13, lng: 77 } }),
    });
    const rejectedBuyer = makeLead({
      id: 'rejected',
      status: 'Rejected',
      raw_data: makeRaw({ interests: ['Villa'], budget: 90_00_000 }),
    });

    const ranked = rankBestBuyersForProject(project, units, [warmBuyer, hotBuyer, rejectedBuyer], 5);
    expect(ranked.map(buyer => buyer.leadId)).toEqual(['hot', 'warm']);
    expect(ranked[0].status).toBe('Site Visit');
    expect(ranked[0].reasons.some(reason => reason.includes('high urgency'))).toBe(true);
  });

  it('respects lead-level threshold overrides while ranking buyers', () => {
    const project = makeProject();
    const unit = makeUnit({ price: 84_00_001 });
    const defaultThresholdMiss = makeLead({
      id: 'miss',
      raw_data: makeRaw({ interests: ['Villa'], budget: 80_00_000 }),
    });
    const overrideHit = makeLead({
      id: 'hit',
      match_threshold: 10,
      raw_data: makeRaw({ interests: ['Villa'], budget: 80_00_000 }),
    });

    const ranked = rankBestBuyersForProject(project, [unit], [defaultThresholdMiss, overrideHit], 5);
    expect(ranked.map(buyer => buyer.leadId)).toEqual(['hit']);
  });
});

describe('rankBestBuyersForUnit', () => {
  it('returns exact-unit buyers only when the unit is available', () => {
    const project = makeProject();
    const availableUnit = makeUnit({ fields: { unit_number: 'V-201', bhk: 3 } });
    const soldUnit = makeUnit({ status: 'Sold', fields: { unit_number: 'V-999', bhk: 3 } });
    const buyer = makeLead({
      raw_data: makeRaw({ interests: ['Villa'], budget: 80_00_000 }),
    });

    expect(rankBestBuyersForUnit(project, availableUnit, [buyer], 5)).toHaveLength(1);
    expect(rankBestBuyersForUnit(project, soldUnit, [buyer], 5)).toEqual([]);
  });
});

describe('buildBestBuyerCallListCsv', () => {
  it('builds a usable csv export with reasons', () => {
    const project = makeProject();
    const buyers = rankBestBuyersForProject(
      project,
      [makeUnit()],
      [makeLead({ ai_audit: { intent: 'Investment', urgency: 'High' } })],
      5,
    );

    const csv = buildBestBuyerCallListCsv(project.name, buyers);
    expect(csv).toContain('Lead Name,Phone,Email,Status');
    expect(csv).toContain('Test Buyer');
    expect(csv).toContain('Palm Grove');
  });
});
