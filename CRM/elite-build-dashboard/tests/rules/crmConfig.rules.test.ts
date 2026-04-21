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

  it.each(['superadmin', 'admin', 'sales_exec', 'channel_partner', 'viewer'] as const)(
    '%s can read (HIGH-RISK — see audit §4.1)', async (role) => {
      // This test pins the CURRENT permissive behavior. After Phase 5
      // hardening (Secret Manager migration) we flip the expectation:
      // only admin+superadmin should read whatsapp config. Regression guard.
      await env.withSecurityRulesDisabled(async (c) => {
        await c.firestore().doc('crm_config/whatsapp').set({ access_token: 'X' });
      });
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('crm_config/whatsapp').get());
    });
});

describe('crm_config — write', () => {
  it.each(['superadmin', 'admin'] as const)('%s can write any config doc', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('crm_config/whatsapp').set({ enabled: true }));
  });

  it.each(['sales_exec', 'channel_partner', 'viewer', 'digital_marketing'] as const)(
    '%s cannot write config (except property_match)', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('crm_config/whatsapp').set({ enabled: true }));
    });

  it('any active user can write crm_config/property_match (by design)', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'sales_exec' });
    await assertSucceeds(ctx.firestore().doc('crm_config/property_match').set({
      threshold_percent: 20,
    }));
  });

  it('brand-new auth\'d user can create _user_count (bootstrap path)', async () => {
    const ctx = authedNoProfile(env, 'first_ever');
    await assertSucceeds(ctx.firestore().doc('crm_config/_user_count').set({ count: 0 }));
  });

  it('non-admin CANNOT update _user_count after creation', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('crm_config/_user_count').set({ count: 5 });
    });
    const ctx = await authedAs(env, { uid: 'u1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('crm_config/_user_count').update({ count: 0 }));
  });
});
