import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export async function firebaseAuthHeaders(): Promise<Record<string, string>> {
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise<User | null>(resolve => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, 1500);
      const unsubscribe = onAuthStateChanged(auth, nextUser => {
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(nextUser);
      });
    });
  }
  const token = await user?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
