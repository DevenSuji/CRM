import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Server-only Firebase Admin SDK. Bypasses Firestore security rules — use only
 * from API routes / server components, never ship to the client.
 *
 * Credential resolution:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON env (raw JSON of a service account key)
 *   2. GOOGLE_APPLICATION_CREDENTIALS env (path) / gcloud ADC (local dev)
 *   3. Runtime-attached service account (Cloud Run, Cloud Functions)
 */
function getAdminApp() {
  const existing = getApps().find(a => a.name === 'admin');
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (saJson) {
    const credentials = JSON.parse(saJson);
    return initializeApp({ credential: cert(credentials), projectId }, 'admin');
  }
  return initializeApp({ credential: applicationDefault(), projectId }, 'admin');
}

export const adminDb: Firestore = getFirestore(getAdminApp());
