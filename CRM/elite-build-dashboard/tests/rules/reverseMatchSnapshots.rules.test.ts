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

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (c) => {
    await c.firestore().doc(path).set(data);
  });
}

describe.each([
  ['reverse_match_projects/p1', { projectId: 'p1', buyers: [] }],
  ['reverse_match_units/u1', { unitId: 'u1', projectId: 'p1', buyers: [] }],
  ['no_match_intelligence/l1', { leadId: 'l1', reasonCode: 'budget_too_low' }],
  ['demand_gap_reports/current', { totalNoMatchLeads: 1, reasons: [] }],
] as const)('%s — reverse match snapshots', (path, data) => {
  it('unauthenticated cannot read', async () => {
    await seed(path, data);
    await assertFails(unauthed(env).firestore().doc(path).get());
  });

  it.each([
    'superadmin', 'admin', 'sales_exec', 'channel_partner',
    'digital_marketing', 'viewer',
  ] as const)('%s can read', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it.each([
    'superadmin', 'admin', 'sales_exec', 'channel_partner',
    'digital_marketing', 'viewer',
  ] as const)('%s cannot write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc(path).set(data));
  });
});
