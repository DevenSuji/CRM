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

async function seedAuditLog() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('audit_logs/log1').set({
      action: 'whatsapp_sent',
      actor_uid: 'admin1',
      target_type: 'whatsapp_message',
      target_id: 'wamid1',
      summary: 'WhatsApp text sent.',
    });
  });
}

describe('audit_logs — server-owned admin review trail', () => {
  it('unauthenticated users cannot read audit logs', async () => {
    await seedAuditLog();
    await assertFails(unauthed(env).firestore().doc('audit_logs/log1').get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can read audit logs', async (role) => {
    await seedAuditLog();
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('audit_logs/log1').get());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot read audit logs', async (role) => {
      await seedAuditLog();
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('audit_logs/log1').get());
    });

  it.each(['superadmin', 'admin', 'sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot write audit logs from the client', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('audit_logs/log2').set({
        action: 'tamper',
        summary: 'Client write attempt',
      }));
    });
});
