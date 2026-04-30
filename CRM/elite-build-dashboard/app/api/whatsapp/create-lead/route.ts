import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/api/auditLog';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import {
  syncWhatsAppConversationsForLead,
  upsertWhatsAppConversationMessage,
} from '@/lib/api/whatsappConversations';
import { ApiValidationError, optionalString, readJsonObject, requiredString } from '@/lib/api/validation';
import type { WhatsAppMessageType } from '@/lib/types/communication';
import type { Lead } from '@/lib/types/lead';
import type { LeadAssignmentConfig } from '@/lib/types/config';
import type { CRMUser } from '@/lib/types/user';
import { chooseLeadAssignee } from '@/lib/utils/leadAssignment';
import { buildDuplicateKeys, normalizePhoneForDuplicate } from '@/lib/utils/leadDuplicates';
import { normalizeLeadSource } from '@/lib/utils/leadSourceHygiene';

const CREATE_ALLOWED_ROLES = new Set(['superadmin', 'admin']);

function displayName(user: CRMUser | undefined): string {
  return user?.name || user?.email || user?.uid || 'CRM User';
}

function timestampToDate(value: unknown): Date {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'whatsapp-create-lead', { actorUid: auth.uid, limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const actor = auth.user;
    if (!CREATE_ALLOWED_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Lead creation access required.' }, { status: 403 });
    }

    const payload = await readJsonObject(req);
    const messageId = requiredString(payload, 'messageId', { max: 200 });
    const requestedName = optionalString(payload, 'leadName', { max: 120 }) || '';

    const result = await adminDb.runTransaction(async transaction => {
      const messageRef = adminDb.collection('whatsapp_messages').doc(messageId);
      const configRef = adminDb.collection('crm_config').doc('lead_assignment');
      const [messageSnap, configSnap, usersSnap, leadsSnap] = await Promise.all([
        transaction.get(messageRef),
        transaction.get(configRef),
        transaction.get(adminDb.collection('users')),
        transaction.get(adminDb.collection('leads').where('status', 'in', ['New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit'])),
      ]);

      if (!messageSnap.exists) {
        throw new ApiValidationError('WhatsApp message not found.', 404);
      }

      const message = messageSnap.data() || {};
      if (typeof message.lead_id === 'string' && message.lead_id.trim()) {
        throw new ApiValidationError('WhatsApp message is already linked to a lead.', 409);
      }
      if (typeof message.direction === 'string' && message.direction !== 'inbound') {
        throw new ApiValidationError('Lead creation is only allowed from inbound WhatsApp messages.');
      }

      const phone =
        normalizePhoneForDuplicate(String(message.from || '')) ||
        normalizePhoneForDuplicate(String(message.normalized_phone || '')) ||
        normalizePhoneForDuplicate(String(message.to || ''));
      if (!phone) {
        throw new ApiValidationError('WhatsApp message does not have a usable phone number.');
      }

      const leadName = requestedName || `WhatsApp Contact ${phone.slice(-4)}`;
      const rawData: Lead['raw_data'] = {
        lead_name: leadName,
        phone,
        whatsapp: phone,
        whatsapp_number: phone,
        email: 'N/A',
        budget: 0,
        plan_to_buy: 'Not Specified',
        profession: 'Not Specified',
        location: 'Unknown',
        note: message.text ? `Created from WhatsApp: ${message.text}` : 'Created from WhatsApp',
        pref_facings: [],
        interest: 'General Query',
        interests: ['General Query'],
      };
      const source = 'WhatsApp';
      const config = (configSnap.exists ? configSnap.data() : {}) as Partial<LeadAssignmentConfig>;
      const users = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as CRMUser));
      const openLeads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      const assignment = chooseLeadAssignee({ source, raw_data: rawData }, users, openLeads, config);
      const leadRef = adminDb.collection('leads').doc();
      const nowIso = new Date().toISOString();
      const activityLog = [
        {
          id: `wa_in_${messageId}`,
          type: 'whatsapp_received',
          text: `WhatsApp received: ${message.text || 'No message text'}`,
          author: 'WhatsApp',
          created_at: nowIso,
        },
        {
          id: `wa_created_${messageId}`,
          type: 'whatsapp_linked',
          text: `Lead created from WhatsApp contact ${message.from || phone}`,
          author: displayName(actor),
          created_at: nowIso,
        },
      ];

      if (assignment.assigneeUid) {
        activityLog.push({
          id: `assign_${assignment.assigneeUid}_${Date.now()}`,
          type: 'lead_assigned',
          text: `Assigned to ${assignment.assigneeName || assignment.assigneeUid}. ${assignment.reason}`,
          author: displayName(actor),
          created_at: nowIso,
        });
      }

      transaction.set(leadRef, {
        status: 'New',
        created_at: Timestamp.now(),
        source,
        source_normalized: normalizeLeadSource(source),
        owner_uid: auth.uid,
        raw_data: rawData,
        duplicate_keys: buildDuplicateKeys(rawData),
        activity_log: activityLog,
        ...(assignment.assigneeUid ? { assigned_to: assignment.assigneeUid } : {}),
      });

      transaction.update(messageRef, {
        lead_id: leadRef.id,
        linked_at: FieldValue.serverTimestamp(),
        linked_by: auth.uid,
      });

      if (assignment.nextCursor !== undefined) {
        transaction.set(configRef, {
          ...config,
          round_robin_cursor: assignment.nextCursor,
          updated_at: Timestamp.now(),
        }, { merge: true });
      }

      return {
        leadId: leadRef.id,
        leadName,
        assignment,
        phone,
        messageText: typeof message.text === 'string' ? message.text : '',
        messageFrom: typeof message.from === 'string' ? message.from : phone,
        messageTo: typeof message.to === 'string' ? message.to : null,
        messageType: typeof message.type === 'string' ? message.type : 'unknown',
        messageAtMs: timestampToDate(message.received_at || message.created_at).getTime(),
        messageRaw: message.raw || null,
      };
    });

    const leadSnap = await adminDb.collection('leads').doc(result.leadId).get();
    const lead = { id: leadSnap.id, ...leadSnap.data() } as Lead;
    await syncWhatsAppConversationsForLead(lead);
    await upsertWhatsAppConversationMessage({
      normalizedPhone: result.phone,
      displayPhone: result.messageFrom,
      lead,
      direction: 'inbound',
      type: result.messageType as WhatsAppMessageType,
      text: result.messageText,
      waMessageId: messageId,
      status: 'received',
      timestamp: new Date(result.messageAtMs),
      from: result.messageFrom,
      to: result.messageTo,
      raw: result.messageRaw,
    });

    await writeAuditLog({
      actorUid: auth.uid,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: 'whatsapp_lead_created',
      targetType: 'lead',
      targetId: result.leadId,
      summary: `Lead ${result.leadName} created from WhatsApp message.`,
      metadata: {
        messageId,
        assigneeUid: result.assignment.assigneeUid || null,
        assigneeName: result.assignment.assigneeName || null,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('WhatsApp lead creation failed:', err);
    return NextResponse.json({ error: 'Failed to create lead from WhatsApp.' }, { status: 500 });
  }
}
