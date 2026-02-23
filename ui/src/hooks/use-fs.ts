import { useCallback, useEffect, useState } from "react";
import { listDir, readFile } from "../api/fs";
import { type DirEntry } from "../api/types";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "The operation was aborted.")
  );
}

export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  refreshToken = 0,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fn(controller.signal).then(
      (result) => {
        setData(result);
        setLoading(false);
      },
      (err) => {
        if (isAbortError(err)) {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      },
    );

    return () => {
      controller.abort();
    };
  }, [tick, fn, refreshToken]);

  return { data, loading, error, refresh };
}

export function useDirectoryListing(
  path: string,
  refreshToken = 0,
): AsyncState<DirEntry[]> {
  const readDirectory = useCallback(
    (signal: AbortSignal) => listDir(path, signal),
    [path],
  );
  return useAsync(readDirectory, refreshToken);
}

export function useFileContent(path: string): AsyncState<string> {
  const readContent = useCallback(
    (signal: AbortSignal) => readFile(path, signal),
    [path],
  );
  return useAsync(readContent);
}
