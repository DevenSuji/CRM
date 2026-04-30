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
    'superadmin', 'admin', 'sales_exec', 'digital_marketing', 'viewer',
  ] as const)('%s (active) can read', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').get());
  });

  describe('channel_partner', () => {
    it('can read assigned project', async () => {
      await seedProject('p1', { channel_partner_uids: ['cp1'] });
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertSucceeds(ctx.firestore().doc('projects/p1').get());
    });

    it('cannot read unassigned project', async () => {
      await seedProject('p1', { channel_partner_uids: ['cp2'] });
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('projects/p1').get());
    });

    it('cannot list all projects', async () => {
      await seedProject('p1', { channel_partner_uids: ['cp1'] });
      await seedProject('p2', { channel_partner_uids: ['cp2'] });
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().collection('projects').get());
    });

    it('can list only projects assigned to self', async () => {
      await seedProject('p1', { channel_partner_uids: ['cp1'] });
      await seedProject('p2', { channel_partner_uids: ['cp2'] });
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      const q = ctx.firestore().collection('projects').where('channel_partner_uids', 'array-contains', 'cp1');
      await assertSucceeds(q.get());
    });
  });

  it.each(['hr', 'payroll_finance'] as const)('%s cannot read (inactive-equivalent)', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('projects/p1').get());
  });
});

describe('projects — create/delete', () => {
  it.each(['superadmin', 'admin'] as const)('%s can create', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/new').set({
      name: 'X',
      builder: 'Y',
      location: 'Chennai',
      propertyType: 'Apartment',
      status: 'Active',
      heroImage: null,
      gallery: [],
      totalUnits: 0,
      priceRange: null,
      channel_partner_uids: [],
      campaigns: [],
    }));
  });

  it.each(['superadmin', 'admin'] as const)('%s cannot create malformed project records', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('projects/bad-status').set({
      name: 'X',
      builder: 'Y',
      location: 'Chennai',
      propertyType: 'Apartment',
      status: 'Hidden',
    }));
    await assertFails(ctx.firestore().doc('projects/bad-access').set({
      name: 'X',
      builder: 'Y',
      location: 'Chennai',
      propertyType: 'Apartment',
      status: 'Active',
      channel_partner_uids: 'cp1',
    }));
    await assertFails(ctx.firestore().doc('projects/unknown-field').set({
      name: 'X',
      builder: 'Y',
      location: 'Chennai',
      propertyType: 'Apartment',
      status: 'Active',
      internal_notes: 'should not be browser-writable',
    }));
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot create', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('projects/new').set({
        name: 'X',
        builder: 'Y',
        location: 'Chennai',
        propertyType: 'Apartment',
        status: 'Active',
        campaigns: [],
      }));
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
  it.each(['superadmin', 'admin'] as const)('%s can update governed project fields', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').update({
      name: 'Renamed',
      status: 'Upcoming',
      channel_partner_uids: ['cp1'],
    }));
  });

  it.each(['superadmin', 'admin'] as const)('%s cannot update malformed or unknown project fields', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('projects/p1').update({ status: 'Archived' }));
    await assertFails(ctx.firestore().doc('projects/p1').update({ propertyType: 'Castle' }));
    await assertFails(ctx.firestore().doc('projects/p1').update({ channel_partner_uids: 'cp1' }));
    await assertFails(ctx.firestore().doc('projects/p1').update({ created_at: new Date() }));
    await assertFails(ctx.firestore().doc('projects/p1').update({ internal_notes: 'hidden' }));
  });

  it.each(['superadmin', 'admin'] as const)('%s can update project geo from the browser geocode flow', async (role) => {
    await seedProject('p1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('projects/p1').update({
      geo: { lat: 12.97, lng: 77.59 },
    }));
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
