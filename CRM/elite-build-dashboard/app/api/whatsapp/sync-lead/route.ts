import { NextRequest, NextResponse } from 'next/server';
import { canReadLeadForRole } from '@/lib/api/leadAccess';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import { syncWhatsAppConversationsForLead } from '@/lib/api/whatsappConversations';
import { ApiValidationError, readJsonObject, requiredString } from '@/lib/api/validation';
import { adminDb } from '@/lib/firebase-admin';
import type { Lead } from '@/lib/types/lead';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'whatsapp-sync-lead', { actorUid: auth.uid, limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const payload = await readJsonObject(req, 2048);
    const leadId = requiredString(payload, 'leadId', { max: 160 });
    const leadSnap = await adminDb.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const lead = { id: leadSnap.id, ...leadSnap.data() } as Lead;
    if (!canReadLeadForRole(auth.user, lead)) {
      return NextResponse.json({ error: 'You do not have access to this lead.' }, { status: 403 });
    }

    const synced = await syncWhatsAppConversationsForLead(lead);
    return NextResponse.json({ ok: true, synced });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('WhatsApp lead sync failed:', err);
    return NextResponse.json({ error: 'Failed to sync WhatsApp lead access.' }, { status: 500 });
  }
}
