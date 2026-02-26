import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRoute } from "wouter";
import { decodeWorkspaceRoutePath } from "../path-utils";
import {
  getWorkspaceEntryInfo,
  type WorkspaceEntryInfo,
} from "../workspace-entry-info";

interface EntryInfoState {
  path: string;
  data: WorkspaceEntryInfo | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

const WorkspaceEntryContext = createContext<EntryInfoState | null>(null);

// Single fetch for the current route's entry info, shared via context.
// Both Breadcrumbs (in Shell) and WorkspaceView consume this so we avoid
// duplicate requests for the same path on every navigation.
export function WorkspaceEntryProvider({ children }: { children: ReactNode }) {
  const [, params] = useRoute("/ws/*");
  const path = decodeWorkspaceRoutePath(params?.["*"] ?? "");

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

  return (
    <WorkspaceEntryContext.Provider
      value={{ path, data, loading, error, refresh }}
    >
      {children}
    </WorkspaceEntryContext.Provider>
  );
}

export function useWorkspaceEntryInfo(): EntryInfoState {
  const context = useContext(WorkspaceEntryContext);
  if (!context) {
    throw new Error(
      "useWorkspaceEntryInfo must be used inside WorkspaceEntryProvider.",
    );
  }
  return context;
}
