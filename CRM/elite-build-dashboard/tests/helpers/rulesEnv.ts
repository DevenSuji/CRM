import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UserRole } from '@/lib/types/user';

/** Firestore emulator host the CLI launches on (matches firebase.json). */
const HOST = '127.0.0.1';
const PORT = 8080;

/** Boots one shared RulesTestEnvironment per test file.
 *  The emulator itself is started externally by `firebase emulators:exec`. */
export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'elite-build-crm-test',
    firestore: {
      host: HOST,
      port: PORT,
      rules: readFileSync(
        path.resolve(__dirname, '../../firestore.rules'),
        'utf-8'
      ),
    },
  });
}

/** Seeds a CRM user doc (bypassing rules) and returns an authed Firestore ctx
 *  scoped to that user. Use for the common case: "I am an X-role user, can I
 *  do Y on Z?" */
export async function authedAs(
  env: RulesTestEnvironment,
  opts: { uid: string; role: UserRole; active?: boolean; email?: string }
): Promise<RulesTestContext> {
  const { uid, role, active = true, email = `${uid}@test.local` } = opts;
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set({
      uid,
      email,
      name: uid,
      role,
      active,
      created_at: null,
    });
  });
  return env.authenticatedContext(uid);
}

/** An authed context for a user who has NO `users/{uid}` doc yet — simulates
 *  a brand-new Google sign-in before the CRM user record exists. */
export function authedNoProfile(env: RulesTestEnvironment, uid: string): RulesTestContext {
  return env.authenticatedContext(uid);
}

/** Unauthenticated context — useful for "what can a logged-out visitor do?" */
export function unauthed(env: RulesTestEnvironment): RulesTestContext {
  return env.unauthenticatedContext();
}
