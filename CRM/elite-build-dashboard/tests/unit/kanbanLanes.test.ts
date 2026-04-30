import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { LaneConfig } from '@/lib/types/config';
import { DEFAULT_KANBAN_CONFIG } from '@/lib/types/config';
import type { Lead } from '@/lib/types/lead';
import {
  injectPropertyMatchedLane,
  backfillLaneEmojis,
  groupLeadsByLane,
  computeDragMove,
} from '@/lib/utils/kanbanLanes';

// ==================== Test helpers ====================

function lane(id: string, order: number, extras: Partial<LaneConfig> = {}): LaneConfig {
  return { id, label: id, color: '#000', order, emoji: '📌', ...extras };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? 'l1',
    status: overrides.status ?? 'New',
    source: overrides.source ?? 'Manual',
    created_at: overrides.created_at ?? Timestamp.fromMillis(1_000),
    raw_data: {
      lead_name: 'Test',
      phone: '111',
      email: 'a@b',
      budget: 0,
      plan_to_buy: 'x',
      profession: 'x',
      location: 'x',
      note: '',
      pref_facings: [],
      interest: '',
    },
    ...overrides,
  };
}

// ==================== injectPropertyMatchedLane ====================

describe('injectPropertyMatchedLane', () => {
  it('is a no-op when property_matched lane already present', () => {
    const input = DEFAULT_KANBAN_CONFIG.lanes;
    const out = injectPropertyMatchedLane(input);
    // Should be a fresh array but logically equal.
    expect(out).not.toBe(input);
    expect(out.map(l => l.id)).toEqual(input.map(l => l.id));
  });

  it('inserts property_matched after nurturing (preferred anchor)', () => {
    const input: LaneConfig[] = [
      lane('new', 0),
      lane('first_call', 1),
      lane('nurturing', 2),
      lane('site_visit', 3),
      lane('booked', 4),
    ];
    const out = injectPropertyMatchedLane(input);
    expect(out.map(l => l.id)).toEqual([
      'new', 'first_call', 'nurturing', 'property_matched', 'site_visit', 'booked',
    ]);
  });

  it('falls back to inserting after first_call when nurturing is missing', () => {
    const input: LaneConfig[] = [
      lane('new', 0),
      lane('first_call', 1),
      lane('site_visit', 2),
    ];
    const out = injectPropertyMatchedLane(input);
    expect(out.map(l => l.id)).toEqual(['new', 'first_call', 'property_matched', 'site_visit']);
  });

  it('falls back to inserting after new when nurturing AND first_call missing', () => {
    const input: LaneConfig[] = [
      lane('new', 0),
      lane('site_visit', 1),
    ];
    const out = injectPropertyMatchedLane(input);
    expect(out.map(l => l.id)).toEqual(['new', 'property_matched', 'site_visit']);
  });

  it('returns input unchanged when no anchor lane exists (pathological)', () => {
    const input: LaneConfig[] = [
      lane('custom_intake', 0),
      lane('custom_review', 1),
    ];
    const out = injectPropertyMatchedLane(input);
    expect(out.map(l => l.id)).toEqual(['custom_intake', 'custom_review']);
  });

  it('bumps order of lanes that come AFTER the inserted lane', () => {
    const input: LaneConfig[] = [
      lane('new', 0),
      lane('nurturing', 1),
      lane('site_visit', 2),
      lane('booked', 3),
    ];
    const out = injectPropertyMatchedLane(input);
    expect(out.find(l => l.id === 'property_matched')?.order).toBe(2);
    expect(out.find(l => l.id === 'site_visit')?.order).toBe(3);
    expect(out.find(l => l.id === 'booked')?.order).toBe(4);
  });

  it('leaves order of lanes BEFORE the inserted lane unchanged', () => {
    const input: LaneConfig[] = [
      lane('new', 0),
      lane('first_call', 1),
      lane('nurturing', 2),
      lane('site_visit', 3),
    ];
    const out = injectPropertyMatchedLane(input);
    expect(out.find(l => l.id === 'new')?.order).toBe(0);
    expect(out.find(l => l.id === 'first_call')?.order).toBe(1);
    expect(out.find(l => l.id === 'nurturing')?.order).toBe(2);
  });

  it('does not mutate the input array', () => {
    const input: LaneConfig[] = [lane('new', 0), lane('nurturing', 1)];
    const snapshot = JSON.parse(JSON.stringify(input));
    injectPropertyMatchedLane(input);
    expect(input).toEqual(snapshot);
  });
});

// ==================== backfillLaneEmojis ====================

