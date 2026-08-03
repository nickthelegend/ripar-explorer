"use client";

import { useEffect, useRef, useState } from "react";

export type Resource<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Awaits a data-layer call and exposes the three states the UI has to draw.
 *
 * Two deliberate behaviours:
 *  - previous `data` is held across a refetch, so retyping in the search box
 *    never blanks the table you are reading;
 *  - a stale response can never overwrite a newer one, because each run tags
 *    itself and only the latest tag is allowed to commit.
 */
export function useResource<T>(load: () => Promise<T>, key: string): Resource<T> {
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: true });
  const latest = useRef(0);
  // Held in a ref so an inline arrow at the call site does not retrigger the
  // effect on every render — `key` alone decides when to reload.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const run = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadRef.current().then(
      (data) => {
        if (run === latest.current) setState({ data, error: null, loading: false });
      },
      (err: unknown) => {
        if (run === latest.current) {
          setState({ data: null, error: err instanceof Error ? err.message : String(err), loading: false });
        }
      },
    );
  }, [key]);

  return state;
}
