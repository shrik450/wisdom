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
  createActionRegistryState,
  removeActionContributor,
  resolveActions,
  upsertActionContributor,
  type ActionRegistryState,
  type ActionSpec,
  type ResolvedAction,
} from "./action-model";

interface ActionRegistryContextValue {
  upsertContributor: (
    contributorId: number,
    actions: readonly ActionSpec[],
  ) => void;
  removeContributor: (contributorId: number) => void;
  resolvedActions: readonly ResolvedAction[];
}

const ActionRegistryContext = createContext<ActionRegistryContextValue | null>(
  null,
);

let nextContributorId = 1;

// Null byte can't appear in user-provided action IDs, so it's a
// collision-free separator between contributor and action.
function contributorActionKey(contributorId: number, actionId: string): string {
  return `${contributorId}\u0000${actionId}`;
}

// Replace each action's onSelect with a stable wrapper that looks up the
// real handler at call time.  This keeps the function reference identity
// constant across re-renders so the model's areActionsEqual check can
// detect no-op updates without the onSelect pointer changing every render.
function toRegisteredActions(
  contributorId: number,
  actions: readonly ActionSpec[],
  handlers: Map<string, () => void>,
  wrappers: Map<string, () => void>,
): ActionSpec[] {
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
  previousActions: readonly ActionSpec[],
  nextActions: readonly ActionSpec[],
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
  actions: readonly ActionSpec[],
  handlers: Map<string, () => void>,
  wrappers: Map<string, () => void>,
) {
  for (const action of actions) {
    const key = contributorActionKey(contributorId, action.id);
    handlers.delete(key);
    wrappers.delete(key);
  }
}

export function ActionRegistryProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<ActionRegistryState>(() => {
    return createActionRegistryState();
  });
  const actionHandlersRef = useRef<Map<string, () => void>>(new Map());
  const actionWrappersRef = useRef<Map<string, () => void>>(new Map());

  const upsertContributor = useCallback(
    (contributorId: number, actions: readonly ActionSpec[]) => {
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

        return upsertActionContributor(
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

      return removeActionContributor(previous, contributorId);
    });
  }, []);

  const resolvedActions = useMemo(() => {
    return resolveActions(registry.contributors);
  }, [registry.contributors]);

  const value = useMemo<ActionRegistryContextValue>(() => {
    return {
      upsertContributor,
      removeContributor,
      resolvedActions,
    };
  }, [removeContributor, resolvedActions, upsertContributor]);

  return (
    <ActionRegistryContext.Provider value={value}>
      {children}
    </ActionRegistryContext.Provider>
  );
}

function useActionRegistryContext(): ActionRegistryContextValue {
  const context = useContext(ActionRegistryContext);
  if (!context) {
    throw new Error("Actions must be used inside ActionRegistryProvider.");
  }
  return context;
}

export function useActions(actions: readonly ActionSpec[]) {
  const { upsertContributor, removeContributor } = useActionRegistryContext();
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

export function useResolvedActions(): readonly ResolvedAction[] {
  const { resolvedActions } = useActionRegistryContext();
  return resolvedActions;
}

export type { ActionSpec, ResolvedAction };
