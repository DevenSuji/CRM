import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { UserRole } from '@/lib/types/user';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'elite-build-crm-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8'),
    },
  });
});

afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

async function authedStorageAs(role: UserRole, uid = role): Promise<RulesTestContext> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set({
      uid,
      email: `${uid}@test.local`,
      name: uid,
      role,
      active: true,
      created_at: null,
    });
  });
  return env.authenticatedContext(uid);
}

async function seedStorageObject(objectPath: string, contentType: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(objectPath).putString('seed', 'raw', { contentType });
  });
}

function uploadPromise(task: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(task);
}

describe('storage rules — public image assets', () => {
  it.each(['projects/site.jpg', 'branding/logo.png', 'surface-themes/hero.webp'])(
    'allows public reads for %s', async (objectPath) => {
      await seedStorageObject(objectPath, 'image/png');
      await assertSucceeds(env.unauthenticatedContext().storage().ref(objectPath).getDownloadURL());
    },
  );

  it.each(['superadmin', 'admin'] as const)('%s can upload project/branding images', async (role) => {
    const ctx = await authedStorageAs(role);
    await assertSucceeds(uploadPromise(ctx.storage().ref(`projects/${role}.png`).putString('img', 'raw', { contentType: 'image/png' })));
    await assertSucceeds(uploadPromise(ctx.storage().ref(`branding/${role}.png`).putString('img', 'raw', { contentType: 'image/png' })));
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot upload public image assets', async (role) => {
      const ctx = await authedStorageAs(role);
      await assertFails(uploadPromise(ctx.storage().ref(`projects/${role}.png`).putString('img', 'raw', { contentType: 'image/png' })));
      await assertFails(uploadPromise(ctx.storage().ref(`branding/${role}.png`).putString('img', 'raw', { contentType: 'image/png' })));
    },
  );

  it('blocks oversized or non-image public asset uploads', async () => {
    const ctx = await authedStorageAs('admin');
    await assertFails(uploadPromise(ctx.storage().ref('projects/not-image.txt').putString('txt', 'raw', { contentType: 'text/plain' })));
    await assertFails(uploadPromise(ctx.storage().ref('projects/large.png').put(new Uint8Array(5 * 1024 * 1024), { contentType: 'image/png' })));
  });
});

describe('storage rules — call recordings', () => {
  it.each(['superadmin', 'admin'] as const)('%s can read and upload valid recordings', async (role) => {
    const ctx = await authedStorageAs(role);
    await assertSucceeds(uploadPromise(ctx.storage().ref(`recordings/${role}.mp3`).putString('audio', 'raw', { contentType: 'audio/mpeg' })));
    await assertSucceeds(ctx.storage().ref(`recordings/${role}.mp3`).getDownloadURL());
  });

  it.each(['sales_exec', 'channel_partner', 'digital_marketing', 'viewer'] as const)(
    '%s cannot read or upload recordings', async (role) => {
      await seedStorageObject('recordings/private.mp3', 'audio/mpeg');
      const ctx = await authedStorageAs(role);
      await assertFails(ctx.storage().ref('recordings/private.mp3').getDownloadURL());
      await assertFails(uploadPromise(ctx.storage().ref(`recordings/${role}.mp3`).putString('audio', 'raw', { contentType: 'audio/mpeg' })));
    },
  );

  it('blocks public recording reads', async () => {
    await seedStorageObject('recordings/private.mp3', 'audio/mpeg');
    await assertFails(env.unauthenticatedContext().storage().ref('recordings/private.mp3').getDownloadURL());
  });
});