describe('backfillLaneEmojis', () => {
  it('preserves emoji when already set', () => {
    const input: LaneConfig[] = [lane('new', 0, { emoji: '🎯' })];
    const out = backfillLaneEmojis(input);
    expect(out[0].emoji).toBe('🎯');
  });

  it('backfills from the default config when emoji is missing', () => {
    const input: LaneConfig[] = [
      { id: 'new', label: 'New', color: '#000', order: 0 },
      { id: 'booked', label: 'Booked', color: '#000', order: 1 },
    ];
    const out = backfillLaneEmojis(input);
    expect(out[0].emoji).toBe('🌟'); // from DEFAULT_KANBAN_CONFIG
    expect(out[1].emoji).toBe('📋');
  });

  it('falls back to generic pin for unknown lane ids', () => {
    const input: LaneConfig[] = [
      { id: 'custom_bucket', label: 'Custom', color: '#000', order: 0 },
    ];
    const out = backfillLaneEmojis(input);
    expect(out[0].emoji).toBe('📌');
  });

  it('handles mixed (some have emoji, some do not)', () => {
    const input: LaneConfig[] = [
      { id: 'new', label: 'New', color: '#000', order: 0, emoji: '⭐' },
      { id: 'booked', label: 'Booked', color: '#000', order: 1 },
    ];
    const out = backfillLaneEmojis(input);
    expect(out[0].emoji).toBe('⭐');
    expect(out[1].emoji).toBe('📋');
  });
});

// ==================== groupLeadsByLane ====================

