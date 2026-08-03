"use client";

import { useEffect, useRef, useState } from "react";

export type Resource<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Awaits a data-layer call and exposes the three states the UI has to draw.
 *
 * Three deliberate behaviours:
 *  - previous `data` is held across a refetch, so retyping in the search box
 *    never blanks the table you are reading;
 *  - a stale response can never overwrite a newer one, because the run is
 *    marked dead by the effect's own cleanup the moment `key` changes;
 *  - `loading` is DERIVED from whether the settled result belongs to the
 *    current key, rather than stored and raised in the effect. Storing it cost
 *    an extra render on every single query for a value that was already
 *    knowable at render time.
 */
export function useResource<T>(load: () => Promise<T>, key: string): Resource<T> {
  const [settled, setSettled] = useState<{ key: string; data: T | null; error: string | null } | null>(null);

  // Held in a ref so an inline arrow at the call site does not retrigger the
  // fetch on every render — `key` alone decides when to reload. Written in an
  // effect rather than during render: it only has to be current by the time the
  // fetch below runs, and effects fire in declaration order.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let live = true;
    loadRef.current().then(
      (data) => {
        if (live) setSettled({ key, data, error: null });
      },
      (err: unknown) => {
        if (live) {
          setSettled({ key, data: null, error: err instanceof Error ? err.message : String(err) });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [key]);

  const fresh = settled != null && settled.key === key;
  return {
    data: settled?.data ?? null,
    // A failure from the previous query is not a failure of this one.
    error: fresh ? settled.error : null,
    loading: !fresh,
  };
}
