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

/** Seed one lead owned by `ownerUid` directly (bypassing rules). */
async function seedLead(id: string, ownerUid: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`leads/${id}`).set({
      id,
      owner_uid: ownerUid,
      raw_data: { lead_name: 'Test', phone: '+919999999999' },
      status: 'New',
      source: 'Walk-in',
      source_normalized: 'Walk-in',
      assigned_to: null,
      ...data,
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

  it.each(['superadmin', 'admin', 'viewer'] as const)(
    '%s can read any lead', async (role) => {
      await seedLead('lead1', 'someone_else', { assigned_to: 'other_user' });
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/lead1').get());
    });

  describe('sales_exec', () => {
    it('can read leads assigned to self', async () => {
      await seedLead('mine', 'admin1', { assigned_to: 'sales1' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertSucceeds(ctx.firestore().doc('leads/mine').get());
    });

    it('can read unassigned non-channel-partner leads with normalized source', async () => {
      await seedLead('unassigned', 'admin1', { assigned_to: null, source_normalized: 'Walk-in' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertSucceeds(ctx.firestore().doc('leads/unassigned').get());
    });

    it.each([
      ['superadmin1', 'lead assigned to Super Admin'],
      ['admin1', 'lead assigned to Admin'],
      ['sales2', 'lead assigned to another Sales Exec'],
    ])('cannot read %s', async (assignedTo) => {
      await seedLead('restricted', 'admin1', { assigned_to: assignedTo });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/restricted').get());
    });

    it('cannot read unassigned channel-partner leads', async () => {
      await seedLead('cp-lead', 'cp1', {
        assigned_to: null,
        source: 'Channel Partner',
        source_normalized: 'Channel Partner',
      });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/cp-lead').get());
    });

    it('cannot list the whole collection', async () => {
      await seedLead('mine', 'admin1', { assigned_to: 'sales1' });
      await seedLead('theirs', 'admin1', { assigned_to: 'sales2' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().collection('leads').get());
    });

    it('can list leads filtered by assigned_to == self', async () => {
      await seedLead('mine', 'admin1', { assigned_to: 'sales1' });
      await seedLead('theirs', 'admin1', { assigned_to: 'sales2' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      const q = ctx.firestore().collection('leads').where('assigned_to', '==', 'sales1');
      await assertSucceeds(q.get());
    });

    it('can list unassigned non-channel-partner leads with a normalized source constraint', async () => {
      await seedLead('unassigned', 'admin1', { assigned_to: null, source_normalized: 'Walk-in' });
      await seedLead('cp-lead', 'cp1', {
        assigned_to: null,
        source: 'Channel Partner',
        source_normalized: 'Channel Partner',
      });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      const q = ctx.firestore()
        .collection('leads')
        .where('assigned_to', '==', null)
        .where('source_normalized', '!=', 'Channel Partner');
      await assertSucceeds(q.get());
    });
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
  it.each(['superadmin', 'admin'] as const)(
    '%s can create any lead', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'anyone',
        raw_data: { lead_name: 'X', phone: '+91' },
      }));
    });

  it('sales_exec can create a normal new lead owned by self', async () => {
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    await assertSucceeds(ctx.firestore().doc('leads/new1').set({
      owner_uid: 'sales1',
      assigned_to: 'sales1',
      status: 'New',
      source: 'Walk-in',
      source_normalized: 'Walk-in',
      raw_data: { lead_name: 'X', phone: '+91' },
      duplicate_keys: ['phone:+91'],
    }));
  });

  it('sales_exec cannot create a lead assigned to another user', async () => {
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('leads/new1').set({
      owner_uid: 'sales1',
      assigned_to: 'sales2',
      status: 'New',
      source: 'Walk-in',
      source_normalized: 'Walk-in',
      raw_data: { lead_name: 'X', phone: '+91' },
    }));
  });

  it('sales_exec cannot create channel-partner leads', async () => {
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('leads/new1').set({
      owner_uid: 'sales1',
      assigned_to: 'sales1',
      status: 'New',
      source: 'Channel Partner',
      source_normalized: 'Channel Partner',
      raw_data: { lead_name: 'X', phone: '+91' },
    }));
  });

  it('sales_exec cannot create a lead already booked', async () => {
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    await assertFails(ctx.firestore().doc('leads/new1').set({
      owner_uid: 'sales1',
      status: 'Booked',
      source: 'Walk-in',
      raw_data: { lead_name: 'X', phone: '+91' },
      booked_unit: { unitId: 'u1', projectId: 'p1' },
    }));
  });

  describe('channel_partner', () => {
    it('can create a lead owned by self', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertSucceeds(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'cp1',
        assigned_to: 'cp1',
        status: 'New',
        source: 'Channel Partner',
        source_normalized: 'Channel Partner',
        raw_data: { lead_name: 'X', phone: '+91' },
      }));
    });
    it('cannot create a lead owned by someone else', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'cp2',
        status: 'New',
        source: 'Channel Partner',
        raw_data: { lead_name: 'X', phone: '+91' },
      }));
    });
    it('cannot create a lead assigned to another user', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'cp1',
        assigned_to: 'sales1',
        status: 'New',
        source: 'Channel Partner',
        raw_data: { lead_name: 'X', phone: '+91' },
      }));
    });
    it('cannot create a lead with a forged source', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/new1').set({
        owner_uid: 'cp1',
        status: 'New',
        source: 'Meta Ads',
        raw_data: { lead_name: 'X', phone: '+91' },
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
  it.each(['superadmin', 'admin'] as const)(
    '%s can update any lead', async (role) => {
      await seedLead('lead1', 'someone', { assigned_to: 'other_user' });
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc('leads/lead1').update({ status: 'Nurturing' }));
    });

  describe('admin browser high-risk mutations', () => {
    it.each(['superadmin', 'admin'] as const)(
      '%s cannot directly mutate booking, merge, archive, or owner fields', async (role) => {
        await seedLead('lead1', 'someone');
        const ctx = await authedAs(env, { uid: 'u1', role });
        await assertFails(ctx.firestore().doc('leads/lead1').update({
          booked_unit: { unitId: 'u1', projectId: 'p1' },
        }));
        await assertFails(ctx.firestore().doc('leads/lead1').update({ merged_from: ['dup'] }));
        await assertFails(ctx.firestore().doc('leads/lead1').update({ archived_at_iso: '2026-04-28T00:00:00.000Z' }));
        await assertFails(ctx.firestore().doc('leads/lead1').update({ owner_uid: 'u1' }));
      });

    it.each(['superadmin', 'admin'] as const)(
      '%s cannot move a lead into or out of Booked directly', async (role) => {
        const ctx = await authedAs(env, { uid: 'u1', role });
        await seedLead('lead1', 'someone');
        await assertFails(ctx.firestore().doc('leads/lead1').update({ status: 'Booked' }));

        await seedLead('booked', 'someone', {
          status: 'Booked',
          booked_unit: { unitId: 'u1', projectId: 'p1' },
        });
        await assertFails(ctx.firestore().doc('leads/booked').update({ status: 'Closed' }));
        await assertSucceeds(ctx.firestore().doc('leads/booked').update({ raw_data: { lead_name: 'Updated', phone: '+91' } }));
      });

    it.each(['superadmin', 'admin'] as const)(
      '%s can still update safe admin working fields', async (role) => {
        await seedLead('lead1', 'someone');
        const ctx = await authedAs(env, { uid: 'u1', role });
        await assertSucceeds(ctx.firestore().doc('leads/lead1').update({
          assigned_to: 'sales1',
          source_normalized: 'walk_in',
        }));
      });

    it.each(['superadmin', 'admin'] as const)(
      '%s cannot write invalid status or source_normalized values', async (role) => {
        await seedLead('lead1', 'someone');
        const ctx = await authedAs(env, { uid: 'u1', role });
        await assertFails(ctx.firestore().doc('leads/lead1').update({ status: 'Almost Closed' }));
        await assertFails(ctx.firestore().doc('leads/lead1').update({ source_normalized: 123 }));
      });
  });

  describe('sales_exec high-risk mutations', () => {
    it('can self-assign an unassigned non-channel-partner lead', async () => {
      await seedLead('lead1', 'someone', { assigned_to: null, source: 'Walk-in', source_normalized: 'Walk-in' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertSucceeds(ctx.firestore().doc('leads/lead1').update({
        assigned_to: 'sales1',
        activity_log: [{
          id: 'assign_self',
          type: 'lead_assigned',
          text: 'Lead assigned to self.',
          author: 'Sales',
          created_at: '2026-04-30T06:00:00.000Z',
          assigned_to: 'sales1',
        }],
      }));
    });

    it('cannot assign to another user or reassign an already assigned lead', async () => {
      await seedLead('lead1', 'someone', { assigned_to: null, source: 'Walk-in', source_normalized: 'Walk-in' });
      await seedLead('assigned', 'someone', { assigned_to: 'admin1', source: 'Walk-in' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/lead1').update({ assigned_to: 'sales2' }));
      await assertFails(ctx.firestore().doc('leads/assigned').update({ assigned_to: 'sales1' }));
    });

    it('cannot self-assign channel partner leads', async () => {
      await seedLead('lead1', 'cp1', { assigned_to: null, source: 'Channel Partner', source_normalized: 'Channel Partner' });
      await seedLead('lead2', 'cp1', { assigned_to: null, source: 'Unknown', source_normalized: 'Channel Partner' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/lead1').update({ assigned_to: 'sales1' }));
      await assertFails(ctx.firestore().doc('leads/lead2').update({ assigned_to: 'sales1' }));
    });

    it('cannot change booking or merge fields', async () => {
      await seedLead('lead1', 'someone', { assigned_to: 'sales1' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/lead1').update({
        booked_unit: { unitId: 'u1', projectId: 'p1' },
      }));
      await assertFails(ctx.firestore().doc('leads/lead1').update({ merged_from: ['lead2'] }));
    });

    it('cannot move a lead into or out of Booked directly', async () => {
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await seedLead('lead1', 'someone', { assigned_to: 'sales1' });
      await assertFails(ctx.firestore().doc('leads/lead1').update({ status: 'Booked' }));

      await seedLead('booked', 'someone', {
        status: 'Booked',
        assigned_to: 'sales1',
        booked_unit: { unitId: 'u1', projectId: 'p1' },
      });
      await assertFails(ctx.firestore().doc('leads/booked').update({ status: 'Closed' }));
      await assertSucceeds(ctx.firestore().doc('leads/booked').update({ raw_data: { lead_name: 'Updated', phone: '+91' } }));
    });

    it('cannot update a lead assigned to someone else', async () => {
      await seedLead('restricted', 'admin1', { assigned_to: 'superadmin1' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/restricted').update({ status: 'Nurturing' }));
    });

    it('cannot write an invalid status on an assigned lead', async () => {
      await seedLead('lead1', 'someone', { assigned_to: 'sales1' });
      const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
      await assertFails(ctx.firestore().doc('leads/lead1').update({ status: 'Almost Closed' }));
    });
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
    it('can self-assign an older own lead that was missing assigned_to', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertSucceeds(ctx.firestore().doc('leads/mine').update({
        assigned_to: 'cp1',
        activity_log: [{
          id: 'assign_self',
          type: 'lead_assigned',
          text: 'Lead assigned to channel partner.',
          author: 'Partner',
          created_at: '2026-04-29T09:30:00.000Z',
          assigned_to: 'cp1',
        }],
      }));
    });
    it('cannot unassign an own lead assigned to self', async () => {
      await seedLead('mine', 'cp1', { assigned_to: 'cp1' });
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/mine').update({ assigned_to: null }));
    });
    it('cannot assign an own lead to another user', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/mine').update({ assigned_to: 'sales1' }));
    });
    it('cannot change booking or merge fields on own lead', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/mine').update({
        booked_unit: { unitId: 'u1', projectId: 'p1' },
      }));
      await assertFails(ctx.firestore().doc('leads/mine').update({
        merged_from: ['lead2'],
      }));
    });
    it('cannot move a lead into or out of Booked directly', async () => {
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await seedLead('mine', 'cp1');
      await assertFails(ctx.firestore().doc('leads/mine').update({ status: 'Booked' }));

      await seedLead('booked', 'cp1', {
        status: 'Booked',
        booked_unit: { unitId: 'u1', projectId: 'p1' },
      });
      await assertFails(ctx.firestore().doc('leads/booked').update({ status: 'Closed' }));
    });
    it('cannot write an invalid status on own lead', async () => {
      await seedLead('mine', 'cp1');
      const ctx = await authedAs(env, { uid: 'cp1', role: 'channel_partner' });
      await assertFails(ctx.firestore().doc('leads/mine').update({ status: 'Almost Closed' }));
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
    '%s cannot hard-delete from the browser; server lifecycle route archives instead', async (role) => {
      await seedLead('lead1', 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('leads/lead1').delete());
    });

  it.each(['sales_exec', 'channel_partner', 'viewer', 'digital_marketing', 'hr', 'payroll_finance'] as const)(
    '%s cannot delete', async (role) => {
      await seedLead('lead1', role === 'channel_partner' ? 'u1' : 'someone');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertFails(ctx.firestore().doc('leads/lead1').delete());
    });
});
