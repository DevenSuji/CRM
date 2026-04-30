import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createEnv } from '../helpers/rulesEnv';
import { resolveCrmUser, ROOT_SUPERADMIN_EMAIL, MinimalFirebaseUser } from '@/lib/auth/resolveCrmUser';
import type { Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => { env = await createEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/** Runs the legacy resolver with rules disabled.
 *  Runtime login now uses the Admin SDK route, so bootstrap/pending migration
 *  writes are server-owned and Firestore rules intentionally block browser
 *  clients from performing those writes directly. */
async function withResolverDb<T>(fn: (db: Firestore) => Promise<T>): Promise<T> {
  let result: T;
  await env.withSecurityRulesDisabled(async (ctx) => {
    result = await fn(ctx.firestore() as unknown as Firestore);
  });
  return result!;
}

const fakeUser = (overrides: Partial<MinimalFirebaseUser> = {}): MinimalFirebaseUser => ({
  uid: 'u1',
  email: 'u1@test.local',
  displayName: 'Test User',
  photoURL: null,
  ...overrides,
});

describe('resolveCrmUser — existing user doc', () => {
  it('returns the user profile when role is normal and active', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', 'u1'), {
        uid: 'u1',
        email: 'u1@test.local',
        name: 'Existing',
        role: 'sales_exec',
        active: true,
        created_at: null,
      });
      const res = await resolveCrmUser(fakeUser(), db);
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') {
        expect(res.user.role).toBe('sales_exec');
        expect(res.user.uid).toBe('u1');
      }
    });
  });

  it('returns access_denied when user is inactive', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', 'u1'), {
        email: 'u1@test.local', role: 'admin', active: false, name: 'X', created_at: null,
      });
      const res = await resolveCrmUser(fakeUser(), db);
      expect(res.kind).toBe('access_denied');
      if (res.kind === 'access_denied') expect(res.reason).toBe('inactive');
    });
  });
});

describe('resolveCrmUser — root superadmin self-heal', () => {
  it('promotes root email to superadmin if doc says otherwise', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc, getDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', 'root_uid'), {
        email: ROOT_SUPERADMIN_EMAIL,
        role: 'sales_exec', // drift
        active: true,
        name: 'Root',
        created_at: null,
      });
      const res = await resolveCrmUser(
        fakeUser({ uid: 'root_uid', email: ROOT_SUPERADMIN_EMAIL }),
        db
      );
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') expect(res.user.role).toBe('superadmin');

      // Persisted to Firestore.
      const after = await getDoc(doc(db, 'users', 'root_uid'));
      expect(after.data()?.role).toBe('superadmin');
    });
  });

  it('promotes root email even when active was set to false (anti-lockout)', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', 'root_uid'), {
        email: ROOT_SUPERADMIN_EMAIL,
        role: 'viewer',
        active: false,
        name: 'Root',
        created_at: null,
      });
      const res = await resolveCrmUser(
        fakeUser({ uid: 'root_uid', email: ROOT_SUPERADMIN_EMAIL }),
        db
      );
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') {
        expect(res.user.role).toBe('superadmin');
        expect(res.user.active).toBe(true);
      }
    });
  });
});

describe('resolveCrmUser — pending-doc migration', () => {
  it('migrates pending_<email> to users/<uid> and deletes the pending doc', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc, getDoc } = await import('firebase/firestore');
      // Seed _user_count so we don't trip the first-user path.
      await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });
      const email = 'newhire@test.local';
      const pendingId = `pending_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await setDoc(doc(db, 'users', pendingId), {
        email, name: 'New Hire', role: 'admin', active: false, created_at: null,
      });

      const res = await resolveCrmUser(fakeUser({ uid: 'newhire_uid', email }), db);
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') {
        expect(res.user.role).toBe('admin');
        expect(res.user.uid).toBe('newhire_uid');
        expect(res.user.active).toBe(true); // always flipped to true on migrate
      }

      const real = await getDoc(doc(db, 'users', 'newhire_uid'));
      expect(real.exists()).toBe(true);
      const pending = await getDoc(doc(db, 'users', pendingId));
      expect(pending.exists()).toBe(false);
    });
  });

  it('defaults to sales_exec when pending doc has no role', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });
      const email = 'norole@test.local';
      const pendingId = `pending_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await setDoc(doc(db, 'users', pendingId), { email, name: 'No Role' });

      const res = await resolveCrmUser(fakeUser({ uid: 'norole_uid', email }), db);
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') expect(res.user.role).toBe('sales_exec');
    });
  });

  it('migrates a mixed-case pending doc id by matching the normalized email', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc, getDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });
      const email = 'elitebuildinfratech@gmail.com';
      const legacyPendingId = 'pending_EliteBuildInfraTech_gmail_com';
      await setDoc(doc(db, 'users', legacyPendingId), {
        email,
        name: 'EliteBuild',
        role: 'admin',
        active: true,
        pending_registration: true,
        created_at: null,
      });

      const res = await resolveCrmUser(fakeUser({ uid: 'elitebuild_uid', email }), db);
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') {
        expect(res.user.uid).toBe('elitebuild_uid');
        expect(res.user.email).toBe(email);
        expect(res.user.role).toBe('admin');
      }

      const real = await getDoc(doc(db, 'users', 'elitebuild_uid'));
      expect(real.exists()).toBe(true);
      expect(real.data()?.email).toBe(email);
      const pending = await getDoc(doc(db, 'users', legacyPendingId));
      expect(pending.exists()).toBe(false);
    });
  });
});

describe('resolveCrmUser — first-user bootstrap', () => {
  it('bootstraps the very first sign-in as superadmin', async () => {
    await withResolverDb(async (db) => {
      const { doc, getDoc } = await import('firebase/firestore');
      const res = await resolveCrmUser(
        fakeUser({ uid: 'first_uid', email: 'boss@company.com' }),
        db
      );
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') expect(res.user.role).toBe('superadmin');

      // _user_count doc is created so future users don't also bootstrap.
      const counter = await getDoc(doc(db, 'crm_config', '_user_count'));
      expect(counter.exists()).toBe(true);
    });
  });

  it('bootstraps root email as superadmin even if not the first user', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });

      const res = await resolveCrmUser(
        fakeUser({ uid: 'root_late', email: ROOT_SUPERADMIN_EMAIL }),
        db
      );
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') expect(res.user.role).toBe('superadmin');
    });
  });

  it('denies a non-root, non-first user with no pending doc', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });

      const res = await resolveCrmUser(
        fakeUser({ uid: 'rando_uid', email: 'rando@unknown.com' }),
        db
      );
      expect(res.kind).toBe('access_denied');
      if (res.kind === 'access_denied') expect(res.reason).toBe('no_profile');
    });
  });
});

describe('resolveCrmUser — edge cases', () => {
  it('email comparison is case-insensitive for root superadmin', async () => {
    await withResolverDb(async (db) => {
      const res = await resolveCrmUser(
        fakeUser({ uid: 'case1', email: 'DeVeNSuJi@GMAIL.COM' }),
        db
      );
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') expect(res.user.role).toBe('superadmin');
    });
  });

  it('handles a firebase user with null email', async () => {
    await withResolverDb(async (db) => {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'crm_config', '_user_count'), { count: 1 });
      const res = await resolveCrmUser(fakeUser({ email: null, uid: 'noemail' }), db);
      expect(res.kind).toBe('access_denied');
      if (res.kind === 'access_denied') expect(res.reason).toBe('no_profile');
    });
  });
});
