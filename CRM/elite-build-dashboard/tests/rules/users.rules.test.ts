import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { createEnv, authedAs, unauthed } from '../helpers/rulesEnv';

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
      await c.firestore().doc('users/pending_abc').set({ email: 'new_user@test.local', role: 'admin', active: false });
    });
    const ctx = env.authenticatedContext('new_user', { email: 'new_user@test.local' });
    await assertSucceeds(ctx.firestore().doc('users/pending_abc').get());
  });

  it('cannot read another user\'s pending_ doc', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/pending_abc').set({ email: 'other@test.local', role: 'admin', active: false });
    });
    const ctx = env.authenticatedContext('new_user', { email: 'new_user@test.local' });
    await assertFails(ctx.firestore().doc('users/pending_abc').get());
  });
});

describe('users — create', () => {
  it('brand-new user cannot create own superadmin doc during browser bootstrap', async () => {
    const ctx = env.authenticatedContext('newbie', { email: 'newbie@test.local' });
    await assertFails(ctx.firestore().doc('users/newbie').set({
      uid: 'newbie',
      email: 'newbie@test.local',
      name: 'New',
      role: 'superadmin',
      active: true,
      created_at: null,
    }));
  });

  it('brand-new non-bootstrap user cannot create own admin doc', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('crm_config/_user_count').set({ count: 1 });
    });
    const ctx = env.authenticatedContext('newbie', { email: 'newbie@test.local' });
    await assertFails(ctx.firestore().doc('users/newbie').set({
      uid: 'newbie',
      email: 'newbie@test.local',
      name: 'New',
      role: 'admin',
      active: true,
      created_at: null,
    }));
  });

  it('brand-new non-bootstrap user cannot create even a viewer self-doc', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('crm_config/_user_count').set({ count: 1 });
    });
    const ctx = env.authenticatedContext('newbie', { email: 'newbie@test.local' });
    await assertFails(ctx.firestore().doc('users/newbie').set({
      uid: 'newbie',
      email: 'newbie@test.local',
      name: 'New',
      role: 'viewer',
      active: true,
      created_at: null,
    }));
  });

  it('regular auth\'d user cannot create a pending_ doc', async () => {
    const ctx = await authedAs(env, { uid: 'anyone', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('users/pending_someone').set({
      email: 'pre@test.local',
      role: 'admin',
      active: false,
      created_at: null,
    }));
  });

  it('admin can create a pending non-superadmin user for onboarding', async () => {
    const ctx = await authedAs(env, { uid: 'admin1', role: 'admin' });
    await assertSucceeds(ctx.firestore().doc('users/pending_new_hire_test_local').set({
      email: 'new.hire@test.local',
      name: 'New Hire',
      role: 'sales_exec',
      active: true,
      photo_url: '',
      pending_registration: true,
      created_at: null,
    }));
  });

  it('admin cannot create a pending superadmin user', async () => {
    const ctx = await authedAs(env, { uid: 'admin1', role: 'admin' });
    await assertFails(ctx.firestore().doc('users/pending_boss_test_local').set({
      email: 'boss@test.local',
      name: 'Boss',
      role: 'superadmin',
      active: true,
      photo_url: '',
      pending_registration: true,
      created_at: null,
    }));
  });

  it('admin cannot create pending users with unsafe extra fields', async () => {
    const ctx = await authedAs(env, { uid: 'admin1', role: 'admin' });
    await assertFails(ctx.firestore().doc('users/pending_new_hire_test_local').set({
      email: 'new.hire@test.local',
      name: 'New Hire',
      role: 'sales_exec',
      active: true,
      photo_url: '',
      pending_registration: true,
      created_at: null,
      uid: 'someone_else',
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
  it('any user can update own display fields', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'viewer' });
    await assertSucceeds(ctx.firestore().doc('users/u1').update({ name: 'Renamed' }));
  });

  it('user cannot update own active flag', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'viewer' });
    await assertFails(ctx.firestore().doc('users/u1').update({ active: false }));
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

  it('user cannot promote themselves', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'viewer' });
    await assertFails(ctx.firestore().doc('users/u1').update({ role: 'superadmin', active: true }));
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

  it('matching pre-registered user can delete their pending_ doc during migration', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/pending_x').set({ email: 'new_user@test.local', role: 'admin' });
    });
    const ctx = env.authenticatedContext('new_user', { email: 'new_user@test.local' });
    await assertSucceeds(ctx.firestore().doc('users/pending_x').delete());
  });

  it('cannot delete another user\'s pending_ doc', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('users/pending_x').set({ email: 'other@test.local', role: 'admin' });
    });
    const ctx = env.authenticatedContext('new_user', { email: 'new_user@test.local' });
    await assertFails(ctx.firestore().doc('users/pending_x').delete());
  });
});
