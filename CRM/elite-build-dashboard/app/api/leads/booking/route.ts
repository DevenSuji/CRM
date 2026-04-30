import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog, type AuditAction } from '@/lib/api/auditLog';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import { ApiValidationError, optionalString, readJsonObject, requiredEnum, requiredString } from '@/lib/api/validation';
import type { ActivityLogEntry, BookedUnit, Lead } from '@/lib/types/lead';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { CRMUser } from '@/lib/types/user';
import {
  buildStageMoveLog,
  getRequiredStageMoveNoteKind,
  type StageMoveReasonCategory,
} from '@/lib/utils/kanbanStageMoves';

const BOOKING_ACTIONS = ['book', 'release', 'move_booked'] as const;
type BookingAction = typeof BOOKING_ACTIONS[number];

const STAGE_STATUSES = ['New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit', 'Booked', 'Closed', 'Rejected'] as const;
type StageStatus = typeof STAGE_STATUSES[number];

const STAGE_REASON_CATEGORIES: readonly StageMoveReasonCategory[] = [
  'budget_mismatch',
  'location_mismatch',
  'not_reachable',
  'bought_elsewhere',
  'loan_issue',
  'family_decision',
  'duplicate_or_junk',
  'inventory_unavailable',
  'pricing_or_payment',
  'legal_or_documentation',
  'agreement_signed',
  'payment_received',
  'other',
];

function actorName(actor: CRMUser): string {
  return actor.name || actor.email || actor.uid;
}

function assertAdmin(actor: CRMUser) {
  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new ApiValidationError('Admin or Super Admin access required.', 403);
  }
}

function unitDisplayLabel(unit: InventoryUnit): string {
  return String(unit.fields?.unit_number || unit.fields?.plot_number || unit.id.slice(-6).toUpperCase());
}

function bookedUnitFrom(unit: InventoryUnit, actor: CRMUser, nowIso: string): BookedUnit {
  return {
    projectId: unit.projectId,
    projectName: unit.projectName,
    unitId: unit.id,
    unitLabel: unitDisplayLabel(unit),
    booked_at: nowIso,
    booked_by: actorName(actor),
  };
}

function bookingLog(unit: InventoryUnit, actor: CRMUser, nowIso: string): ActivityLogEntry {
  return {
    id: `book_${Date.now()}`,
    type: 'status_change',
    text: `Booked ${unit.projectName} - Unit ${unitDisplayLabel(unit)}`,
    author: actorName(actor),
    created_at: nowIso,
  };
}

function requireLeadBooking(lead: Lead): BookedUnit {
  if (!lead.booked_unit?.unitId) {
    throw new ApiValidationError('Lead does not have a booked unit.', 409);
  }
  return lead.booked_unit;
}

function validateGovernance(lead: Lead, newStatus: string, note?: string, reasonCategory?: string) {
  const requiredKind = getRequiredStageMoveNoteKind(lead.status, newStatus);
  if (!requiredKind) return;
  if (!note?.trim()) {
    throw new ApiValidationError('Stage-change note is required for this booked lead transition.');
  }
  if (!reasonCategory?.trim()) {
    throw new ApiValidationError('Stage-change reason category is required.');
  }
}

function readNewStatus(payload: Record<string, unknown>, action: BookingAction): StageStatus {
  if (action === 'book') return 'Booked';
  if (action === 'move_booked') {
    return requiredEnum<StageStatus>(payload, 'newStatus', STAGE_STATUSES);
  }
  const value = optionalString(payload, 'newStatus', { max: 80 });
  if (!value) return 'Site Visit';
  if (!STAGE_STATUSES.includes(value as StageStatus)) {
    throw new ApiValidationError(`newStatus must be one of: ${STAGE_STATUSES.join(', ')}.`);
  }
  if (value === 'Booked' || value === 'Closed') {
    throw new ApiValidationError('Release must move the lead to an open, non-booked stage.');
  }
  return value as StageStatus;
}

function readReasonCategory(payload: Record<string, unknown>): StageMoveReasonCategory | undefined {
  const value = optionalString(payload, 'reasonCategory', { max: 80 });
  if (!value) return undefined;
  if (!STAGE_REASON_CATEGORIES.includes(value as StageMoveReasonCategory)) {
    throw new ApiValidationError(`reasonCategory must be one of: ${STAGE_REASON_CATEGORIES.join(', ')}.`);
  }
  return value as StageMoveReasonCategory;
}

