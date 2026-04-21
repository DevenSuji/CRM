import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { createEnv, authedAs, authedNoProfile, unauthed } from '../helpers/rulesEnv';

let env: RulesTestEnvironment;

beforeAll(async () => { env = await createEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('users — read', () => {
  it('any auth\'d user can read own doc', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'viewer' });
    await assertSucceeds(ctx.firestore().doc('users/u1').get());
  });

  it('unauthenticated cannot read', async () => {
    const ctx = unauthed(env);
    await assertFails(ctx.firestore().doc('users/u1').get());
  });

  it('sales_exec cannot read another user\'s doc', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/target').set({ role: 'admin', active: true });
    });
    const ctx = await authedAs(env, { uid: 'u1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('users/target').get());
  });

  it('channel_partner cannot list the users collection', async () => {
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertFails(ctx.firestore().collection('users').get());
  });

  it.each(['admin', 'superadmin'] as const)(
    '%s can list the users collection', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().collection('users').get());
    });

  it('any auth\'d user can read a pending_ doc', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/pending_abc').set({ role: 'admin', active: false });
    });
    const ctx = authedNoProfile(env, 'new_user');
    await assertSucceeds(ctx.firestore().doc('users/pending_abc').get());
  });
});

describe('users — create', () => {
  it('brand-new user can create own doc (first-login bootstrap)', async () => {
    const ctx = authedNoProfile(env, 'newbie');
    await assertSucceeds(ctx.firestore().doc('users/newbie').set({
      uid: 'newbie',
      email: 'newbie@test.local',
      name: 'New',
      role: 'viewer',
      active: true,
      created_at: null,
    }));
  });

  it('any auth\'d user can create a pending_ doc (superadmin pre-registration flow)', async () => {
    const ctx = authedNoProfile(env, 'anyone');
    await assertSucceeds(ctx.firestore().doc('users/pending_someone').set({
      email: 'pre@test.local',
      role: 'admin',
      active: false,
      created_at: null,
    }));
  });

  it('cannot create someone else\'s user doc', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'admin' });
    await assertFails(ctx.firestore().doc('users/someone_else').set({
      role: 'viewer', active: true,
    }));
  });

  it('superadmin can create any user doc', async () => {
    const ctx = await authedAs(env, { uid: 'sa', role: 'superadmin' });
    await assertSucceeds(ctx.firestore().doc('users/brand_new').set({
      uid: 'brand_new', email: 'x@y', name: 'X',
      role: 'sales_exec', active: true, created_at: null,
    }));
  });
});

describe('users — update', () => {
  it('any user can update own doc (rules are permissive by design — see audit §4.3)', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'viewer' });
    await assertSucceeds(ctx.firestore().doc('users/u1').update({ name: 'Renamed' }));
  });

  it('admin cannot update another user\'s role', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/target').set({ role: 'viewer', active: true });
    });
    const ctx = await authedAs(env, { uid: 'admin1', role: 'admin' });
    // Admin is NOT superadmin; rule only allows self-update or superadmin.
    await assertFails(ctx.firestore().doc('users/target').update({ role: 'admin' }));
  });

  it('superadmin can update another user\'s role', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/target').set({ role: 'viewer', active: true });
    });
    const ctx = await authedAs(env, { uid: 'sa', role: 'superadmin' });
    await assertSucceeds(ctx.firestore().doc('users/target').update({ role: 'admin' }));
  });

  it('KNOWN GAP (audit §4.3): user can promote themselves — rules allow self-update without field guards', async () => {
    // This test pins the CURRENT behavior so Phase 5 hardening flips the
    // expectation. When the rule gains field guards, change assertSucceeds →
    // assertFails here and in the self-edit test.
    const ctx = await authedAs(env, { uid: 'u1', role: 'viewer' });
    await assertSucceeds(ctx.firestore().doc('users/u1').update({ role: 'superadmin', active: true }));
  });
});

describe('users — delete', () => {
  it('superadmin can delete any user', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/target').set({ role: 'viewer' });
    });
    const ctx = await authedAs(env, { uid: 'sa', role: 'superadmin' });
    await assertSucceeds(ctx.firestore().doc('users/target').delete());
  });

  it('admin cannot delete another user', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/target').set({ role: 'viewer' });
    });
    const ctx = await authedAs(env, { uid: 'a', role: 'admin' });
    await assertFails(ctx.firestore().doc('users/target').delete());
  });

  it('any auth\'d user can delete a pending_ doc (migration flow)', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/pending_x').set({ role: 'admin' });
    });
    const ctx = authedNoProfile(env, 'whoever');
    await assertSucceeds(ctx.firestore().doc('users/pending_x').delete());
  });
});
