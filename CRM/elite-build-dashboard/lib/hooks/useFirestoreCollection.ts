"use client";
import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, query, QueryConstraint,
} from 'firebase/firestore';

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/** Subscribe to a Firestore collection. Pass a stable `subscriptionKey` to
 *  signal when constraints have changed and the listener should re-subscribe;
 *  pass `null` as the key to disable the subscription entirely (useful while
 *  waiting for auth to resolve so we don't hit a rules-denied listener). */
export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  ...constraints: QueryConstraint[]
): UseCollectionResult<T> {
  return useFirestoreCollectionKeyed<T>(collectionName, collectionName, constraints);
}

export function useFirestoreCollectionKeyed<T extends { id: string }>(
  collectionName: string,
  subscriptionKey: string | null,
  constraints: QueryConstraint[],
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;

  useEffect(() => {
    if (subscriptionKey === null) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, collectionName), ...constraintsRef.current);
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setData(snap.docs.map(d => ({ id: d.id, ...d.data() } as T)));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Firestore error [${collectionName}]:`, err);
        setError(err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [collectionName, subscriptionKey]);

  return { data, loading, error };
}
