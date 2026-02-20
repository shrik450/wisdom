import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

interface WorkspaceMutatedContextValue {
  refreshToken: number;
  notifyMutated: () => void;
}

const WorkspaceMutatedContext =
  createContext<WorkspaceMutatedContextValue | null>(null);

export function WorkspaceMutatedProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const notifyMutated = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  return (
    <WorkspaceMutatedContext.Provider value={{ refreshToken, notifyMutated }}>
      {children}
    </WorkspaceMutatedContext.Provider>
  );
}

// Writers (breadcrumbs, viewers that edit) call this to signal a change.
export function useWorkspaceMutated(): () => void {
  const context = useContext(WorkspaceMutatedContext);
  if (!context) {
    throw new Error(
      "useWorkspaceMutated must be used inside WorkspaceMutatedProvider.",
    );
  }
  return context.notifyMutated;
}

// Readers (sidebar, directory viewer) subscribe to this to re-fetch on changes.
export function useWorkspaceRefreshToken(): number {
  const context = useContext(WorkspaceMutatedContext);
  if (!context) {
    throw new Error(
      "useWorkspaceRefreshToken must be used inside WorkspaceMutatedProvider.",
    );
  }
  return context.refreshToken;
}
