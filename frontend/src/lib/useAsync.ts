import { useCallback, useEffect, useState } from "react";

/** A tiny load-once-with-reload hook. No caching, no fabrication. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn().then(
      (v) => {
        if (alive) {
          setData(v);
          setLoading(false);
        }
      },
      (e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, deps);

  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}
