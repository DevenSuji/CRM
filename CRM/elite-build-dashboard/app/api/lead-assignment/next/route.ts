import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/api/auditLog';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import { ApiValidationError, readJsonObject } from '@/lib/api/validation';
import type { Lead } from '@/lib/types/lead';
import type { LeadAssignmentConfig } from '@/lib/types/config';
import type { CRMUser } from '@/lib/types/user';
import { chooseLeadAssignee } from '@/lib/utils/leadAssignment';

const ASSIGNMENT_ALLOWED_ROLES = new Set(['superadmin', 'admin', 'sales_exec', 'channel_partner']);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'lead-assignment', { actorUid: auth.uid, limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const actor = auth.user;
    if (!ASSIGNMENT_ALLOWED_ROLES.has(String(actor.role || ''))) {
      return NextResponse.json({ error: 'Lead assignment access required.' }, { status: 403 });
    }

    const payload = await readJsonObject(req, 12_288) as { source?: string; raw_data?: Lead['raw_data']; commit?: boolean };

    if (actor.role === 'channel_partner') {
      return NextResponse.json({
        assigneeUid: actor.uid,
        assigneeName: actor.name || actor.email || actor.uid,
        reason: 'Channel partner leads stay assigned to the partner.',
      });
    }
    if (actor.role === 'sales_exec') {
      return NextResponse.json({
        assigneeUid: actor.uid,
        assigneeName: actor.name || actor.email || actor.uid,
        reason: 'Sales executive leads stay assigned to the creator.',
      });
    }

    const result = await adminDb.runTransaction(async transaction => {
      const configRef = adminDb.collection('crm_config').doc('lead_assignment');
      const [configSnap, usersSnap, leadsSnap] = await Promise.all([
        transaction.get(configRef),
        transaction.get(adminDb.collection('users')),
        transaction.get(adminDb.collection('leads').where('status', 'in', ['New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit'])),
      ]);

      const config = (configSnap.exists ? configSnap.data() : {}) as Partial<LeadAssignmentConfig>;
      const users = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as CRMUser));
      const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      const assignment = chooseLeadAssignee(payload, users, leads, config);

      if (payload.commit === true && assignment.nextCursor !== undefined) {
        transaction.set(configRef, {
          ...config,
          round_robin_cursor: assignment.nextCursor,
          updated_at: new Date(),
        }, { merge: true });
      }

      return assignment;
    });

    if (payload.commit === true) {
      await writeAuditLog({
        actorUid: auth.uid,
        actorRole: actor.role,
        actorEmail: actor.email,
        action: 'lead_assignment_selected',
        targetType: 'lead_assignment',
        targetId: result.assigneeUid || 'unassigned',
        summary: result.assigneeUid
          ? `Lead assignment selected ${result.assigneeName || result.assigneeUid}.`
          : 'Lead assignment evaluated without an eligible assignee.',
        metadata: {
          assigneeUid: result.assigneeUid || null,
          assigneeName: result.assigneeName || null,
          reason: result.reason || null,
          source: payload.source || null,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Lead assignment route failed:', err);
    return NextResponse.json({ error: 'Failed to assign lead.' }, { status: 500 });
  }
}
