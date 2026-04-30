import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
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

describe('crm_config — read', () => {
  it('unauthenticated cannot read', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('crm_config/whatsapp').set({ access_token: 'X' });
    });
    await assertFails(unauthed(env).firestore().doc('crm_config/whatsapp').get());
  });

  it.each(['superadmin', 'admin'] as const)(
    '%s can read secret-bearing config docs', async (role) => {
      await env.withSecurityRulesDisabled(async (c) => {
        await c.firestore().doc('crm_config/whatsapp').set({ access_token: 'X' });
        await c.firestore().doc('crm_config/ai').set({ api_key: 'X' });
        await c.firestore().doc('crm_config/lead_assignment').set({ strategy: 'round_robin' });
      });
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('crm_config/whatsapp').get());
      await assertSucceeds(ctx.firestore().doc('crm_config/ai').get());
      await assertSucceeds(ctx.firestore().doc('crm_config/lead_assignment').get());
    });

  it.each(['sales_exec', 'channel_partner', 'viewer', 'digital_marketing'] as const)(
    '%s cannot read secret-bearing config docs', async (role) => {
      await env.withSecurityRulesDisabled(async (c) => {
        await c.firestore().doc('crm_config/whatsapp').set({ access_token: 'X' });
        await c.firestore().doc('crm_config/ai').set({ api_key: 'X' });
      });
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('crm_config/whatsapp').get());
      await assertFails(ctx.firestore().doc('crm_config/ai').get());
    });

  it.each(['superadmin', 'admin', 'sales_exec', 'channel_partner', 'viewer', 'digital_marketing'] as const)(
    '%s can read non-secret config docs', async (role) => {
      await env.withSecurityRulesDisabled(async (c) => {
        await c.firestore().doc('crm_config/kanban').set({ lanes: [] });
      });
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('crm_config/kanban').get());
    });

  it('channel_partner cannot read internal operational config docs', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('crm_config/lead_assignment').set({ strategy: 'round_robin' });
      await c.firestore().doc('crm_config/nurture').set({ enabled: true });
      await c.firestore().doc('crm_config/_user_count').set({ count: 10 });
    });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertFails(ctx.firestore().doc('crm_config/lead_assignment').get());
    await assertFails(ctx.firestore().doc('crm_config/nurture').get());
    await assertFails(ctx.firestore().doc('crm_config/_user_count').get());
  });
});

describe('crm_config — write', () => {
  it.each(['superadmin', 'admin'] as const)('%s can write admin-managed config docs', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('crm_config/whatsapp').set({ enabled: true }));
  });

  it.each(['sales_exec', 'channel_partner', 'viewer', 'digital_marketing'] as const)(
    '%s cannot write admin config docs', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('crm_config/whatsapp').set({ enabled: true }));
    });

  it.each(['superadmin', 'admin'] as const)('%s can write crm_config/property_match', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('crm_config/property_match').set({
      threshold_percent: 20,
    }));
  });

  it.each(['sales_exec', 'channel_partner', 'viewer', 'digital_marketing'] as const)(
    '%s cannot write crm_config/property_match', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('crm_config/property_match').set({
        threshold_percent: 20,
      }));
    },
  );

  it('brand-new auth\'d user cannot create _user_count', async () => {
    const ctx = authedNoProfile(env, 'first_ever');
    await assertFails(ctx.firestore().doc('crm_config/_user_count').set({ count: 0 }));
  });

  it.each(['superadmin', 'admin'] as const)('%s cannot write server-owned _user_count', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('crm_config/_user_count').set({ count: 0 }));
  });

  it('non-admin CANNOT update _user_count after creation', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('crm_config/_user_count').set({ count: 5 });
    });
    const ctx = await authedAs(env, { uid: 'u1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('crm_config/_user_count').update({ count: 0 }));
  });
});
