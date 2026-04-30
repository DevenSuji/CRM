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

async function seedLead(id: string, ownerUid: string, data: Record<string, unknown> = {}) {
  await seed(`leads/${id}`, {
    owner_uid: ownerUid,
    raw_data: { lead_name: 'Test', phone: '+919999999999' },
    status: 'New',
    source: 'Walk-in',
    source_normalized: 'Walk-in',
    assigned_to: null,
    ...data,
  });
}

describe.each([
  ['reverse_match_projects/p1', { projectId: 'p1', buyers: [] }],
  ['reverse_match_units/u1', { unitId: 'u1', projectId: 'p1', buyers: [] }],
] as const)('%s — sales-intelligence snapshots', (path, data) => {
  it('unauthenticated cannot read', async () => {
    await seed(path, data);
    await assertFails(unauthed(env).firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can read', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot read reverse-match buyer snapshots', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: role === 'channel_partner' ? 'cp1' : 'u1', role });
    await assertFails(ctx.firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin', 'sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)('%s cannot write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc(path).set(data));
  });
});

describe('no_match_intelligence — lead-scoped read-only docs', () => {
  const path = 'no_match_intelligence/l1';
  const data = { leadId: 'l1', reasonCode: 'budget_too_low' };

  it('unauthenticated cannot read', async () => {
    await seedLead('l1', 'sales1');
    await seed(path, data);
    await assertFails(unauthed(env).firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin', 'viewer'] as const)('%s can read', async (role) => {
    await seedLead('l1', 'sales1');
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it('sales_exec can read no-match intelligence only for a visible lead', async () => {
    await seedLead('l1', 'sales1', { assigned_to: 'sales1' });
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it('sales_exec cannot read no-match intelligence for a lead assigned away', async () => {
    await seedLead('l1', 'admin1', { assigned_to: 'admin1' });
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc(path).get());
  });

  it('channel_partner can read no-match intelligence for own lead', async () => {
    await seedLead('l1', 'cp1');
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it.each(['channel_partner', 'digital_marketing'] as const)('%s cannot read another lead no-match doc', async (role) => {
    await seedLead('l1', 'someone_else');
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'cp1', role });
    await assertFails(ctx.firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin', 'sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)('%s cannot write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc(path).set(data));
  });
});

describe('demand_gap_reports — read-only aggregate docs', () => {
  const path = 'demand_gap_reports/current';
  const data = { totalNoMatchLeads: 1, reasons: [] };

  it('unauthenticated cannot read', async () => {
    await seed(path, data);
    await assertFails(unauthed(env).firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can read', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot read aggregate demand-gap reports', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: role === 'channel_partner' ? 'cp1' : 'u1', role });
    await assertFails(ctx.firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin', 'sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)('%s cannot write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc(path).set(data));
  });
});

describe('whatsapp_messages — operational inbox', () => {
  const path = 'whatsapp_messages/wamid1';
  const data = { direction: 'inbound', from: '919876543210', text: 'Interested' };

  it('unauthenticated cannot read', async () => {
    await seed(path, data);
    await assertFails(unauthed(env).firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can read', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc(path).get());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)('%s cannot read', async (role) => {
    await seed(path, data);
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc(path).get());
  });

  it.each(['superadmin', 'admin', 'sales_exec'] as const)('%s cannot write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc(path).set(data));
  });
});
