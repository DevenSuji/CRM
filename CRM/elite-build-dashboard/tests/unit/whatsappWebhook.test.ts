import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  extractInboundWhatsAppMessages,
  normalizeWhatsAppPhone,
  verifyMetaSignature,
} from '@/lib/utils/whatsappWebhook';

describe('whatsappWebhook utilities', () => {
  it('normalizes WhatsApp phone numbers to the last ten digits', () => {
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizeWhatsAppPhone('919876543210')).toBe('9876543210');
    expect(normalizeWhatsAppPhone('12345')).toBeNull();
  });

  it('verifies Meta x-hub-signature-256 values', () => {
    const body = JSON.stringify({ ok: true });
    const secret = 'test_secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

    expect(verifyMetaSignature(body, signature, secret)).toBe(true);
    expect(verifyMetaSignature(body, 'sha256=bad', secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
  });

  it('extracts inbound text messages from Meta webhook payloads', () => {
    const messages = extractInboundWhatsAppMessages({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'phone_1' },
            messages: [{
              id: 'wamid.1',
              from: '919876543210',
              timestamp: '1777204800',
              type: 'text',
              text: { body: 'I am interested' },
            }],
          },
        }],
      }],
    });

    expect(messages).toEqual([expect.objectContaining({
      id: 'wamid.1',
      from: '919876543210',
      normalizedPhone: '9876543210',
      phoneNumberId: 'phone_1',
      type: 'text',
      text: 'I am interested',
      timestampIso: '2026-04-26T12:00:00.000Z',
    })]);
  });

  it('extracts readable labels from interactive replies', () => {
    const messages = extractInboundWhatsAppMessages({
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid.2',
              from: '9876543210',
              timestamp: '1777204800',
              type: 'interactive',
              interactive: { button_reply: { id: 'yes', title: 'Yes, schedule visit' } },
            }],
          },
        }],
      }],
    });

    expect(messages[0].text).toBe('Yes, schedule visit');
  });
});
