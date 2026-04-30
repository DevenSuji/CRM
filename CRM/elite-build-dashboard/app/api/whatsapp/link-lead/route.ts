import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/api/auditLog';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import {
  syncWhatsAppConversationsForLead,
  upsertWhatsAppConversationMessage,
} from '@/lib/api/whatsappConversations';
import { ApiValidationError, readJsonObject, requiredString } from '@/lib/api/validation';
import type { WhatsAppMessageDirection, WhatsAppMessageType } from '@/lib/types/communication';
import type { Lead } from '@/lib/types/lead';
import { normalizePhoneForDuplicate } from '@/lib/utils/leadDuplicates';

const LINK_ALLOWED_ROLES = new Set(['superadmin', 'admin']);

function leadPhoneKeys(lead: Lead): Set<string> {
  const raw = lead.raw_data || {};
  return new Set([
    ...(lead.duplicate_keys?.phones || []),
    normalizePhoneForDuplicate(raw.phone),
    normalizePhoneForDuplicate(raw.whatsapp),
    normalizePhoneForDuplicate(raw.whatsapp_number),
  ].filter((value): value is string => Boolean(value)));
}

function timestampToDate(value: unknown): Date {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'whatsapp-link-lead', { actorUid: auth.uid, limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const userData = auth.user;
    if (!LINK_ALLOWED_ROLES.has(String(userData.role || ''))) {
      return NextResponse.json({ error: 'Lead-management access required.' }, { status: 403 });
    }

    const payload = await readJsonObject(req);
    const messageId = requiredString(payload, 'messageId', { max: 200 });
    const leadId = requiredString(payload, 'leadId', { max: 200 });

    const messageRef = adminDb.collection('whatsapp_messages').doc(messageId);
    const leadRef = adminDb.collection('leads').doc(leadId);
    const [messageSnap, leadSnap] = await Promise.all([messageRef.get(), leadRef.get()]);

    if (!messageSnap.exists) {
      return NextResponse.json({ error: 'WhatsApp message not found.' }, { status: 404 });
    }
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const message = messageSnap.data() || {};
    const existingLeadId = typeof message.lead_id === 'string' ? message.lead_id.trim() : '';
    if (existingLeadId && existingLeadId !== leadId) {
      return NextResponse.json(
        { error: 'WhatsApp message is already linked to another lead.' },
        { status: 409 },
      );
    }

    const lead = { id: leadSnap.id, ...leadSnap.data() } as Lead;
    if (lead.archived_at || lead.archived_at_iso || lead.archive_kind) {
      return NextResponse.json({ error: 'Cannot link WhatsApp messages to archived leads.' }, { status: 409 });
    }

    const normalizedPhone =
      normalizePhoneForDuplicate(String(message.normalized_phone || '')) ||
      normalizePhoneForDuplicate(String(message.from || '')) ||
      normalizePhoneForDuplicate(String(message.to || ''));
    const leadPhones = leadPhoneKeys(lead);
    if (leadPhones.size > 0 && normalizedPhone && !leadPhones.has(normalizedPhone)) {
      return NextResponse.json(
        { error: 'WhatsApp contact does not match the selected lead.' },
        { status: 400 },
      );
    }

    const batch = adminDb.batch();
    batch.update(messageRef, {
      lead_id: leadId,
      linked_at: FieldValue.serverTimestamp(),
      linked_by: auth.uid,
    });

    const leadUpdate: Record<string, unknown> = {
      activity_log: FieldValue.arrayUnion({
        id: `wa_link_${messageId}`,
        type: 'whatsapp_linked',
        text: `WhatsApp contact linked: ${message.from || message.to || 'unknown phone'}`,
        author: typeof userData.name === 'string' && userData.name.trim() ? userData.name.trim() : 'CRM User',
        created_at: new Date().toISOString(),
      }),
    };
    if (normalizedPhone) {
      leadUpdate['duplicate_keys.phones'] = FieldValue.arrayUnion(normalizedPhone);
    }
    batch.update(leadRef, leadUpdate);
    await batch.commit();
    await syncWhatsAppConversationsForLead(lead);

    if (normalizedPhone) {
      await upsertWhatsAppConversationMessage({
        normalizedPhone,
        displayPhone: String(message.from || message.to || normalizedPhone),
        lead,
        direction: (message.direction === 'outbound' ? 'outbound' : 'inbound') as WhatsAppMessageDirection,
        type: (typeof message.type === 'string' ? message.type : 'unknown') as WhatsAppMessageType,
        text: typeof message.text === 'string' ? message.text : '',
        waMessageId: messageId,
        status: message.direction === 'outbound' ? 'sent' : 'received',
        timestamp: timestampToDate(message.received_at || message.created_at),
        from: typeof message.from === 'string' ? message.from : null,
        to: typeof message.to === 'string' ? message.to : null,
        raw: message.raw || null,
      });
    }

    await writeAuditLog({
      actorUid: auth.uid,
      actorRole: userData.role,
      actorEmail: userData.email,
      action: 'whatsapp_lead_linked',
      targetType: 'lead',
      targetId: leadId,
      summary: `WhatsApp message linked to lead ${leadId}.`,
      metadata: {
        messageId,
        normalizedPhone,
      },
    });

    return NextResponse.json({ ok: true, leadId, normalizedPhone });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('WhatsApp lead link failed:', err);
    return NextResponse.json({ error: 'Failed to link WhatsApp message to lead.' }, { status: 500 });
  }
}
