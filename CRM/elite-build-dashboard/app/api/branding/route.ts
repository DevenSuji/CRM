import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { DEFAULT_BRANDING, normalizeBranding } from '@/lib/utils/branding';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await adminDb.collection('crm_config').doc('branding').get();
    const branding = normalizeBranding(snap.exists ? snap.data() : null);
    return NextResponse.json(
      { branding },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('Failed to load public branding:', err);
    return NextResponse.json(
      { branding: DEFAULT_BRANDING },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
