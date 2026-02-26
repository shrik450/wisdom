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
  type CommandActionSpec,
  createActionRegistryState,
  type MotionActionSpec,
  type OperatorActionSpec,
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

type ActionHandler =
  | { kind: "command"; fn: CommandActionSpec["onSelect"] }
  | { kind: "motion"; fn: MotionActionSpec["range"] }
  | { kind: "operator"; fn: OperatorActionSpec["apply"] };

// Replace each action's handler with a stable wrapper that looks up the
// current handler at call time. This keeps function identity stable across
// re-renders so areActionsEqual can detect no-op updates.
function toRegisteredActions(
  contributorId: number,
  actions: readonly ActionSpec[],
  handlers: Map<string, ActionHandler>,
  wrappers: Map<string, ActionHandler>,
): ActionSpec[] {
  return actions.map((action) => {
    const key = contributorActionKey(contributorId, action.id);
    const existingWrapper = wrappers.get(key);
    if (existingWrapper && existingWrapper.kind !== action.kind) {
      throw new Error(
        `Action "${action.id}" changed kind from "${existingWrapper.kind}" to "${action.kind}" for contributor ${contributorId}.`,
      );
    }

    switch (action.kind) {
      case "command": {
        handlers.set(key, { kind: "command", fn: action.onSelect });
        let wrapper = wrappers.get(key);
        if (!wrapper) {
          wrapper = {
            kind: "command",
            fn: (count: number | null) => {
              const handler = handlers.get(key);
              if (!handler || handler.kind !== "command") {
                throw new Error(`Expected command handler for ${key}`);
              }
              handler.fn(count);
            },
          };
          wrappers.set(key, wrapper);
        }
        if (wrapper.kind !== "command") {
          throw new Error(`Expected command wrapper for ${key}`);
        }
        return {
          ...action,
          onSelect: wrapper.fn,
        };
      }
      case "motion": {
        handlers.set(key, { kind: "motion", fn: action.range });
        let wrapper = wrappers.get(key);
        if (!wrapper) {
          wrapper = {
            kind: "motion",
            fn: (count: number | null, char?: string) => {
              const handler = handlers.get(key);
              if (!handler || handler.kind !== "motion") {
                throw new Error(`Expected motion handler for ${key}`);
              }
              return handler.fn(count, char);
            },
          };
          wrappers.set(key, wrapper);
        }
        if (wrapper.kind !== "motion") {
          throw new Error(`Expected motion wrapper for ${key}`);
        }
        return {
          ...action,
          range: wrapper.fn,
        };
      }
      case "operator": {
        handlers.set(key, { kind: "operator", fn: action.apply });
        let wrapper = wrappers.get(key);
        if (!wrapper) {
          wrapper = {
            kind: "operator",
            fn: (range: { from: number; to: number }) => {
              const handler = handlers.get(key);
              if (!handler || handler.kind !== "operator") {
                throw new Error(`Expected operator handler for ${key}`);
              }
              handler.fn(range);
            },
          };
          wrappers.set(key, wrapper);
        }
        if (wrapper.kind !== "operator") {
          throw new Error(`Expected operator wrapper for ${key}`);
        }
        return {
          ...action,
          apply: wrapper.fn,
        };
      }
    }
  });
}

function removeDeletedActionHandlers(
  contributorId: number,
  previousActions: readonly ActionSpec[],
  nextActions: readonly ActionSpec[],
  handlers: Map<string, ActionHandler>,
  wrappers: Map<string, ActionHandler>,
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
  handlers: Map<string, ActionHandler>,
  wrappers: Map<string, ActionHandler>,
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
  const actionHandlersRef = useRef<Map<string, ActionHandler>>(new Map());
  const actionWrappersRef = useRef<Map<string, ActionHandler>>(new Map());

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
