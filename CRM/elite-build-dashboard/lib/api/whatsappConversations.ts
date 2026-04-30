import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import type { WhatsAppMessageDirection, WhatsAppMessageStatus, WhatsAppMessageType } from '@/lib/types/communication';
import type { Lead } from '@/lib/types/lead';
import { normalizePhoneForDuplicate } from '@/lib/utils/leadDuplicates';

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function conversationIdForPhone(normalizedPhone: string): string {
  return `phone_${normalizedPhone.replace(/[^\dA-Za-z_-]/g, '')}`;
}

export function messageDocId(waMessageId: string): string {
  return waMessageId.replace(/[/.#[\]]/g, '_');
}

export function leadDisplayName(lead?: Lead | null): string | null {
  return lead?.raw_data?.lead_name || null;
}

export function leadPrimaryWhatsAppPhone(lead: Lead): string | null {
  return (
    normalizePhoneForDuplicate(lead.raw_data.whatsapp) ||
    normalizePhoneForDuplicate(lead.raw_data.whatsapp_number) ||
    normalizePhoneForDuplicate(lead.raw_data.phone)
  );
}

export function serviceWindowExpiresAt(lastCustomerMessageAt: Date): Date {
  return new Date(lastCustomerMessageAt.getTime() + SERVICE_WINDOW_MS);
}

export function serviceWindowIsOpen(value: unknown, now = new Date()): boolean {
  if (!value) return false;
  const date = value instanceof Timestamp
    ? value.toDate()
    : value instanceof Date
      ? value
      : null;
  return Boolean(date && date.getTime() > now.getTime());
}

export async function findLeadByWhatsAppPhone(normalizedPhone: string): Promise<Lead | null> {
  const snap = await adminDb
    .collection('leads')
    .where('duplicate_keys.phones', 'array-contains', normalizedPhone)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Lead;
}

export async function getConversationByPhone(normalizedPhone: string) {
  const ref = adminDb.collection('whatsapp_conversations').doc(conversationIdForPhone(normalizedPhone));
  const snap = await ref.get();
  return snap.exists ? snap.data() || null : null;
}

export async function syncWhatsAppConversationsForLead(lead: Lead): Promise<number> {
  const updates = {
    lead_id: lead.id,
    lead_name: leadDisplayName(lead),
    lead_status: lead.status || null,
    assigned_to: lead.assigned_to || null,
    owner_uid: lead.owner_uid || null,
    updated_at: FieldValue.serverTimestamp(),
  };

  const byLead = await adminDb
    .collection('whatsapp_conversations')
    .where('lead_id', '==', lead.id)
    .get();

  const batch = adminDb.batch();
  let count = 0;
  for (const doc of byLead.docs) {
    batch.set(doc.ref, updates, { merge: true });
    count += 1;
  }

  const primaryPhone = leadPrimaryWhatsAppPhone(lead);
  if (primaryPhone) {
    const ref = adminDb.collection('whatsapp_conversations').doc(conversationIdForPhone(primaryPhone));
    batch.set(ref, {
      normalized_phone: primaryPhone,
      display_phone: primaryPhone,
      created_at: FieldValue.serverTimestamp(),
      ...updates,
    }, { merge: true });
    count += byLead.docs.some(doc => doc.id === ref.id) ? 0 : 1;
  }

  if (count > 0) await batch.commit();
  return count;
}

interface UpsertConversationMessageInput {
  normalizedPhone: string;
  displayPhone?: string | null;
  lead?: Lead | null;
  direction: WhatsAppMessageDirection;
  type: WhatsAppMessageType;
  text: string;
  waMessageId: string;
  status: WhatsAppMessageStatus;
  timestamp: Date;
  from?: string | null;
  to?: string | null;
  sentBy?: string | null;
  sentByName?: string | null;
  templateName?: string | null;
  raw?: unknown;
}

export async function upsertWhatsAppConversationMessage(input: UpsertConversationMessageInput): Promise<string> {
  const conversationId = conversationIdForPhone(input.normalizedPhone);
  const conversationRef = adminDb.collection('whatsapp_conversations').doc(conversationId);
  const messageRef = conversationRef.collection('messages').doc(messageDocId(input.waMessageId));
  const timestamp = Timestamp.fromDate(input.timestamp);
  const preview = input.text || `[${input.type} message]`;
  const isInbound = input.direction === 'inbound';
  const serviceWindowDate = isInbound ? serviceWindowExpiresAt(input.timestamp) : null;

  await adminDb.runTransaction(async transaction => {
    const conversationSnap = await transaction.get(conversationRef);
    const current = conversationSnap.exists ? conversationSnap.data() || {} : {};
    const currentUnread = typeof current.unread_count === 'number' ? current.unread_count : 0;
    const assignedTo = input.lead?.assigned_to || current.assigned_to || null;
    const leadId = input.lead?.id || current.lead_id || null;

    transaction.set(conversationRef, {
      normalized_phone: input.normalizedPhone,
      display_phone: input.displayPhone || input.normalizedPhone,
      lead_id: leadId,
      lead_name: input.lead ? leadDisplayName(input.lead) : current.lead_name || null,
      lead_status: input.lead?.status || current.lead_status || null,
      assigned_to: assignedTo,
      owner_uid: input.lead?.owner_uid || current.owner_uid || null,
      last_message_at: timestamp,
      last_message_preview: preview.slice(0, 160),
      last_direction: input.direction,
      last_message_type: input.type,
      unread_count: isInbound ? currentUnread + 1 : currentUnread,
      ...(isInbound ? {
        last_customer_message_at: timestamp,
        service_window_expires_at: Timestamp.fromDate(serviceWindowDate!),
      } : {}),
      created_at: current.created_at || FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(messageRef, {
      conversation_id: conversationId,
      direction: input.direction,
      type: input.type,
      text: input.text || null,
      wa_message_id: input.waMessageId,
      status: input.status,
      from: input.from || null,
      to: input.to || null,
      normalized_phone: input.normalizedPhone,
      lead_id: leadId,
      sent_by: input.sentBy || null,
      sent_by_name: input.sentByName || null,
      template_name: input.templateName || null,
      timestamp,
      created_at: FieldValue.serverTimestamp(),
      raw: input.raw || null,
    }, { merge: true });
  });

  return conversationId;
}
