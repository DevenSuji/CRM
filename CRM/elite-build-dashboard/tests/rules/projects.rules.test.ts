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

async function seedProject(id: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (c) => {
    await c.firestore().doc(`projects/${id}`).set({
      id,
      name: 'Test Project',
      builder: 'Elite',
      campaigns: [],
      ...data,
    });
  });
}

describe('projects — read', () => {
  it('unauthenticated cannot read', async () => {
    await seedProject('p1');
    await assertFails(unauthed(env).firestore().doc('projects/p1').get());
  });

  it.each([
    'superadmin', 'admin', 'sales_exec', 'channel_partner',
    'digital_marketing', 'viewer',
  ] as const)('%s (active) can read', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').get());
  });

  it.each(['hr', 'payroll_finance'] as const)('%s cannot read (inactive-equivalent)', async (role) => {
    // hr/payroll_finance are ACTIVE users with capability-empty role, BUT the
    // Firestore rule for projects is `allow read: if isActive()` — so they
    // actually CAN read at the rules level. UI gates keep them out. This test
    // pins that surprising behavior so changes are deliberate.
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').get());
  });
});

describe('projects — create/delete', () => {
  it.each(['superadmin', 'admin'] as const)('%s can create', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/new').set({ name: 'X', builder: 'Y', campaigns: [] }));
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot create', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('projects/new').set({ name: 'X', builder: 'Y', campaigns: [] }));
    });

  it.each(['superadmin', 'admin'] as const)('%s can delete', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').delete());
  });

  it('digital_marketing cannot delete', async () => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role: 'digital_marketing' });
    await assertFails(ctx.firestore().doc('projects/p1').delete());
  });
});

describe('projects — update (field-level rule for digital_marketing)', () => {
  it.each(['superadmin', 'admin'] as const)('%s can update any field', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').update({ name: 'Renamed' }));
  });

  describe('digital_marketing', () => {
    it('can update campaigns field alone', async () => {
      await seedProject('p1');
      const ctx = await authedAs(env, { uid: 'dm1', role: 'digital_marketing' });
      await assertSucceeds(ctx.firestore().doc('projects/p1').update({
        campaigns: ['new-campaign'],
      }));
    });

    it('can update campaigns + updated_at together', async () => {
      await seedProject('p1');
      const ctx = await authedAs(env, { uid: 'dm1', role: 'digital_marketing' });
      await assertSucceeds(ctx.firestore().doc('projects/p1').update({
        campaigns: ['c1'],
        updated_at: new Date(),
      }));
    });

    it('cannot update name (non-campaign field)', async () => {
      await seedProject('p1');
      const ctx = await authedAs(env, { uid: 'dm1', role: 'digital_marketing' });
      await assertFails(ctx.firestore().doc('projects/p1').update({ name: 'Hacked' }));
    });

    it('cannot update campaigns AND a protected field in the same write', async () => {
      await seedProject('p1');
      const ctx = await authedAs(env, { uid: 'dm1', role: 'digital_marketing' });
      await assertFails(ctx.firestore().doc('projects/p1').update({
        campaigns: ['c1'],
        builder: 'Other',
      }));
    });
  });

  it.each(['sales_exec', 'channel_partner', 'viewer'] as const)(
    '%s cannot update any project field', async (role) => {
      await seedProject('p1');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('projects/p1').update({ name: 'X' }));
      await assertFails(ctx.firestore().doc('projects/p1').update({ campaigns: ['x'] }));
    });
});
