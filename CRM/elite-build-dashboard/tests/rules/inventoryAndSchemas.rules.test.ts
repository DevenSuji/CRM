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

async function seed(collection: string, id: string) {
  await env.withSecurityRulesDisabled(async (c) => {
    await c.firestore().doc(`${collection}/${id}`).set({ id, name: 'seed' });
  });
}

describe.each(['inventory', 'project_schemas', 'marketing_teams'] as const)(
  '%s — RBAC',
  (coll) => {
    it('unauth cannot read', async () => {
      await seed(coll, 'x');
      await assertFails(unauthed(env).firestore().doc(`${coll}/x`).get());
    });

    it.each([
      'superadmin', 'admin', 'sales_exec', 'channel_partner',
      'digital_marketing', 'viewer',
    ] as const)('%s can read', async (role) => {
      await seed(coll, 'x');
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc(`${coll}/x`).get());
    });

    it.each(['superadmin', 'admin'] as const)('%s can write', async (role) => {
      const ctx = await authedAs(env, { uid: 'u1', role });
      await assertSucceeds(ctx.firestore().doc(`${coll}/new`).set({ name: 'x' }));
    });

    it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
      '%s cannot write', async (role) => {
        const ctx = await authedAs(env, { uid: 'u1', role });
        await assertFails(ctx.firestore().doc(`${coll}/new`).set({ name: 'x' }));
      });
  }
);

describe('default-deny — unknown collection', () => {
  it('no one (even superadmin) can write to an undeclared collection', async () => {
    const ctx = await authedAs(env, { uid: 'u1', role: 'superadmin' });
    await assertFails(ctx.firestore().doc('nonexistent/x').set({ foo: 'bar' }));
  });

  it('no one can read an undeclared collection', async () => {
    // Can't even seed without rules disabled, so seed that way.
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('nonexistent/x').set({ foo: 'bar' });
    });
    const ctx = await authedAs(env, { uid: 'u1', role: 'superadmin' });
    await assertFails(ctx.firestore().doc('nonexistent/x').get());
  });
});
