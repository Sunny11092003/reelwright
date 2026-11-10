import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../config/firebase';
import { errMessage } from '../services/api';

/** Realtime Firestore document. Reads are permitted by security rules only for the owner. */
export function useDoc<T>(collection: string, id: string | null | undefined): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setData(null); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(doc(db, collection, id), (s) => { setData(s.exists() ? ({ id: s.id, ...s.data() } as T) : null); setLoading(false); setError(null); },
      (e) => { setError(e.message); setLoading(false); });
  }, [collection, id]);
  return { data, loading, error };
}

/** Loads data from an async function and exposes reload. Cancels stale responses. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setLoading(true);
    fnRef.current().then((d) => { if (live) { setData(d); setError(null); } }).catch((e) => live && setError(errMessage(e))).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
