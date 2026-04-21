import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

/** Seed one lead owned by `ownerUid` directly (bypassing rules). */
async function seedLead(id: string, ownerUid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`leads/${id}`).set({
      id,
      owner_uid: ownerUid,
      raw: { lead_name: 'Test', phone: '+919999999999' },
      status: 'New',
    });
  });
}

describe('leads — read', () => {
  it('unauthenticated cannot read', async () => {
    await seedLead('lead1', 'someone');
    const ctx = unauthed(env);
    await assertFails(ctx.firestore().doc('leads/lead1').get());
  });

  it('inactive user cannot read', async () => {
    await seedLead('lead1', 'someone');
    const ctx = await authedAs(env, { uid: 'u1', role: 'admin', active: false });
    await assertFails(ctx.firestore().doc('leads/lead1').get());
  });

  it.each(['superadmin', 'admin', 'sales_exec', 'viewer'] as const)(
    '%s can read any lead', async (role) => {
      await seedLead('lead1', 'someone_else');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/lead1').get());
    });

  describe('channel_partner', () => {
    it('can read own lead', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertSucceeds(ctx.firestore().doc('leads/mine').get());
    });
    it('cannot read another CP\'s lead', async () => {
      await seedLead('theirs', 'cp2');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/theirs').get());
    });
    it('cannot list the whole collection (the ca9 bug — query must match rule)', async () => {
      await seedLead('mine', 'cp1');
      await seedLead('theirs', 'cp2');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      // Unscoped collection read should be denied.
      await assertFails(ctx.firestore().collection('leads').get());
    });
    it('can list leads filtered by owner_uid == self', async () => {
      await seedLead('mine', 'cp1');
      await seedLead('theirs', 'cp2');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      const q = ctx.firestore().collection('leads').where('owner_uid', '==', 'cp1');
      await assertSucceeds(q.get());
    });
  });

  it.each(['hr', 'payroll_finance', 'digital_marketing'] as const)(
    '%s cannot read leads', async (role) => {
      await seedLead('lead1', 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('leads/lead1').get());
    });
});

describe('leads — create', () => {
  it.each(['superadmin', 'admin', 'sales_exec'] as const)(
    '%s can create any lead', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'anyone',
        raw: { lead_name: 'X', phone: '+91' },
      }));
    });

  describe('channel_partner', () => {
    it('can create a lead owned by self', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertSucceeds(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'cp1',
        raw: { lead_name: 'X', phone: '+91' },
      }));
    });
    it('cannot create a lead owned by someone else', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'cp2',
        raw: { lead_name: 'X', phone: '+91' },
      }));
    });
  });

  it.each(['viewer', 'hr', 'payroll_finance', 'digital_marketing'] as const)(
    '%s cannot create leads', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'u1',
        raw: { lead_name: 'X', phone: '+91' },
      }));
    });
});

describe('leads — update', () => {
  it.each(['superadmin', 'admin', 'sales_exec'] as const)(
    '%s can update any lead', async (role) => {
      await seedLead('lead1', 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/lead1').update({ status: 'Nurturing' }));
    });

  describe('channel_partner', () => {
    it('can update own lead', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertSucceeds(ctx.firestore().doc('leads/mine').update({ status: 'First Call' }));
    });
    it('cannot update another CP\'s lead', async () => {
      await seedLead('theirs', 'cp2');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/theirs').update({ status: 'First Call' }));
    });
    it('cannot reassign owner_uid away from self', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/mine').update({ owner_uid: 'cp2' }));
    });
  });

  it.each(['viewer', 'digital_marketing', 'hr', 'payroll_finance'] as const)(
    '%s cannot update leads', async (role) => {
      await seedLead('lead1', 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('leads/lead1').update({ status: 'Nurturing' }));
    });
});

describe('leads — delete', () => {
  it.each(['superadmin', 'admin'] as const)(
    '%s can delete', async (role) => {
      await seedLead('lead1', 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/lead1').delete());
    });

  it.each(['sales_exec', 'channel_partner', 'viewer', 'digital_marketing', 'hr', 'payroll_finance'] as const)(
    '%s cannot delete', async (role) => {
      await seedLead('lead1', role === 'channel_partner' ? 'u1' : 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('leads/lead1').delete());
    });
});
