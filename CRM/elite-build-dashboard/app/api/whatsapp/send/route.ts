import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/api/auditLog';
import { canMutateLeadForRole } from '@/lib/api/leadAccess';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import {
  getConversationByPhone,
  serviceWindowIsOpen,
  upsertWhatsAppConversationMessage,
} from '@/lib/api/whatsappConversations';
import { ApiValidationError, optionalString, optionalStringArray, readJsonObject, requiredEnum, requiredString } from '@/lib/api/validation';
import { WhatsAppConfig } from '@/lib/types/config';
import type { Lead } from '@/lib/types/lead';
import { normalizePhoneForDuplicate } from '@/lib/utils/leadDuplicates';

type WhatsAppPayload =
  | { to: string; type: 'text'; text: { body: string }; leadId?: string }
  | { to: string; type: 'image'; image: { link: string; caption?: string }; leadId?: string }
  | {
      to: string;
      type: 'template';
      templateName: 'site_visit_confirmation' | 'site_visit_reminder' | 'property_match';
      parameters?: string[];
      leadId?: string;
    };

const WHATSAPP_SEND_ALLOWED_ROLES = new Set(['superadmin', 'admin', 'sales_exec']);

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = `91${cleaned}`;
  return cleaned;
}

function extractGraphError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    // Fall through to raw response.
  }
  return raw.trim();
}

