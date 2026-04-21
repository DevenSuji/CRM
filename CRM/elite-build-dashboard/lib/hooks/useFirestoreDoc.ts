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
      setData(null);
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
