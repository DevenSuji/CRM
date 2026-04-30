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

async function seedDoc(path: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (c) => {
    await c.firestore().doc(path).set({ id: path.split('/').pop(), name: 'seed', ...data });
  });
}

async function seedAssignedProject(id: string, channelPartnerUids: string[] = []) {
  await seedDoc(`projects/${id}`, {
    name: 'Assigned Project',
    builder: 'Elite',
    channel_partner_uids: channelPartnerUids,
  });
}

describe('inventory — project-scoped RBAC', () => {
  it('unauth cannot read', async () => {
    await seedDoc('inventory/u1', { projectId: 'p1' });
    await assertFails(unauthed(env).firestore().doc('inventory/u1').get());
  });

  it.each(['superadmin', 'admin', 'sales_exec', 'digital_marketing', 'viewer'] as const)('%s can read', async (role) => {
    await seedDoc('inventory/u1', { projectId: 'p1' });
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('inventory/u1').get());
  });

  it('channel_partner can read inventory for an assigned project', async () => {
    await seedAssignedProject('p1', ['cp1']);
    await seedDoc('inventory/u1', { projectId: 'p1' });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertSucceeds(ctx.firestore().doc('inventory/u1').get());
  });

  it('channel_partner cannot read inventory for an unassigned project', async () => {
    await seedAssignedProject('p1', ['cp2']);
    await seedDoc('inventory/u1', { projectId: 'p1' });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertFails(ctx.firestore().doc('inventory/u1').get());
  });

  it('channel_partner can query inventory within an assigned project', async () => {
    await seedAssignedProject('p1', ['cp1']);
    await seedDoc('inventory/u1', { projectId: 'p1', status: 'Available' });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    const q = ctx.firestore().collection('inventory').where('projectId', '==', 'p1');
    await assertSucceeds(q.get());
  });

  it('channel_partner can query available inventory within an assigned project for scoped matching', async () => {
    await seedAssignedProject('p1', ['cp1']);
    await seedAssignedProject('p2', ['cp2']);
    await seedDoc('inventory/u1', { projectId: 'p1', status: 'Available' });
    await seedDoc('inventory/u2', { projectId: 'p2', status: 'Available' });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    const q = ctx.firestore().collection('inventory')
      .where('projectId', '==', 'p1')
      .where('status', '==', 'Available');
    await assertSucceeds(q.get());
  });

  it('channel_partner cannot query global available inventory across unassigned projects', async () => {
    await seedAssignedProject('p1', ['cp1']);
    await seedAssignedProject('p2', ['cp2']);
    await seedDoc('inventory/u1', { projectId: 'p1', status: 'Available' });
    await seedDoc('inventory/u2', { projectId: 'p2', status: 'Available' });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    const q = ctx.firestore().collection('inventory').where('status', '==', 'Available');
    await assertFails(q.get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can create available inventory', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('inventory/new').set({
      projectId: 'p1',
      projectName: 'Project One',
      location: 'Chennai',
      propertyType: 'Apartment',
      status: 'Available',
      price: 100,
      fields: { unit_number: 'A101' },
    }));
  });

  it.each(['superadmin', 'admin'] as const)('%s cannot create booked or sold inventory from the browser', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('inventory/booked').set({
      projectId: 'p1',
      status: 'Booked',
      price: 100,
      fields: { unit_number: 'A101' },
    }));
    await assertFails(ctx.firestore().doc('inventory/sold').set({
      projectId: 'p1',
      status: 'Sold',
      price: 100,
      fields: { unit_number: 'A102' },
    }));
  });

  it.each(['superadmin', 'admin'] as const)('%s cannot create inventory with a browser-owned booking pointer', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('inventory/booked-pointer').set({
      projectId: 'p1',
      status: 'Available',
      price: 100,
      fields: { unit_number: 'A101' },
      booked_by_lead_id: 'lead1',
    }));
  });

  it.each(['superadmin', 'admin'] as const)('%s can edit available inventory details without changing lifecycle fields', async (role) => {
    await seedDoc('inventory/u1', {
      projectId: 'p1',
      status: 'Available',
      price: 100,
      fields: { unit_number: 'A101' },
    });
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('inventory/u1').update({
      price: 120,
      fields: { unit_number: 'A101', floor: 4 },
    }));
  });

  it.each(['superadmin', 'admin'] as const)('%s cannot directly change inventory booking lifecycle fields', async (role) => {
    await seedDoc('inventory/u1', {
      projectId: 'p1',
      status: 'Available',
      price: 100,
      fields: { unit_number: 'A101' },
    });
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertFails(ctx.firestore().doc('inventory/u1').update({ status: 'Booked' }));
    await assertFails(ctx.firestore().doc('inventory/u1').update({ status: 'Sold' }));
    await assertFails(ctx.firestore().doc('inventory/u1').update({ booked_by_lead_id: 'lead1' }));
    await assertFails(ctx.firestore().doc('inventory/u1').update({ projectId: 'p2' }));
  });

  it.each(['superadmin', 'admin'] as const)('%s can delete only available, unbooked inventory', async (role) => {
    await seedDoc('inventory/available', {
      projectId: 'p1',
      status: 'Available',
      price: 100,
      fields: { unit_number: 'A101' },
    });
    await seedDoc('inventory/booked', {
      projectId: 'p1',
      status: 'Booked',
      price: 100,
      fields: { unit_number: 'A102' },
      booked_by_lead_id: 'lead1',
    });
    await seedDoc('inventory/sold', {
      projectId: 'p1',
      status: 'Sold',
      price: 100,
      fields: { unit_number: 'A103' },
    });

    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('inventory/available').delete());
    await assertFails(ctx.firestore().doc('inventory/booked').delete());
    await assertFails(ctx.firestore().doc('inventory/sold').delete());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot write', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('inventory/new').set({
        projectId: 'p1',
        status: 'Available',
        price: 100,
        fields: { unit_number: 'A101' },
      }));
    });
});

