"use client";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface UseDocResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useFirestoreDoc<T>(
  collectionName: string,
  docId: string,
): UseDocResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!docId) {
      // Clearing docId means "stop subscribing" — set the matching terminal
      // state synchronously so consumers don't observe stale data from a
      // previous docId. This is a legitimate set-in-effect case.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, collectionName, docId),
      (snap) => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() } as T);
        } else {
          setData(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Firestore doc error [${collectionName}/${docId}]:`, err);
        setError(err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [collectionName, docId]);

  return { data, loading, error };
}
