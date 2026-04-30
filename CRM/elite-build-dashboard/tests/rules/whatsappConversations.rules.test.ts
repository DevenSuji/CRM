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
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

async function seedLead(id: string, assignedTo: string | null) {
  await seed(`leads/${id}`, {
    id,
    owner_uid: 'admin1',
    assigned_to: assignedTo,
    source: 'Walk-in',
    source_normalized: 'Walk-in',
    status: 'New',
    raw_data: { lead_name: 'Buyer', phone: '+919999999999' },
  });
}

async function seedConversation(id: string, leadId: string | null, assignedTo: string | null) {
  await seed(`whatsapp_conversations/${id}`, {
    normalized_phone: '9999999999',
    lead_id: leadId,
    lead_name: 'Buyer',
    assigned_to: assignedTo,
    owner_uid: 'admin1',
    last_message_at: new Date('2026-04-30T08:00:00.000Z'),
  });
  await seed(`whatsapp_conversations/${id}/messages/wamid1`, {
    conversation_id: id,
    direction: 'inbound',
    type: 'text',
    text: 'Interested',
    normalized_phone: '9999999999',
    lead_id: leadId,
    status: 'received',
    timestamp: new Date('2026-04-30T08:00:00.000Z'),
  });
}

describe('whatsapp_conversations — CRM-owned inbox RBAC', () => {
  it('unauthenticated users cannot read conversations or messages', async () => {
    await seedLead('lead1', 'sales1');
    await seedConversation('phone_9999999999', 'lead1', 'sales1');
    const ctx = unauthed(env);

    await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999').get());
    await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999/messages/wamid1').get());
  });

  it.each(['superadmin', 'admin'] as const)('%s can read every conversation and message', async (role) => {
    await seedLead('lead1', 'sales1');
    await seedConversation('phone_9999999999', 'lead1', 'sales1');
    const ctx = await authedAs(env, { uid: 'u1', role });

    await assertSucceeds(ctx.firestore().doc('whatsapp_conversations/phone_9999999999').get());
    await assertSucceeds(ctx.firestore().doc('whatsapp_conversations/phone_9999999999/messages/wamid1').get());
  });

  it('sales_exec can read only conversations assigned to self and backed by a visible lead', async () => {
    await seedLead('mine', 'sales1');
    await seedConversation('phone_9999999999', 'mine', 'sales1');
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });

    await assertSucceeds(ctx.firestore().doc('whatsapp_conversations/phone_9999999999').get());
    await assertSucceeds(ctx.firestore().doc('whatsapp_conversations/phone_9999999999/messages/wamid1').get());
  });

  it('sales_exec cannot read another salesperson conversation', async () => {
    await seedLead('theirs', 'sales2');
    await seedConversation('phone_9999999999', 'theirs', 'sales2');
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });

    await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999').get());
    await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999/messages/wamid1').get());
  });

  it('sales_exec cannot read conversations assigned away from them', async () => {
    await seedLead('lead1', 'admin1');
    await seedConversation('phone_9999999999', 'lead1', 'admin1');
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });

    await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999').get());
    await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999/messages/wamid1').get());
  });

  it('sales_exec can query their assigned conversation list', async () => {
    await seedLead('mine', 'sales1');
    await seedLead('theirs', 'sales2');
    await seedConversation('mine', 'mine', 'sales1');
    await seedConversation('theirs', 'theirs', 'sales2');
    const ctx = await authedAs(env, { uid: 'sales1', role: 'sales_exec' });
    const q = ctx.firestore()
      .collection('whatsapp_conversations')
      .where('assigned_to', '==', 'sales1')
      .orderBy('last_message_at', 'desc');

    await assertSucceeds(q.get());
  });

  it.each(['channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot read WhatsApp conversations', async (role) => {
      await seedLead('lead1', 'sales1');
      await seedConversation('phone_9999999999', 'lead1', 'sales1');
      const ctx = await authedAs(env, { uid: 'u1', role });

      await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999').get());
      await assertFails(ctx.firestore().doc('whatsapp_conversations/phone_9999999999/messages/wamid1').get());
    });

  it.each(['superadmin', 'admin', 'sales_exec'] as const)('%s cannot write conversations from the browser', async (role) => {
    const ctx = await authedAs(env, { uid: 'u1', role });

    await assertFails(ctx.firestore().doc('whatsapp_conversations/new').set({
      normalized_phone: '9999999999',
      assigned_to: 'u1',
    }));
    await assertFails(ctx.firestore().doc('whatsapp_conversations/new/messages/msg').set({
      text: 'No browser writes',
    }));
  });
});
