import { useEffect, useState } from 'react';

/**
 * Reads something asynchronous (core's stores and planner answer with promises)
 * and keeps the last answer while a new one loads, so a screen does not flash
 * empty when the data changes. Re-reads whenever `deps` change.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null } {
  const [state, setState] = useState<{ data: T | undefined; error: string | null }>({ data: undefined, error: null });
  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setState({ data, error: null }),
      (error: Error) => current && setState((s) => ({ data: s.data, error: error.message })),
    );
    return () => {
      current = false;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
