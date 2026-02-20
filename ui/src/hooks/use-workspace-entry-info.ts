import { useCallback, useEffect, useState } from "react";
import {
  getWorkspaceEntryInfo,
  WorkspaceEntryInfo,
} from "../workspace-entry-info";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useWorkspaceEntryInfo(path: string): AsyncState<WorkspaceEntryInfo> {
  const [data, setData] = useState<WorkspaceEntryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getWorkspaceEntryInfo(path).then(
      (result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      },
      (err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  return { data, loading, error, refresh };
}