describe('project_schemas — project-scoped RBAC', () => {
  it('unauth cannot read', async () => {
    await seedDoc('project_schemas/p1', { fields: [] });
    await assertFails(unauthed(env).firestore().doc('project_schemas/p1').get());
  });

  it.each(['superadmin', 'admin', 'sales_exec', 'digital_marketing', 'viewer'] as const)('%s can read', async (role) => {
    await seedDoc('project_schemas/p1', { fields: [] });
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('project_schemas/p1').get());
  });

  it('channel_partner can read schema for an assigned project', async () => {
    await seedAssignedProject('p1', ['cp1']);
    await seedDoc('project_schemas/p1', { fields: [] });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertSucceeds(ctx.firestore().doc('project_schemas/p1').get());
  });

  it('channel_partner cannot read schema for an unassigned project', async () => {
    await seedAssignedProject('p1', ['cp2']);
    await seedDoc('project_schemas/p1', { fields: [] });
    const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
    await assertFails(ctx.firestore().doc('project_schemas/p1').get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('project_schemas/new').set({ fields: [] }));
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot write', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('project_schemas/new').set({ fields: [] }));
    });
});

describe('marketing_teams — RBAC', () => {
  it('unauth cannot read', async () => {
    await seedDoc('marketing_teams/t1');
    await assertFails(unauthed(env).firestore().doc('marketing_teams/t1').get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can read', async (role) => {
    await seedDoc('marketing_teams/t1');
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('marketing_teams/t1').get());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot read marketing team data', async (role) => {
      await seedDoc('marketing_teams/t1');
      const ctx = await authedAs(env, { uid: role === 'channel_partner' ? 'cp1' : 'u1', role });
      await assertFails(ctx.firestore().doc('marketing_teams/t1').get());
    });

  it.each(['superadmin', 'admin'] as const)('%s can write', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });
    await assertSucceeds(ctx.firestore().doc('marketing_teams/new').set({ name: 'x' }));
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot write', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('marketing_teams/new').set({ name: 'x' }));
    });
});

describe('default-deny — unknown collection', () => {
  it('no one (even superadmin) can write to an undeclared collection', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'superadmin' });
    await assertFails(ctx.firestore().doc('nonexistent/x').set({ foo: 'bar' }));
  });

  it('no one can read an undeclared collection', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('nonexistent/x').set({ foo: 'bar' });
    });
    const ctx = await authedAs(env, { uid: 'u1', role: 'superadmin' });
    await assertFails(ctx.firestore().doc('nonexistent/x').get());
  });
});
