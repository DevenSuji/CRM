import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import type { UserRole } from '@/lib/types/user';

export type AuditAction =
  | 'lead_assignment_selected'
  | 'lead_unit_booked'
  | 'lead_unit_released'
  | 'lead_booked_stage_changed'
  | 'lead_merged'
  | 'lead_archived'
  | 'whatsapp_sent'
  | 'whatsapp_lead_linked'
  | 'whatsapp_lead_created';

type AuditMetadata = Record<string, string | number | boolean | null | undefined>;

type AuditLogInput = {
  actorUid: string;
  actorRole?: UserRole | string;
  actorEmail?: string | null;
  action: AuditAction;
  targetType: 'lead' | 'lead_assignment' | 'whatsapp_message';
  targetId: string;
  summary: string;
  metadata?: AuditMetadata;
};

function compactMetadata(metadata: AuditMetadata = {}): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value ?? null]),
  );
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await adminDb.collection('audit_logs').add({
      actor_uid: input.actorUid,
      actor_role: input.actorRole || null,
      actor_email: input.actorEmail || null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      summary: input.summary.slice(0, 1000),
      metadata: compactMetadata(input.metadata),
      created_at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
