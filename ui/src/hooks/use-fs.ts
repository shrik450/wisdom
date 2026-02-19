import { useCallback, useEffect, useState } from "react";
import { listDir, readFile } from "../api/fs";
import { DirEntry } from "../api/types";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fn().then(
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
  }, [tick, fn]);

  return { data, loading, error, refresh };
}

export function useDirectoryListing(path: string): AsyncState<DirEntry[]> {
  const readDirectory = useCallback(() => listDir(path), [path]);
  return useAsync(readDirectory);
}

export function useFileContent(path: string): AsyncState<string> {
  const readContent = useCallback(() => readFile(path), [path]);
  return useAsync(readContent);
}
