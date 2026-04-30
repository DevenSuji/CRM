import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog, type AuditAction } from '@/lib/api/auditLog';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import { ApiValidationError, optionalString, readJsonObject, requiredEnum, requiredString } from '@/lib/api/validation';
import type { ActivityLogEntry, Lead } from '@/lib/types/lead';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { CRMUser } from '@/lib/types/user';
import { buildMergedLeadUpdate } from '@/lib/utils/leadMerge';

const LIFECYCLE_ACTIONS = ['archive', 'merge'] as const;
type LifecycleAction = typeof LIFECYCLE_ACTIONS[number];

function actorName(actor: CRMUser): string {
  return actor.name || actor.email || actor.uid;
}

function assertAdmin(actor: CRMUser) {
  if (actor.role !== 'admin' && actor.role !== 'superadmin') {
    throw new ApiValidationError('Admin or Super Admin access required.', 403);
  }
}

function leadName(lead: Lead): string {
  return lead.raw_data?.lead_name || lead.id;
}

function isArchived(lead: Lead): boolean {
  return Boolean(lead.archived_at || lead.archived_at_iso || lead.archive_kind);
}

function archiveActivityEntry(action: LifecycleAction, actor: CRMUser, nowIso: string, detail: string): ActivityLogEntry {
  return {
    id: `${action}_${Date.now()}`,
    type: 'note',
    text: detail,
    author: actorName(actor),
    created_at: nowIso,
  };
}

