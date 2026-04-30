import type { Timestamp } from 'firebase/firestore';

export type WhatsAppMessageDirection = 'inbound' | 'outbound';
export type WhatsAppMessageType = 'text' | 'image' | 'document' | 'button' | 'interactive' | 'template' | 'unknown';
export type WhatsAppMessageStatus = 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppMessage {
  id: string;
  direction: WhatsAppMessageDirection;
  from: string;
  to?: string;
  normalized_phone?: string;
  to_phone_number_id?: string;
  lead_id?: string | null;
  type: WhatsAppMessageType;
  text: string;
  received_at: Timestamp | null;
  created_at: Timestamp | null;
  sent_by?: string;
  linked_at?: Timestamp | null;
  linked_by?: string;
  raw?: unknown;
}

export interface WhatsAppConversation {
  id: string;
  normalized_phone: string;
  display_phone?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  lead_status?: string | null;
  assigned_to?: string | null;
  owner_uid?: string | null;
  last_message_at: Timestamp | null;
  last_customer_message_at?: Timestamp | null;
  service_window_expires_at?: Timestamp | null;
  last_message_preview?: string | null;
  last_direction?: WhatsAppMessageDirection | null;
  last_message_type?: WhatsAppMessageType | null;
  unread_count?: number;
  unread_by?: Record<string, number>;
  created_at?: Timestamp | null;
  updated_at?: Timestamp | null;
}

export interface WhatsAppConversationMessage {
  id: string;
  conversation_id: string;
  direction: WhatsAppMessageDirection;
  type: WhatsAppMessageType;
  text?: string | null;
  wa_message_id?: string | null;
  status: WhatsAppMessageStatus;
  from?: string | null;
  to?: string | null;
  normalized_phone: string;
  lead_id?: string | null;
  sent_by?: string | null;
  sent_by_name?: string | null;
  template_name?: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  timestamp: Timestamp | null;
  created_at: Timestamp | null;
  raw?: unknown;
}