async function writeBookingAudit(input: {
  actor: CRMUser;
  actorUid: string;
  action: AuditAction;
  leadId: string;
  summary: string;
  unitId?: string | null;
  newStatus?: string | null;
}) {
  await writeAuditLog({
    actorUid: input.actorUid,
    actorRole: input.actor.role,
    actorEmail: input.actor.email,
    action: input.action,
    targetType: 'lead',
    targetId: input.leadId,
    summary: input.summary,
    metadata: {
      unitId: input.unitId || null,
      newStatus: input.newStatus || null,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'lead-booking', { actorUid: auth.uid, limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    assertAdmin(auth.user);

    const payload = await readJsonObject(req, 12_288);
    const action = requiredEnum<BookingAction>(payload, 'action', BOOKING_ACTIONS);
    const leadId = requiredString(payload, 'leadId', { max: 160, label: 'leadId' });
    const unitId = action === 'book'
      ? requiredString(payload, 'unitId', { max: 160, label: 'unitId' })
      : optionalString(payload, 'unitId', { max: 160 });
    const newStatus = readNewStatus(payload, action);
    const note = optionalString(payload, 'note', { max: 2000 });
    const reasonCategory = readReasonCategory(payload);

    const leadRef = adminDb.collection('leads').doc(leadId);
    const nowIso = new Date().toISOString();
    let auditAction: AuditAction = 'lead_booked_stage_changed';
    let auditSummary = '';
    let auditUnitId: string | null = unitId || null;

    const result = await adminDb.runTransaction(async transaction => {
      const leadSnap = await transaction.get(leadRef);
      if (!leadSnap.exists) {
        throw new ApiValidationError('Lead not found.', 404);
      }
      const lead = { id: leadSnap.id, ...leadSnap.data() } as Lead;

      if (action === 'book') {
        const unitRef = adminDb.collection('inventory').doc(unitId!);
        const unitSnap = await transaction.get(unitRef);
        if (!unitSnap.exists) {
          throw new ApiValidationError('Inventory unit not found.', 404);
        }
        const unit = { id: unitSnap.id, ...unitSnap.data() } as InventoryUnit;
        if (lead.status === 'Closed' || lead.status === 'Rejected') {
          throw new ApiValidationError('Closed or rejected leads cannot be booked.', 409);
        }
        if (lead.booked_unit?.unitId) {
          throw new ApiValidationError('Lead already has a booked unit.', 409);
        }
        if (unit.status !== 'Available' || unit.booked_by_lead_id) {
          throw new ApiValidationError('Inventory unit is no longer available.', 409);
        }

        const bookedUnit = bookedUnitFrom(unit, auth.user, nowIso);
        const logEntry = bookingLog(unit, auth.user, nowIso);
        transaction.update(leadRef, {
          status: 'Booked',
          booked_unit: bookedUnit,
          lane_moved_at: FieldValue.serverTimestamp(),
          activity_log: FieldValue.arrayUnion(logEntry),
        });
        transaction.update(unitRef, {
          status: 'Booked',
          booked_by_lead_id: leadId,
        });
        auditAction = 'lead_unit_booked';
        auditSummary = `Booked ${unit.projectName} - Unit ${bookedUnit.unitLabel}.`;
        auditUnitId = unit.id;
        return { status: 'Booked', bookedUnit };
      }

      const booking = requireLeadBooking(lead);
      if (unitId && booking.unitId !== unitId) {
        throw new ApiValidationError('Booked unit changed. Refresh the lead and try again.', 409);
      }
      const unitRef = adminDb.collection('inventory').doc(booking.unitId);
      const unitSnap = await transaction.get(unitRef);
      const unit = unitSnap.exists ? ({ id: unitSnap.id, ...unitSnap.data() } as InventoryUnit) : null;
      if (unit?.booked_by_lead_id && unit.booked_by_lead_id !== leadId) {
        throw new ApiValidationError('Inventory unit is booked by another lead.', 409);
      }

      if (action === 'move_booked' && newStatus === 'Booked') {
        return { status: 'Booked', bookedUnit: booking };
      }

      validateGovernance(lead, newStatus, note, reasonCategory);
      const activityEntry = buildStageMoveLog(lead, newStatus, actorName(auth.user), note, reasonCategory || '');

      if (newStatus === 'Closed') {
        transaction.update(leadRef, {
          status: 'Closed',
          lane_moved_at: FieldValue.serverTimestamp(),
          activity_log: FieldValue.arrayUnion(activityEntry),
        });
        if (unit) {
          transaction.update(unitRef, {
            status: 'Sold',
            booked_by_lead_id: leadId,
          });
        }
        auditAction = 'lead_booked_stage_changed';
        auditSummary = `Closed booked lead and marked unit ${booking.unitLabel} as sold.`;
        auditUnitId = booking.unitId;
        return { status: 'Closed', bookedUnit: booking };
      }

      transaction.update(leadRef, {
        status: newStatus,
        booked_unit: FieldValue.delete(),
        lane_moved_at: FieldValue.serverTimestamp(),
        activity_log: FieldValue.arrayUnion(activityEntry),
      });
      if (unit) {
        transaction.update(unitRef, {
          status: 'Available',
          booked_by_lead_id: FieldValue.delete(),
        });
      }
      auditAction = action === 'release' ? 'lead_unit_released' : 'lead_booked_stage_changed';
      auditSummary = `Released booked unit ${booking.unitLabel} and moved lead to ${newStatus}.`;
      auditUnitId = booking.unitId;
      return { status: newStatus, bookedUnit: null };
    });

    await writeBookingAudit({
      actor: auth.user,
      actorUid: auth.uid,
      action: auditAction,
      leadId,
      summary: auditSummary || `Updated booked lead ${leadId}.`,
      unitId: auditUnitId,
      newStatus: result.status,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Lead booking route failed:', err);
    return NextResponse.json({ error: 'Failed to update booking.' }, { status: 500 });
  }
}