async function writeLifecycleAudit(input: {
  actor: CRMUser;
  actorUid: string;
  action: AuditAction;
  targetId: string;
  summary: string;
  duplicateLeadId?: string | null;
  mergedInto?: string | null;
  releasedUnitId?: string | null;
}) {
  await writeAuditLog({
    actorUid: input.actorUid,
    actorRole: input.actor.role,
    actorEmail: input.actor.email,
    action: input.action,
    targetType: 'lead',
    targetId: input.targetId,
    summary: input.summary,
    metadata: {
      duplicateLeadId: input.duplicateLeadId || null,
      mergedInto: input.mergedInto || null,
      releasedUnitId: input.releasedUnitId || null,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'lead-lifecycle', { actorUid: auth.uid, limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    assertAdmin(auth.user);

    const payload = await readJsonObject(req, 12_288);
    const action = requiredEnum<LifecycleAction>(payload, 'action', LIFECYCLE_ACTIONS);
    const now = new Date();
    const nowIso = now.toISOString();
    const auditAction: AuditAction = action === 'merge' ? 'lead_merged' : 'lead_archived';
    let auditTargetId = '';
    let auditSummary = '';
    let auditDuplicateLeadId: string | null = null;
    let auditMergedInto: string | null = null;
    let auditReleasedUnitId: string | null = null;

    if (action === 'archive') {
      const leadId = requiredString(payload, 'leadId', { max: 160, label: 'leadId' });
      const reason = optionalString(payload, 'reason', { max: 500 }) || 'Archived from Lead Detail.';
      const leadRef = adminDb.collection('leads').doc(leadId);

      const result = await adminDb.runTransaction(async transaction => {
        const leadSnap = await transaction.get(leadRef);
        if (!leadSnap.exists) {
          throw new ApiValidationError('Lead not found.', 404);
        }
        const lead = { id: leadSnap.id, ...leadSnap.data() } as Lead;
        if (isArchived(lead)) {
          throw new ApiValidationError('Lead is already archived.', 409);
        }

        let releasedUnitId: string | null = null;
        let unitRef: DocumentReference | null = null;
        let unit: InventoryUnit | null = null;
        if (lead.booked_unit?.unitId && lead.status !== 'Closed') {
          unitRef = adminDb.collection('inventory').doc(lead.booked_unit.unitId);
          const unitSnap = await transaction.get(unitRef);
          unit = unitSnap.exists ? ({ id: unitSnap.id, ...unitSnap.data() } as InventoryUnit) : null;
        }

        const archiveEntry = archiveActivityEntry(
          action,
          auth.user,
          nowIso,
          `Lead archived. Reason: ${reason}`,
        );

        const update: Record<string, unknown> = {
          archived_at: FieldValue.serverTimestamp(),
          archived_at_iso: nowIso,
          archived_by: actorName(auth.user),
          archived_by_uid: auth.uid,
          archive_reason: reason,
          archive_kind: 'manual',
          activity_log: FieldValue.arrayUnion(archiveEntry),
        };

        if (unitRef && unit && (!unit.booked_by_lead_id || unit.booked_by_lead_id === leadId)) {
          transaction.update(unitRef, {
            status: 'Available',
            booked_by_lead_id: FieldValue.delete(),
          });
          update.booked_unit = FieldValue.delete();
          releasedUnitId = unit.id;
        }

        transaction.update(leadRef, update);
        return { leadId, releasedUnitId };
      });

      auditTargetId = leadId;
      auditReleasedUnitId = result.releasedUnitId;
      auditSummary = `Archived lead ${leadId}${result.releasedUnitId ? ` and released unit ${result.releasedUnitId}` : ''}.`;

      await writeLifecycleAudit({
        actor: auth.user,
        actorUid: auth.uid,
        action: auditAction,
        targetId: auditTargetId,
        summary: auditSummary,
        releasedUnitId: auditReleasedUnitId,
      });

      return NextResponse.json({ archived: true, leadId, releasedUnitId: result.releasedUnitId });
    }

    const primaryLeadId = requiredString(payload, 'primaryLeadId', { max: 160, label: 'primaryLeadId' });
    const duplicateLeadId = requiredString(payload, 'duplicateLeadId', { max: 160, label: 'duplicateLeadId' });
    if (primaryLeadId === duplicateLeadId) {
      throw new ApiValidationError('Select two different leads to merge.');
    }

    const primaryRef = adminDb.collection('leads').doc(primaryLeadId);
    const duplicateRef = adminDb.collection('leads').doc(duplicateLeadId);

    const mergeResult = await adminDb.runTransaction(async transaction => {
      const [primarySnap, duplicateSnap] = await Promise.all([
        transaction.get(primaryRef),
        transaction.get(duplicateRef),
      ]);
      if (!primarySnap.exists) throw new ApiValidationError('Primary lead not found.', 404);
      if (!duplicateSnap.exists) throw new ApiValidationError('Duplicate lead not found.', 404);

      const primary = { id: primarySnap.id, ...primarySnap.data() } as Lead;
      const duplicate = { id: duplicateSnap.id, ...duplicateSnap.data() } as Lead;
      if (isArchived(primary)) {
        throw new ApiValidationError('Primary lead is archived.', 409);
      }
      if (isArchived(duplicate)) {
        throw new ApiValidationError('Duplicate lead is already archived.', 409);
      }

      const merged = buildMergedLeadUpdate(primary, duplicate, actorName(auth.user), now);
      if (merged.blockedReason) {
        throw new ApiValidationError(merged.blockedReason, 409);
      }

      const duplicateBookingUnitId = duplicate.booked_unit?.unitId || null;
      const primaryBookingUnitId = primary.booked_unit?.unitId || null;
      const unitShouldPointToPrimary = duplicateBookingUnitId
        && (!primaryBookingUnitId || primaryBookingUnitId === duplicateBookingUnitId);
      let unitRef: DocumentReference | null = null;
      let unit: InventoryUnit | null = null;
      if (unitShouldPointToPrimary) {
        unitRef = adminDb.collection('inventory').doc(duplicateBookingUnitId);
        const unitSnap = await transaction.get(unitRef);
        unit = unitSnap.exists ? ({ id: unitSnap.id, ...unitSnap.data() } as InventoryUnit) : null;
        if (unit?.booked_by_lead_id && ![primaryLeadId, duplicateLeadId].includes(unit.booked_by_lead_id)) {
          throw new ApiValidationError('Booked inventory unit belongs to another lead.', 409);
        }
      }

      const primaryUpdate: Record<string, unknown> = {
        ...merged.update,
      };
      if (merged.transferredBookedUnitId && primary.status !== 'Booked' && primary.status !== 'Closed') {
        primaryUpdate.status = 'Booked';
        primaryUpdate.lane_moved_at = FieldValue.serverTimestamp();
      }

      const archiveEntry = archiveActivityEntry(
        action,
        auth.user,
        nowIso,
        `Duplicate lead merged into ${primaryLeadId}.`,
      );

      transaction.update(primaryRef, primaryUpdate);
      if (unitRef && unit) {
        transaction.update(unitRef, { booked_by_lead_id: primaryLeadId });
      }
      transaction.update(duplicateRef, {
        archived_at: FieldValue.serverTimestamp(),
        archived_at_iso: nowIso,
        archived_by: actorName(auth.user),
        archived_by_uid: auth.uid,
        archive_reason: `Merged into ${primaryLeadId}.`,
        archive_kind: 'merged',
        merged_into: primaryLeadId,
        booked_unit: FieldValue.delete(),
        activity_log: FieldValue.arrayUnion(archiveEntry),
      });

      return {
        primaryLeadId,
        duplicateLeadId,
        primaryName: leadName(primary),
        duplicateName: leadName(duplicate),
        transferredUnitId: unitShouldPointToPrimary ? duplicateBookingUnitId : null,
      };
    });

    auditTargetId = primaryLeadId;
    auditDuplicateLeadId = duplicateLeadId;
    auditMergedInto = primaryLeadId;
    auditReleasedUnitId = mergeResult.transferredUnitId;
    auditSummary = `Merged duplicate lead "${mergeResult.duplicateName}" into "${mergeResult.primaryName}".`;

    await writeLifecycleAudit({
      actor: auth.user,
      actorUid: auth.uid,
      action: auditAction,
      targetId: auditTargetId,
      summary: auditSummary,
      duplicateLeadId: auditDuplicateLeadId,
      mergedInto: auditMergedInto,
      releasedUnitId: auditReleasedUnitId,
    });

    return NextResponse.json({
      merged: true,
      primaryLeadId,
      duplicateLeadId,
      transferredUnitId: mergeResult.transferredUnitId,
    });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Lead lifecycle route failed:', err);
    return NextResponse.json({ error: 'Failed to update lead lifecycle.' }, { status: 500 });
  }
}
