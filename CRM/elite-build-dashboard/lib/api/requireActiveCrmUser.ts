import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { CRMUser } from '@/lib/types/user';

export type ActiveCrmUserResult =
  | { ok: true; uid: string; user: CRMUser }
  | { ok: false; response: NextResponse };

export async function requireActiveCrmUser(req: NextRequest): Promise<ActiveCrmUserResult> {
  const idToken = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!idToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const user = userSnap.data() as CRMUser | undefined;
    if (user?.active !== true) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Active CRM user required.' }, { status: 403 }),
      };
    }
    return { ok: true, uid: decoded.uid, user: { ...user, uid: decoded.uid } };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid authentication token.' }, { status: 401 }),
    };
  }
}
