import { Lead } from '@/lib/types/lead';
import {
  LaneConfig,
  DEFAULT_KANBAN_CONFIG,
  statusToLaneId,
  laneIdToStatus,
} from '@/lib/types/config';

/** Injects the "Property Matched" lane into a saved kanban config if missing.
 *  Insertion point: after Nurturing, falling back to First Call, falling back
 *  to New. Subsequent lanes have their `order` bumped by 1 so the list stays
 *  contiguous. Pure — returns a new array; input is not mutated.
 *
 *  Backfill exists because `property_matched` was added after the initial
 *  release; configs saved before it was introduced don't have this lane, but
 *  the property-matcher still writes `status: 'Property Matched'` to leads. */
export function injectPropertyMatchedLane(lanes: readonly LaneConfig[]): LaneConfig[] {
  if (lanes.find(l => l.id === 'property_matched')) {
    return [...lanes];
  }
  const nurturingIndex = lanes.findIndex(l => l.id === 'nurturing');
  const firstCallIndex = lanes.findIndex(l => l.id === 'first_call');
  const newIndex = lanes.findIndex(l => l.id === 'new');
  const insertAfter = nurturingIndex >= 0
    ? nurturingIndex
    : firstCallIndex >= 0 ? firstCallIndex : newIndex;

  // Pathological case: no anchor lane at all. Return unchanged rather than
  // prepending — callers can decide what to do (but the default config has
  // all three anchors, so this only trips if someone hand-edited the doc).
  if (insertAfter < 0) return [...lanes];

  const propertyMatchedLane = DEFAULT_KANBAN_CONFIG.lanes.find(l => l.id === 'property_matched')!;
  return [
    ...lanes.slice(0, insertAfter + 1),
    { ...propertyMatchedLane, order: insertAfter + 1 },
    ...lanes.slice(insertAfter + 1).map(l => ({ ...l, order: l.order + 1 })),
  ];
}

/** Fills in missing `emoji` fields on lanes using the default config as the
 *  source of truth. Lanes not in the default config get a generic pin emoji
 *  so every card surface always has something to render. */
export function backfillLaneEmojis(lanes: readonly LaneConfig[]): LaneConfig[] {
  return lanes.map(lane => {
    if (lane.emoji) return lane;
    const defaultLane = DEFAULT_KANBAN_CONFIG.lanes.find(d => d.id === lane.id);
    return { ...lane, emoji: defaultLane?.emoji || '📌' };
  });
}

/** Returns a `Record<laneId, Lead[]>` with leads bucketed into their lane by
 *  `statusToLaneId(lead.status)`. Leads whose status doesn't map to any of
 *  the provided lanes fall through to the FIRST lane (sorted order), so
 *  nothing is silently dropped from the board.
 *
 *  Each bucket is sorted by `lane_moved_at` desc, falling back to
 *  `created_at` desc. Newest-activity-on-top matches user expectation for
 *  a kanban. */
export function groupLeadsByLane(
  leads: readonly Lead[],
  sortedLanes: readonly LaneConfig[],
): Record<string, Lead[]> {
  const map: Record<string, Lead[]> = {};
  for (const lane of sortedLanes) {
    map[lane.id] = [];
  }

  const firstLaneId = sortedLanes[0]?.id;

  for (const lead of leads) {
    const laneId = statusToLaneId(lead.status);
    if (map[laneId]) {
      map[laneId].push(lead);
    } else if (firstLaneId && map[firstLaneId]) {
      map[firstLaneId].push(lead);
    }
  }

  for (const laneId of Object.keys(map)) {
    map[laneId].sort((a, b) => {
      const aTime = a.lane_moved_at?.toMillis?.() || a.created_at?.toMillis?.() || 0;
      const bTime = b.lane_moved_at?.toMillis?.() || b.created_at?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }
  return map;
}

/** The pure decision output of a drag-end event. The caller performs the
 *  Firestore writes (or the no-op) based on `kind`. Splitting the decision
 *  from the write keeps the transition logic testable.
 *
 *  - `noop`                : invalid drop target, or same-lane move.
 *  - `block_booked`        : target is Booked but the lead has no `booked_unit`
 *                            yet — the UI should open the lead detail so the
 *                            user picks the unit.
 *  - `close_sale_batch`    : moving Booked → Closed while a unit is held.
 *                            Must mark the inventory unit Sold.
 *  - `unbook_batch`        : moving OUT of Booked to a non-closed stage while
 *                            a unit is held. Must be written as a batch
 *                            (lead + inventory) so the two stay in sync.
 *  - `simple_update`       : ordinary lane move. One `updateDoc`. */
export type DragDecision =
  | { kind: 'noop' }
  | { kind: 'block_booked'; lead: Lead }
  | {
      kind: 'close_sale_batch';
      leadId: string;
      newStatus: string;
      unitId: string;
    }
  | {
      kind: 'unbook_batch';
      leadId: string;
      newStatus: string;
      unitId: string;
    }
  | { kind: 'simple_update'; leadId: string; newStatus: string };

/** Compute the effect of dropping `activeLeadId` onto `overId`.
 *  `overId` may be either a lane id (when dropped on the lane background) or
 *  another lead's id (when dropped on a card). Unknown `overId`, missing lead,
 *  or same-lane drop → noop. */
export function computeDragMove(
  activeLeadId: string,
  overId: string | null | undefined,
  leads: readonly Lead[],
  sortedLanes: readonly LaneConfig[],
): DragDecision {
  if (!overId) return { kind: 'noop' };

  let targetLaneId: string;
  if (sortedLanes.find(l => l.id === overId)) {
    targetLaneId = overId;
  } else {
    const overLead = leads.find(l => l.id === overId);
    if (!overLead) return { kind: 'noop' };
    targetLaneId = statusToLaneId(overLead.status);
  }

  const lead = leads.find(l => l.id === activeLeadId);
  if (!lead) return { kind: 'noop' };

  const currentLaneId = statusToLaneId(lead.status);
  if (currentLaneId === targetLaneId) return { kind: 'noop' };

  const newStatus = laneIdToStatus(targetLaneId);

  // Moving INTO Booked without a unit held: block and open detail.
  if (targetLaneId === 'booked' && !lead.booked_unit) {
    return { kind: 'block_booked', lead };
  }

  // Closing a booked lead completes the sale: keep the booking on the lead and
  // mark the inventory unit as Sold.
  if (currentLaneId === 'booked' && targetLaneId === 'closed' && lead.booked_unit) {
    return {
      kind: 'close_sale_batch',
      leadId: activeLeadId,
      newStatus,
      unitId: lead.booked_unit.unitId,
    };
  }

  // Moving OUT of Booked to a non-closed stage while a unit is held: free the
  // unit atomically.
  if (currentLaneId === 'booked' && lead.booked_unit) {
    return {
      kind: 'unbook_batch',
      leadId: activeLeadId,
      newStatus,
      unitId: lead.booked_unit.unitId,
    };
  }

  return { kind: 'simple_update', leadId: activeLeadId, newStatus };
}
