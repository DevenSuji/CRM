import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  findLeadByWhatsAppPhone,
  upsertWhatsAppConversationMessage,
} from '@/lib/api/whatsappConversations';
import { adminDb } from '@/lib/firebase-admin';
import { extractInboundWhatsAppMessages, verifyMetaSignature } from '@/lib/utils/whatsappWebhook';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  const verifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (!verifyToken) {
    return NextResponse.json({ error: 'WhatsApp webhook verify token is not configured.' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) {
    return NextResponse.json({ error: 'WhatsApp app secret is not configured.' }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook JSON.' }, { status: 400 });
  }

  const messages = extractInboundWhatsAppMessages(payload);
  for (const message of messages) {
    const lead = await findLeadByWhatsAppPhone(message.normalizedPhone);
    const leadId = lead?.id || null;
    const receivedAt = Timestamp.fromDate(new Date(message.timestampIso));

    await adminDb.collection('whatsapp_messages').doc(message.id).set({
      direction: 'inbound',
      from: message.from,
      normalized_phone: message.normalizedPhone,
      to_phone_number_id: message.phoneNumberId || null,
      lead_id: leadId,
      type: message.type,
      text: message.text,
      received_at: receivedAt,
      created_at: FieldValue.serverTimestamp(),
      raw: message.raw,
    }, { merge: true });

    await upsertWhatsAppConversationMessage({
      normalizedPhone: message.normalizedPhone,
      displayPhone: message.from,
      lead,
      direction: 'inbound',
      type: message.type,
      text: message.text,
      waMessageId: message.id,
      status: 'received',
      timestamp: new Date(message.timestampIso),
      from: message.from,
      to: message.phoneNumberId || null,
      raw: message.raw,
    });

    if (leadId) {
      await adminDb.collection('leads').doc(leadId).update({
        activity_log: FieldValue.arrayUnion({
          id: `wa_in_${message.id}`,
          type: 'whatsapp_received',
          text: `WhatsApp received: ${message.text}`,
          author: 'WhatsApp',
          created_at: message.timestampIso,
        }),
      });
    }
  }

  return NextResponse.json({ ok: true, received: messages.length });
}
