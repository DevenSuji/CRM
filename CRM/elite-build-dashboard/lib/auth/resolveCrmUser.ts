import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import { CRMUser, UserRole } from '@/lib/types/user';

/** Email that always gets superadmin, even if the Firestore doc says otherwise.
 *  Exists so the owner can never be locked out and self-heals on login. */
export const ROOT_SUPERADMIN_EMAIL = 'devensuji@gmail.com';

export interface MinimalFirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type ResolveResult =
  | { kind: 'ok'; user: CRMUser }
  | { kind: 'access_denied'; reason: 'inactive' | 'no_profile' | 'error' };

/** Firestore rejects `undefined` values. Strip them before writing. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Resolves the CRM user profile for a signed-in Firebase user. Encodes every
 *  auth-flow branch: existing user + self-heal, inactive gate, pending-doc
 *  migration, first-user bootstrap, access denied.
 *
 *  Extracted from AuthContext so each branch can be tested in isolation
 *  against the Firestore emulator. */
export async function resolveCrmUser(
  fbUser: MinimalFirebaseUser,
  db: Firestore
): Promise<ResolveResult> {
  const userEmail = (fbUser.email || '').toLowerCase();

  try {
    const userDocRef = doc(db, 'users', fbUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const data = userDoc.data();
      const docEmail = (data.email || userEmail || '').toLowerCase();

      // Self-heal: root superadmin drift fix.
      if (docEmail === ROOT_SUPERADMIN_EMAIL && data.role !== 'superadmin') {
        await updateDoc(userDocRef, { role: 'superadmin', active: true });
        data.role = 'superadmin';
        data.active = true;
      }

      if (data.active === false) {
        return { kind: 'access_denied', reason: 'inactive' };
      }
      return { kind: 'ok', user: { uid: fbUser.uid, ...data } as CRMUser };
    }

    // No doc by UID — look for a pre-registered pending doc.
    const pendingId = `pending_${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const pendingDoc = await getDoc(doc(db, 'users', pendingId));

    if (pendingDoc.exists()) {
      const pendingData = pendingDoc.data();
      const migrated: Omit<CRMUser, 'uid'> = {
        email: userEmail,
        name: pendingData.name || fbUser.displayName || userEmail,
        role: pendingData.role || 'sales_exec',
        active: true,
        photo_url: fbUser.photoURL || undefined,
        created_at: null,
      };
      await setDoc(userDocRef, stripUndefined({
        ...migrated,
        created_at: pendingData.created_at || serverTimestamp(),
      }));
      await deleteDoc(doc(db, 'users', pendingId));
      return { kind: 'ok', user: { uid: fbUser.uid, ...migrated } };
    }

    // Bootstrap path — first user OR root email.
    const countDoc = await getDoc(doc(db, 'crm_config', '_user_count'));
    const isFirstUser = !countDoc.exists();

    const shouldBootstrap = isFirstUser || userEmail === ROOT_SUPERADMIN_EMAIL;
    if (!shouldBootstrap) {
      return { kind: 'access_denied', reason: 'no_profile' };
    }

    const role: UserRole =
      userEmail === ROOT_SUPERADMIN_EMAIL ? 'superadmin'
      : isFirstUser ? 'superadmin'
      : 'sales_exec';

    const newUser: Omit<CRMUser, 'uid'> = {
      email: userEmail,
      name: fbUser.displayName || userEmail || 'Admin',
      role,
      active: true,
      photo_url: fbUser.photoURL || undefined,
      created_at: null,
    };
    await setDoc(userDocRef, stripUndefined({ ...newUser, created_at: serverTimestamp() }));
    await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });
    return { kind: 'ok', user: { uid: fbUser.uid, ...newUser } };
  } catch (err) {
    console.error('resolveCrmUser failed:', err);
    return { kind: 'access_denied', reason: 'error' };
  }
}