function extractSentMessageId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const messages = (response as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  const first = messages[0];
  if (!first || typeof first !== 'object') return null;
  const id = (first as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id : null;
}

function outboundText(payload: WhatsAppPayload, templateName?: string): string {
  if (payload.type === 'text') return payload.text.body;
  if (payload.type === 'image') return payload.image.caption || '[Image sent]';
  return `Template sent: ${templateName || payload.templateName}`;
}

function leadPhoneKeys(lead: Lead): Set<string> {
  const raw = lead.raw_data || {};
  return new Set([
    ...(lead.duplicate_keys?.phones || []),
    normalizePhoneForDuplicate(raw.phone),
    normalizePhoneForDuplicate(raw.whatsapp),
    normalizePhoneForDuplicate(raw.whatsapp_number),
  ].filter((value): value is string => Boolean(value)));
}

function parseWhatsAppPayload(payload: Record<string, unknown>): WhatsAppPayload {
  const to = requiredString(payload, 'to', { max: 32 });
  const leadId = optionalString(payload, 'leadId', { max: 200 });
  const type = requiredEnum(payload, 'type', ['text', 'image', 'template'] as const);

  if (type === 'text') {
    const textPayload = payload.text;
    if (!textPayload || typeof textPayload !== 'object' || Array.isArray(textPayload)) {
      throw new ApiValidationError('text.body is required.');
    }
    return {
      to,
      type,
      text: { body: requiredString(textPayload as Record<string, unknown>, 'body', { max: 4096, label: 'text.body' }) },
      ...(leadId ? { leadId } : {}),
    };
  }

  if (type === 'image') {
    const imagePayload = payload.image;
    if (!imagePayload || typeof imagePayload !== 'object' || Array.isArray(imagePayload)) {
      throw new ApiValidationError('image.link is required.');
    }
    const image = imagePayload as Record<string, unknown>;
    return {
      to,
      type,
      image: {
        link: requiredString(image, 'link', { max: 2000, label: 'image.link' }),
        caption: optionalString(image, 'caption', { max: 1024 }),
      },
      ...(leadId ? { leadId } : {}),
    };
  }

  return {
    to,
    type,
    templateName: requiredEnum(payload, 'templateName', ['site_visit_confirmation', 'site_visit_reminder', 'property_match'] as const),
    parameters: optionalStringArray(payload, 'parameters', { maxItems: 10, maxItemLength: 500 }),
    ...(leadId ? { leadId } : {}),
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'whatsapp-send', { actorUid: auth.uid, limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const userData = auth.user;
    if (!WHATSAPP_SEND_ALLOWED_ROLES.has(String(userData.role || ''))) {
      return NextResponse.json({ error: 'WhatsApp send access required.' }, { status: 403 });
    }

    const payload = parseWhatsAppPayload(await readJsonObject(req, 12_288));
    const leadId = typeof payload.leadId === 'string' && payload.leadId.trim() ? payload.leadId.trim() : null;
    let leadRef: FirebaseFirestore.DocumentReference | null = null;
    let lead: Lead | null = null;
    const outboundPhone = normalizePhoneForDuplicate(payload.to);

    if (leadId) {
      leadRef = adminDb.collection('leads').doc(leadId);
      const leadSnap = await leadRef.get();
      if (!leadSnap.exists) {
        return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
      }
      lead = { id: leadSnap.id, ...leadSnap.data() } as Lead;
      if (!canMutateLeadForRole(userData, lead)) {
        return NextResponse.json({ error: 'You do not have access to this lead.' }, { status: 403 });
      }
      if (lead.archived_at || lead.archived_at_iso || lead.archive_kind) {
        return NextResponse.json({ error: 'Cannot send WhatsApp messages for archived leads.' }, { status: 409 });
      }
      const phoneKeys = leadPhoneKeys(lead);
      if (phoneKeys.size > 0 && outboundPhone && !phoneKeys.has(outboundPhone)) {
        return NextResponse.json(
          { error: 'WhatsApp number does not match the linked lead.' },
          { status: 400 },
        );
      }
    } else {
      if (userData.role === 'sales_exec') {
        return NextResponse.json({ error: 'A linked lead is required before sending.' }, { status: 403 });
      }
      if (!outboundPhone) {
        return NextResponse.json({ error: 'A valid lead or existing WhatsApp conversation is required.' }, { status: 400 });
      }
      const existingConversation = await adminDb
        .collection('whatsapp_messages')
        .where('normalized_phone', '==', outboundPhone)
        .limit(1)
        .get();
      if (existingConversation.empty) {
        const existingThread = outboundPhone ? await getConversationByPhone(outboundPhone) : null;
        if (!existingThread) {
          return NextResponse.json(
            { error: 'A linked lead or existing WhatsApp conversation is required before sending.' },
            { status: 403 },
          );
        }
      }
    }

    const conversation = outboundPhone ? await getConversationByPhone(outboundPhone) : null;
    if (payload.type !== 'template' && !serviceWindowIsOpen(conversation?.service_window_expires_at)) {
      return NextResponse.json(
        {
          error: 'The 24-hour WhatsApp service window is closed. Send an approved template before free-text messaging.',
          code: 'template_required',
        },
        { status: 409 },
      );
    }

    const whatsappToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
    if (!whatsappToken) {
      return NextResponse.json(
        { error: 'WhatsApp token not configured on the server. Set WHATSAPP_ACCESS_TOKEN.' },
        { status: 503 },
      );
    }

    const snap = await adminDb.collection('crm_config').doc('whatsapp').get();
    const config = (snap.exists ? snap.data() : {}) as Partial<WhatsAppConfig>;
    if (!snap.exists || config.enabled === false || !config.phone_number_id) {
      return NextResponse.json(
        { error: 'WhatsApp is not configured. Enable it in Admin Console and set Phone Number ID.' },
        { status: 503 },
      );
    }

    let templateName: string | undefined;
    if (payload.type === 'template') {
      const templates = {
        site_visit_confirmation: config.template_site_visit_confirmation,
        site_visit_reminder: config.template_site_visit_reminder,
        property_match: config.template_property_match,
      };
      templateName = templates[payload.templateName];
    }

    if (payload.type === 'template' && !templateName) {
      return NextResponse.json({ error: 'WhatsApp template is not configured.' }, { status: 503 });
    }

    const messagePayload = payload.type === 'template'
      ? {
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: payload.parameters?.length
              ? [{
                  type: 'body',
                  parameters: payload.parameters.map(text => ({ type: 'text', text })),
                }]
              : undefined,
          },
        }
      : payload.type === 'text'
        ? { type: 'text', text: payload.text }
        : { type: 'image', image: payload.image };

    const body = {
      messaging_product: 'whatsapp',
      to: normalizePhone(payload.to),
      ...messagePayload,
    };

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      const graphMessage = extractGraphError(errText);
      console.error('WhatsApp Graph API error:', { status: res.status, message: graphMessage });
      return NextResponse.json(
        { error: `WhatsApp request failed (${res.status}): ${graphMessage || 'Unknown error'}` },
        { status: 502 },
      );
    }

    const graphResponse = await res.json() as unknown;
    const sentMessageId = extractSentMessageId(graphResponse) || `out_${Date.now()}`;
    const sentText = outboundText(payload, templateName);

    await adminDb.collection('whatsapp_messages').doc(sentMessageId).set({
      direction: 'outbound',
      from: config.phone_number_id,
      to: body.to,
      normalized_phone: body.to.length >= 10 ? body.to.slice(-10) : body.to,
      lead_id: leadId,
      type: payload.type,
      text: sentText,
      received_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
      sent_by: auth.uid,
      raw: graphResponse,
    }, { merge: true });

    if (outboundPhone) {
      await upsertWhatsAppConversationMessage({
        normalizedPhone: outboundPhone,
        displayPhone: body.to,
        lead,
        direction: 'outbound',
        type: payload.type,
        text: sentText,
        waMessageId: sentMessageId,
        status: 'sent',
        timestamp: new Date(),
        from: config.phone_number_id,
        to: body.to,
        sentBy: auth.uid,
        sentByName: typeof userData.name === 'string' && userData.name.trim() ? userData.name.trim() : userData.email || auth.uid,
        templateName: payload.type === 'template' ? templateName || null : null,
        raw: graphResponse,
      });
    }

    if (leadRef) {
      await leadRef.update({
        activity_log: FieldValue.arrayUnion({
          id: `wa_out_${sentMessageId}`,
          type: 'whatsapp_sent',
          text: `WhatsApp sent: ${sentText}`,
          author: typeof userData.name === 'string' && userData.name.trim() ? userData.name.trim() : 'CRM User',
          created_at: new Date().toISOString(),
        }),
      });
    }

    await writeAuditLog({
      actorUid: auth.uid,
      actorRole: userData.role,
      actorEmail: userData.email,
      action: 'whatsapp_sent',
      targetType: 'whatsapp_message',
      targetId: sentMessageId,
      summary: `WhatsApp ${payload.type} sent to ${body.to}.`,
      metadata: {
        leadId,
        messageType: payload.type,
        templateName: payload.type === 'template' ? templateName || null : null,
      },
    });

    return NextResponse.json(graphResponse);
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('WhatsApp send route failed:', err);
    return NextResponse.json({ error: 'Failed to send WhatsApp message.' }, { status: 500 });
  }
}
