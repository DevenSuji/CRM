import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import type { CRMUser, UserRole } from '@/lib/types/user';

const ROOT_SUPERADMIN_EMAIL = (process.env.ROOT_SUPERADMIN_EMAIL || 'devensuji@gmail.com').trim().toLowerCase();

function sanitizePendingId(email: string): string {
  return `pending_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function isPendingUserDoc(id: string, data: FirebaseFirestore.DocumentData): boolean {
  return id.startsWith('pending_') || data.pending_registration === true || data.pending_invite === true;
}

function pendingDocMatchesEmail(data: FirebaseFirestore.DocumentData, email: string): boolean {
  const pendingEmail = typeof data.email === 'string' ? data.email.toLowerCase() : '';
  return !pendingEmail || pendingEmail === email;
}

async function findPendingUserByEmail(email: string) {
  const exactRef = adminDb.collection('users').doc(sanitizePendingId(email));
  const exactSnap = await exactRef.get();
  if (exactSnap.exists) {
    const data = exactSnap.data() || {};
    if (pendingDocMatchesEmail(data, email)) {
      return { ref: exactRef, snap: exactSnap };
    }
  }

  const pendingCandidates = await adminDb.collection('users').where('email', '==', email).get();
  for (const candidate of pendingCandidates.docs) {
    const data = candidate.data() || {};
    if (isPendingUserDoc(candidate.id, data) && pendingDocMatchesEmail(data, email)) {
      return { ref: candidate.ref, snap: candidate };
    }
  }

  return null;
}

function compactUser(uid: string, data: FirebaseFirestore.DocumentData): CRMUser {
  return {
    uid,
    email: String(data.email || ''),
    name: String(data.name || data.email || uid),
    role: (data.role || 'viewer') as UserRole,
    active: data.active !== false,
    photo_url: typeof data.photo_url === 'string' ? data.photo_url : undefined,
    created_at: data.created_at || null,
  };
}

export async function POST(req: NextRequest) {
  const idToken = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!idToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const limited = enforceRateLimit(req, 'auth-resolve-crm-user', { actorUid: decoded.uid, limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const uid = decoded.uid;
    const email = String(decoded.email || '').toLowerCase();
    const displayName = typeof decoded.name === 'string' ? decoded.name : '';
    const photoUrl = typeof decoded.picture === 'string' ? decoded.picture : undefined;

    if (!email) {
      return NextResponse.json({ error: 'Google account email is required.' }, { status: 403 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const data = userSnap.data() || {};
      if (String(data.email || email).toLowerCase() === ROOT_SUPERADMIN_EMAIL && data.role !== 'superadmin') {
        await userRef.update({ role: 'superadmin', active: true });
        data.role = 'superadmin';
        data.active = true;
      }
      if (data.active === false) {
        return NextResponse.json({ error: 'CRM user is inactive.' }, { status: 403 });
      }
      return NextResponse.json({ user: compactUser(uid, data) });
    }

    const pendingProfile = await findPendingUserByEmail(email);
    if (pendingProfile) {
      const pending = pendingProfile.snap.data() || {};
      const userData = {
        uid,
        email,
        name: pending.name || displayName || email,
        role: pending.role || 'sales_exec',
        active: true,
        ...(photoUrl ? { photo_url: photoUrl } : {}),
        created_at: pending.created_at || FieldValue.serverTimestamp(),
      };
      await adminDb.runTransaction(async transaction => {
        const pendingSnap = await transaction.get(pendingProfile.ref);
        if (!pendingSnap.exists) {
          throw new Error('Pending CRM profile disappeared during migration.');
        }
        transaction.set(userRef, userData);
        transaction.delete(pendingProfile.ref);
      });
      return NextResponse.json({ user: compactUser(uid, userData) });
    }

    const countRef = adminDb.collection('crm_config').doc('_user_count');
    const countSnap = await countRef.get();
    const isRoot = email === ROOT_SUPERADMIN_EMAIL;
    const isFirstUser = !countSnap.exists;
    if (!isRoot && !isFirstUser) {
      return NextResponse.json({ error: 'No active CRM profile found.' }, { status: 403 });
    }

    const role: UserRole = 'superadmin';
    const userData = {
      uid,
      email,
      name: displayName || email || 'Admin',
      role,
      active: true,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
      created_at: FieldValue.serverTimestamp(),
    };
    await adminDb.runTransaction(async transaction => {
      transaction.set(userRef, userData);
      transaction.set(countRef, { count: 1 }, { merge: true });
    });

    return NextResponse.json({ user: compactUser(uid, userData) });
  } catch (err) {
    console.error('CRM user resolution failed:', err);
    return NextResponse.json({ error: 'Failed to resolve CRM user.' }, { status: 401 });
  }
}
