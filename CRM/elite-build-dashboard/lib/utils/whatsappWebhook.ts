import crypto from 'crypto';

export interface InboundWhatsAppMessage {
  id: string;
  from: string;
  normalizedPhone: string;
  type: InboundWhatsAppMessageType;
  text: string;
  timestampIso: string;
  phoneNumberId?: string;
  raw: unknown;
}

type InboundWhatsAppMessageType = 'text' | 'image' | 'button' | 'interactive' | 'unknown';

export function normalizeWhatsAppPhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const left = Buffer.from(signature, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function messageText(message: Record<string, unknown>): string {
  const type = asString(message.type);
  const text = asRecord(message.text);
  const button = asRecord(message.button);
  const image = asRecord(message.image);
  const interactive = asRecord(message.interactive);
  const buttonReply = asRecord(interactive.button_reply);
  const listReply = asRecord(interactive.list_reply);

  if (type === 'text') return asString(text.body);
  if (type === 'button') return asString(button.text) || asString(button.payload);
  if (type === 'interactive') {
    return (
      asString(buttonReply.title) ||
      asString(listReply.title) ||
      asString(buttonReply.id) ||
      asString(listReply.id)
    );
  }
  if (type === 'image') return asString(image.caption) || '[Image received]';
  return `[${type || 'unknown'} message received]`;
}

export function extractInboundWhatsAppMessages(payload: unknown): InboundWhatsAppMessage[] {
  const entries = asArray(asRecord(payload).entry);

  const out: InboundWhatsAppMessage[] = [];
  for (const entry of entries) {
    const changes = asArray(asRecord(entry).changes);
    for (const change of changes) {
      const value = asRecord(asRecord(change).value);
      const phoneNumberId = asRecord(value.metadata).phone_number_id;
      const messages = asArray(value.messages);
      for (const message of messages) {
        const messageRecord = asRecord(message);
        const id = asString(messageRecord.id);
        const from = asString(messageRecord.from);
        if (!id || !from) continue;
        const normalizedPhone = normalizeWhatsAppPhone(from);
        if (!normalizedPhone) continue;
        const timestampSeconds = Number(messageRecord.timestamp);
        const timestampMs = timestampSeconds > 0 ? timestampSeconds * 1000 : Date.now();
        const rawType = asString(messageRecord.type);
        const type: InboundWhatsAppMessageType =
          rawType === 'text' || rawType === 'image' || rawType === 'button' || rawType === 'interactive'
            ? rawType
            : 'unknown';
        out.push({
          id,
          from,
          normalizedPhone,
          type,
          text: messageText(messageRecord),
          timestampIso: new Date(timestampMs).toISOString(),
          phoneNumberId: typeof phoneNumberId === 'string' ? phoneNumberId : undefined,
          raw: messageRecord,
        });
      }
    }
  }
  return out;
}
