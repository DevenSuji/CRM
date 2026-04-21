"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider, db } from '@/lib/firebase';
import { CRMUser } from '@/lib/types/user';
import { resolveCrmUser } from '@/lib/auth/resolveCrmUser';

interface AuthState {
  /** Firebase Auth user — null if not signed in */
  firebaseUser: User | null;
  /** CRM user profile from Firestore — null if not yet loaded or not registered */
  crmUser: CRMUser | null;
  /** true while Firebase Auth state is being resolved */
  loading: boolean;
  /** Set when user is authenticated but not in the users collection or is inactive */
  accessDenied: boolean;
  /** Sign in with Google */
  signInWithGoogle: () => Promise<void>;
  /** Sign out */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [crmUser, setCrmUser] = useState<CRMUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        const result = await resolveCrmUser(
          { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL },
          db
        );
        if (result.kind === 'ok') {
          setCrmUser(result.user);
          setAccessDenied(false);
        } else {
          setCrmUser(null);
          setAccessDenied(true);
        }
      } else {
        setCrmUser(null);
        setAccessDenied(false);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google sign-in failed:', err);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setCrmUser(null);
    setAccessDenied(false);
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, crmUser, loading, accessDenied, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
