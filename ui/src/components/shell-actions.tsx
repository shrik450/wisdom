import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createShellActionRegistryState,
  removeShellActionContributor,
  resolveShellActions,
  upsertShellActionContributor,
  type ShellActionRegistryState,
  type ShellActionSpec,
  type ShellResolvedAction,
} from "./shell-actions-model";

interface ShellActionsContextValue {
  upsertContributor: (
    contributorId: number,
    actions: readonly ShellActionSpec[],
  ) => void;
  removeContributor: (contributorId: number) => void;
  resolvedActions: readonly ShellResolvedAction[];
}

const ShellActionsContext = createContext<ShellActionsContextValue | null>(
  null,
);

let nextContributorId = 1;

function contributorActionKey(contributorId: number, actionId: string): string {
  return `${contributorId}\u0000${actionId}`;
}

function toRegisteredActions(
  contributorId: number,
  actions: readonly ShellActionSpec[],
  handlers: Map<string, () => void>,
  wrappers: Map<string, () => void>,
): ShellActionSpec[] {
  return actions.map((action) => {
    const key = contributorActionKey(contributorId, action.id);
    handlers.set(key, action.onSelect);

    let wrapper = wrappers.get(key);
    if (!wrapper) {
      wrapper = () => {
        const handler = handlers.get(key);
        handler?.();
      };
      wrappers.set(key, wrapper);
    }

    return {
      ...action,
      onSelect: wrapper,
    };
  });
}

function removeDeletedActionHandlers(
  contributorId: number,
  previousActions: readonly ShellActionSpec[],
  nextActions: readonly ShellActionSpec[],
  handlers: Map<string, () => void>,
  wrappers: Map<string, () => void>,
) {
  const nextActionIds = new Set(nextActions.map((action) => action.id));
  for (const previousAction of previousActions) {
    if (nextActionIds.has(previousAction.id)) {
      continue;
    }
    const key = contributorActionKey(contributorId, previousAction.id);
    handlers.delete(key);
    wrappers.delete(key);
  }
}

function removeAllActionHandlers(
  contributorId: number,
  actions: readonly ShellActionSpec[],
  handlers: Map<string, () => void>,
  wrappers: Map<string, () => void>,
) {
  for (const action of actions) {
    const key = contributorActionKey(contributorId, action.id);
    handlers.delete(key);
    wrappers.delete(key);
  }
}

export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<ShellActionRegistryState>(() => {
    return createShellActionRegistryState();
  });
  const actionHandlersRef = useRef<Map<string, () => void>>(new Map());
  const actionWrappersRef = useRef<Map<string, () => void>>(new Map());

  const upsertContributor = useCallback(
    (contributorId: number, actions: readonly ShellActionSpec[]) => {
      const handlers = actionHandlersRef.current;
      const wrappers = actionWrappersRef.current;
      const registeredActions = toRegisteredActions(
        contributorId,
        actions,
        handlers,
        wrappers,
      );

      setRegistry((previous) => {
        const existingContributor = previous.contributors.find(
          (contributor) => {
            return contributor.contributorId === contributorId;
          },
        );
        if (existingContributor) {
          removeDeletedActionHandlers(
            contributorId,
            existingContributor.actions,
            registeredActions,
            handlers,
            wrappers,
          );
        }

        return upsertShellActionContributor(
          previous,
          contributorId,
          registeredActions,
        );
      });
    },
    [],
  );

  const removeContributor = useCallback((contributorId: number) => {
    const handlers = actionHandlersRef.current;
    const wrappers = actionWrappersRef.current;

    setRegistry((previous) => {
      const existingContributor = previous.contributors.find((contributor) => {
        return contributor.contributorId === contributorId;
      });
      if (!existingContributor) {
        return previous;
      }

      removeAllActionHandlers(
        contributorId,
        existingContributor.actions,
        handlers,
        wrappers,
      );

      return removeShellActionContributor(previous, contributorId);
    });
  }, []);

  const resolvedActions = useMemo(() => {
    return resolveShellActions(registry.contributors);
  }, [registry.contributors]);

  const value = useMemo<ShellActionsContextValue>(() => {
    return {
      upsertContributor,
      removeContributor,
      resolvedActions,
    };
  }, [removeContributor, resolvedActions, upsertContributor]);

  return (
    <ShellActionsContext.Provider value={value}>
      {children}
    </ShellActionsContext.Provider>
  );
}

function useShellActionsContext(): ShellActionsContextValue {
  const context = useContext(ShellActionsContext);
  if (!context) {
    throw new Error("Shell actions must be used inside ShellActionsProvider.");
  }
  return context;
}

export function useShellActions(actions: readonly ShellActionSpec[]) {
  const { upsertContributor, removeContributor } = useShellActionsContext();
  const contributorIdRef = useRef<number>(0);

  if (contributorIdRef.current === 0) {
    contributorIdRef.current = nextContributorId++;
  }

  useEffect(() => {
    const contributorId = contributorIdRef.current;
    upsertContributor(contributorId, actions);
  }, [actions, upsertContributor]);

  useEffect(() => {
    const contributorId = contributorIdRef.current;
    return () => {
      removeContributor(contributorId);
    };
  }, [removeContributor]);
}

export function useShellResolvedActions(): readonly ShellResolvedAction[] {
  const { resolvedActions } = useShellActionsContext();
  return resolvedActions;
}

export type { ShellActionSpec, ShellResolvedAction };