describe('groupLeadsByLane', () => {
  const lanes: LaneConfig[] = [
    lane('new', 0),
    lane('first_call', 1),
    lane('property_matched', 2),
    lane('booked', 3),
  ];

  it('returns a bucket for every provided lane, even if empty', () => {
    const out = groupLeadsByLane([], lanes);
    expect(Object.keys(out).sort()).toEqual(['booked', 'first_call', 'new', 'property_matched']);
    expect(out.new).toEqual([]);
  });

  it('buckets each lead into its status-derived lane', () => {
    const leads: Lead[] = [
      makeLead({ id: 'a', status: 'New' }),
      makeLead({ id: 'b', status: 'First Call' }),
      makeLead({ id: 'c', status: 'Booked' }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    expect(out.new.map(l => l.id)).toEqual(['a']);
    expect(out.first_call.map(l => l.id)).toEqual(['b']);
    expect(out.booked.map(l => l.id)).toEqual(['c']);
  });

  it('recognizes both "Property Matched" and "Matched" as property_matched', () => {
    // Historical leads may have status "Matched" from before the rename.
    const leads: Lead[] = [
      makeLead({ id: 'a', status: 'Property Matched' }),
      makeLead({ id: 'b', status: 'Matched' }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    expect(out.property_matched.map(l => l.id).sort()).toEqual(['a', 'b']);
  });

  it('falls unknown statuses into the FIRST lane (nothing is silently dropped)', () => {
    const leads: Lead[] = [
      makeLead({ id: 'orphan', status: 'SomeAncientStatus' }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    // statusToLaneId returns 'new' for unknowns, but this test exercises the
    // first-lane fallback when the lane layout doesn't include 'new'.
    expect(out.new.map(l => l.id)).toEqual(['orphan']);
  });

  it('falls unknown statuses into the first PROVIDED lane when `new` is absent', () => {
    const noNewLanes: LaneConfig[] = [
      lane('custom_intake', 0),
      lane('booked', 1),
    ];
    const leads: Lead[] = [
      makeLead({ id: 'orphan', status: 'Whatever' }),
    ];
    const out = groupLeadsByLane(leads, noNewLanes);
    // statusToLaneId('Whatever') → 'new', which isn't a bucket. Falls back
    // to the first provided lane.
    expect(out.custom_intake.map(l => l.id)).toEqual(['orphan']);
    expect(out.booked).toEqual([]);
  });

  it('sorts each bucket by lane_moved_at desc', () => {
    const leads: Lead[] = [
      makeLead({ id: 'old', status: 'New', lane_moved_at: Timestamp.fromMillis(1000) }),
      makeLead({ id: 'newest', status: 'New', lane_moved_at: Timestamp.fromMillis(3000) }),
      makeLead({ id: 'mid', status: 'New', lane_moved_at: Timestamp.fromMillis(2000) }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    expect(out.new.map(l => l.id)).toEqual(['newest', 'mid', 'old']);
  });

  it('falls back to created_at desc when lane_moved_at is missing', () => {
    const leads: Lead[] = [
      makeLead({ id: 'old', status: 'New', created_at: Timestamp.fromMillis(1000) }),
      makeLead({ id: 'newest', status: 'New', created_at: Timestamp.fromMillis(3000) }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    expect(out.new.map(l => l.id)).toEqual(['newest', 'old']);
  });

  it('prefers lane_moved_at over created_at when both present', () => {
    // Lead A: created earliest but moved latest → should rank first.
    const leads: Lead[] = [
      makeLead({
        id: 'a',
        status: 'New',
        created_at: Timestamp.fromMillis(1000),
        lane_moved_at: Timestamp.fromMillis(9000),
      }),
      makeLead({
        id: 'b',
        status: 'New',
        created_at: Timestamp.fromMillis(8000),
        lane_moved_at: Timestamp.fromMillis(2000),
      }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    expect(out.new.map(l => l.id)).toEqual(['a', 'b']);
  });

  it('treats missing timestamps as 0 (pushes them to the bottom)', () => {
    const leads: Lead[] = [
      makeLead({ id: 'no_times', status: 'New', created_at: null }),
      makeLead({ id: 'has_time', status: 'New', created_at: Timestamp.fromMillis(1000) }),
    ];
    const out = groupLeadsByLane(leads, lanes);
    expect(out.new.map(l => l.id)).toEqual(['has_time', 'no_times']);
  });
});

// ==================== computeDragMove ====================

describe('computeDragMove — noop cases', () => {
  const lanes = DEFAULT_KANBAN_CONFIG.lanes;

  it('noop when overId is undefined', () => {
    const result = computeDragMove('l1', undefined, [makeLead({ id: 'l1' })], lanes);
    expect(result).toEqual({ kind: 'noop' });
  });

  it('noop when overId is null', () => {
    const result = computeDragMove('l1', null, [makeLead({ id: 'l1' })], lanes);
    expect(result).toEqual({ kind: 'noop' });
  });

  it('noop when overId matches neither a lane nor a lead', () => {
    const result = computeDragMove('l1', 'garbage', [makeLead({ id: 'l1' })], lanes);
    expect(result).toEqual({ kind: 'noop' });
  });

  it('noop when the dragged lead is not found in the leads array', () => {
    const result = computeDragMove('missing', 'booked', [makeLead({ id: 'l1' })], lanes);
    expect(result).toEqual({ kind: 'noop' });
  });

  it('noop when dropping onto the same lane (by lane id)', () => {
    const lead = makeLead({ id: 'l1', status: 'New' });
    const result = computeDragMove('l1', 'new', [lead], lanes);
    expect(result).toEqual({ kind: 'noop' });
  });

  it('noop when dropping on another card in the same lane', () => {
    const a = makeLead({ id: 'a', status: 'New' });
    const b = makeLead({ id: 'b', status: 'New' });
    const result = computeDragMove('a', 'b', [a, b], lanes);
    expect(result).toEqual({ kind: 'noop' });
  });
});

describe('computeDragMove — simple_update', () => {
  const lanes = DEFAULT_KANBAN_CONFIG.lanes;

  it('emits simple_update for ordinary lane move (drop on lane)', () => {
    const lead = makeLead({ id: 'l1', status: 'New' });
    const result = computeDragMove('l1', 'first_call', [lead], lanes);
    expect(result).toEqual({
      kind: 'simple_update',
      leadId: 'l1',
      newStatus: 'First Call',
    });
  });

  it('emits simple_update when dropping on a card in a DIFFERENT lane', () => {
    const dragged = makeLead({ id: 'a', status: 'New' });
    const target = makeLead({ id: 'b', status: 'Nurturing' });
    const result = computeDragMove('a', 'b', [dragged, target], lanes);
    expect(result).toEqual({
      kind: 'simple_update',
      leadId: 'a',
      newStatus: 'Nurturing',
    });
  });

  it('emits simple_update for property_matched → booked when booked_unit exists', () => {
    // This is the "all prerequisites met" path that should NOT be blocked.
    const lead = makeLead({
      id: 'l1',
      status: 'Property Matched',
      booked_unit: {
        projectId: 'p1',
        projectName: 'X',
        unitId: 'u1',
        unitLabel: 'A-101',
        booked_at: '',
        booked_by: '',
      },
    });
    const result = computeDragMove('l1', 'booked', [lead], lanes);
    expect(result).toEqual({
      kind: 'simple_update',
      leadId: 'l1',
      newStatus: 'Booked',
    });
  });

  it('emits simple_update for Site Visit → Booked only when booked_unit exists', () => {
    const lead = makeLead({
      id: 'l1',
      status: 'Site Visit',
      booked_unit: {
        projectId: 'p1',
        projectName: 'X',
        unitId: 'u1',
        unitLabel: 'A-101',
        booked_at: '',
        booked_by: '',
      },
    });
    const result = computeDragMove('l1', 'booked', [lead], lanes);
    expect(result).toEqual({
      kind: 'simple_update',
      leadId: 'l1',
      newStatus: 'Booked',
    });
  });
});

describe('computeDragMove — block_booked', () => {
  const lanes = DEFAULT_KANBAN_CONFIG.lanes;

  it('blocks a move INTO Booked when no booked_unit is held', () => {
    const lead = makeLead({ id: 'l1', status: 'Site Visit', booked_unit: null });
    const result = computeDragMove('l1', 'booked', [lead], lanes);
    expect(result.kind).toBe('block_booked');
    if (result.kind === 'block_booked') {
      expect(result.lead.id).toBe('l1');
    }
  });

  it('blocks a move INTO Booked when booked_unit is undefined', () => {
    const lead = makeLead({ id: 'l1', status: 'Site Visit' });
    const result = computeDragMove('l1', 'booked', [lead], lanes);
    expect(result.kind).toBe('block_booked');
  });

  it('blocks a drop onto a Booked card when the dragged lead has no booked_unit', () => {
    const dragged = makeLead({ id: 'dragged', status: 'Site Visit' });
    const bookedTarget = makeLead({ id: 'bookedTarget', status: 'Booked' });
    const result = computeDragMove('dragged', 'bookedTarget', [dragged, bookedTarget], lanes);
    expect(result.kind).toBe('block_booked');
  });
});

describe('computeDragMove — close_sale_batch', () => {
  const lanes = DEFAULT_KANBAN_CONFIG.lanes;
  const bookedLead = makeLead({
    id: 'l1',
    status: 'Booked',
    booked_unit: {
      projectId: 'p1',
      projectName: 'X',
      unitId: 'u42',
      unitLabel: 'A-101',
      booked_at: '',
      booked_by: '',
    },
  });

  it('emits close_sale_batch when moving Booked → Closed with a held unit', () => {
    const result = computeDragMove('l1', 'closed', [bookedLead], lanes);
    expect(result).toEqual({
      kind: 'close_sale_batch',
      leadId: 'l1',
      newStatus: 'Closed',
      unitId: 'u42',
    });
  });

  it('emits close_sale_batch when dropping a booked lead on a Closed card', () => {
    const closedTarget = makeLead({ id: 'closedTarget', status: 'Closed' });
    const result = computeDragMove('l1', 'closedTarget', [bookedLead, closedTarget], lanes);
    expect(result).toEqual({
      kind: 'close_sale_batch',
      leadId: 'l1',
      newStatus: 'Closed',
      unitId: 'u42',
    });
  });
});

describe('computeDragMove — unbook_batch', () => {
  const lanes = DEFAULT_KANBAN_CONFIG.lanes;
  const bookedLead = makeLead({
    id: 'l1',
    status: 'Booked',
    booked_unit: {
      projectId: 'p1',
      projectName: 'X',
      unitId: 'u42',
      unitLabel: 'A-101',
      booked_at: '',
      booked_by: '',
    },
  });

  it('emits unbook_batch when moving Booked → Rejected', () => {
    const result = computeDragMove('l1', 'rejected', [bookedLead], lanes);
    expect(result).toEqual({
      kind: 'unbook_batch',
      leadId: 'l1',
      newStatus: 'Rejected',
      unitId: 'u42',
    });
  });

  it('emits unbook_batch when dropping on a CARD in a different lane', () => {
    const other = makeLead({ id: 'other', status: 'Nurturing' });
    const result = computeDragMove('l1', 'other', [bookedLead, other], lanes);
    expect(result).toEqual({
      kind: 'unbook_batch',
      leadId: 'l1',
      newStatus: 'Nurturing',
      unitId: 'u42',
    });
  });

  it('does NOT emit unbook_batch when moving out of Booked without a held unit', () => {
    // Pathological: status says Booked but booked_unit is falsy. We fall
    // through to simple_update so the stuck state can be recovered.
    const stuck = makeLead({ id: 'l1', status: 'Booked', booked_unit: null });
    const result = computeDragMove('l1', 'closed', [stuck], lanes);
    expect(result).toEqual({
      kind: 'simple_update',
      leadId: 'l1',
      newStatus: 'Closed',
    });
  });
});
