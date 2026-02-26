import type {
  CommandActionSpec,
  MotionActionSpec,
  OperatorActionSpec,
  ResolvedAction,
} from "../actions/action-model";

export interface KeyBindingDef {
  mode: string;
  keys: string;
  action: string;
  description?: string;
}

export type MatchResult = "full" | "prefix" | "none";

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface KeybindState {
  pendingKeys: string[];
  count: number | null;
  pendingOperator: {
    action: OperatorActionSpec;
    key: string;
    count: number | null;
  } | null;
  charPending: {
    motion: MotionActionSpec;
    key: string;
    count: number | null;
  } | null;
}

export type DispatchResult =
  | { type: "none" }
  | { type: "pending"; preventDefault: boolean }
  | { type: "reset" }
  | { type: "execute-command"; action: CommandActionSpec; count: number | null }
  | {
      type: "execute-motion";
      action: MotionActionSpec;
      count: number | null;
      char?: string;
    }
  | {
      type: "execute-operator-motion";
      operator: OperatorActionSpec;
      motion: MotionActionSpec;
      operatorCount: number | null;
      motionCount: number | null;
      char?: string;
    };

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift"]);
const KEY_ALIASES: Record<string, string> = { Space: " " };
const REVERSE_KEY_ALIASES: Record<string, string> = { " ": "Space" };

export function parseKeys(keys: string): string[] {
  return keys.split(" ");
}

export function parseKeyStep(step: string): {
  modifiers: Set<string>;
  key: string;
} {
  const parts = step.split("+");
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  return { modifiers, key };
}

export function eventMatchesStep(event: KeyEventLike, step: string): boolean {
  const { modifiers, key } = parseKeyStep(step);
  const resolved = KEY_ALIASES[key] ?? key;
  if (event.key !== resolved) return false;
  if (modifiers.has("Ctrl") !== event.ctrlKey) return false;
  if (modifiers.has("Meta") !== event.metaKey) return false;
  if (modifiers.has("Alt") !== event.altKey) return false;
  if (key.length > 1 && modifiers.has("Shift") !== event.shiftKey) return false;
  return true;
}

export function keyRepresentation(event: KeyEventLike): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && event.key.length > 1) parts.push("Shift");
  parts.push(REVERSE_KEY_ALIASES[event.key] ?? event.key);
  return parts.join("+");
}

export function matchBinding(
  pending: readonly string[],
  event: KeyEventLike,
  binding: KeyBindingDef,
): MatchResult {
  const sequence = parseKeys(binding.keys);
  const nextIndex = pending.length;

  if (nextIndex >= sequence.length) return "none";

  for (let i = 0; i < pending.length; i += 1) {
    if (pending[i] !== sequence[i]) return "none";
  }

  if (!eventMatchesStep(event, sequence[nextIndex])) return "none";

  return nextIndex + 1 === sequence.length ? "full" : "prefix";
}

export function initialState(): KeybindState {
  return {
    pendingKeys: [],
    count: null,
    pendingOperator: null,
    charPending: null,
  };
}

interface FullMatch {
  action: ResolvedAction;
}

interface KindMatches {
  full: FullMatch | null;
  hasPrefix: boolean;
}

function hasPendingState(state: KeybindState): boolean {
  return (
    state.count !== null ||
    state.pendingOperator !== null ||
    state.charPending !== null ||
    state.pendingKeys.length > 0
  );
}

function matchingModeBindings(
  bindings: readonly KeyBindingDef[],
  currentMode: string,
): readonly KeyBindingDef[] {
  return bindings.filter((binding) => binding.mode === currentMode);
}

function missingActionError(actionId: string): Error {
  return new Error(`Binding references missing action "${actionId}".`);
}

function collectKindMatches(
  pending: readonly string[],
  event: KeyEventLike,
  modeBindings: readonly KeyBindingDef[],
  actionMap: ReadonlyMap<string, ResolvedAction>,
  kind: ResolvedAction["kind"],
): KindMatches {
  let full: FullMatch | null = null;
  let hasPrefix = false;

  for (const binding of modeBindings) {
    const result = matchBinding(pending, event, binding);
    if (result === "none") {
      continue;
    }

    if (result === "prefix") {
      const action = actionMap.get(binding.action);
      if (action?.kind === kind) {
        hasPrefix = true;
      }
      continue;
    }

    const action = actionMap.get(binding.action);
    if (!action) {
      throw missingActionError(binding.action);
    }
    if (action.kind === kind && !full) {
      full = { action };
    }
  }

  return { full, hasPrefix };
}

export function dispatch(
  state: KeybindState,
  event: KeyEventLike,
  bindings: readonly KeyBindingDef[],
  actionMap: ReadonlyMap<string, ResolvedAction>,
  currentMode: string,
  inputFocused: boolean,
): { nextState: KeybindState; result: DispatchResult } {
  if (MODIFIER_KEYS.has(event.key)) {
    return { nextState: state, result: { type: "none" } };
  }

  if (state.charPending) {
    if (event.key === "Escape") {
      return { nextState: initialState(), result: { type: "reset" } };
    }

    if (event.key.length === 1) {
      if (state.pendingOperator) {
        return {
          nextState: initialState(),
          result: {
            type: "execute-operator-motion",
            operator: state.pendingOperator.action,
            motion: state.charPending.motion,
            operatorCount: state.pendingOperator.count,
            motionCount: state.charPending.count,
            char: event.key,
          },
        };
      }

      return {
        nextState: initialState(),
        result: {
          type: "execute-motion",
          action: state.charPending.motion,
          count: state.charPending.count,
          char: event.key,
        },
      };
    }

    return { nextState: state, result: { type: "none" } };
  }

  if (!inputFocused) {
    if (/^[1-9]$/.test(event.key) && state.count === null) {
      return {
        nextState: {
          ...state,
          count: Number(event.key),
        },
        result: { type: "pending", preventDefault: true },
      };
    }

    if (/^[0-9]$/.test(event.key) && state.count !== null) {
      return {
        nextState: {
          ...state,
          count: Number(`${state.count}${event.key}`),
        },
        result: { type: "pending", preventDefault: true },
      };
    }
  }

  if (event.key === "Escape" && hasPendingState(state)) {
    return { nextState: initialState(), result: { type: "reset" } };
  }

  const modeBindings = matchingModeBindings(bindings, currentMode);

  let selectedFullMatch: FullMatch | null = null;
  let hasPrefix = false;

  if (state.pendingOperator) {
    const motionMatches = collectKindMatches(
      state.pendingKeys,
      event,
      modeBindings,
      actionMap,
      "motion",
    );
    const commandMatches = collectKindMatches(
      [state.pendingOperator.key, ...state.pendingKeys],
      event,
      modeBindings,
      actionMap,
      "command",
    );

    selectedFullMatch = motionMatches.full ?? commandMatches.full;
    hasPrefix = motionMatches.hasPrefix || commandMatches.hasPrefix;

    if (!selectedFullMatch && !hasPrefix) {
      return { nextState: initialState(), result: { type: "reset" } };
    }
  } else {
    for (const binding of modeBindings) {
      const result = matchBinding(state.pendingKeys, event, binding);
      if (result === "none") {
        continue;
      }
      if (result === "prefix") {
        hasPrefix = true;
        continue;
      }

      const action = actionMap.get(binding.action);
      if (!action) {
        throw missingActionError(binding.action);
      }
      if (!selectedFullMatch) {
        selectedFullMatch = { action };
      }
    }
  }

  if (selectedFullMatch) {
    const action = selectedFullMatch.action;
    const keyRep = keyRepresentation(event);

    switch (action.kind) {
      case "command":
        return {
          nextState: initialState(),
          result: {
            type: "execute-command",
            action,
            count: state.pendingOperator
              ? state.pendingOperator.count
              : state.count,
          },
        };
      case "motion": {
        const effectiveCount = state.count;
        if (action.awaitChar) {
          return {
            nextState: {
              ...initialState(),
              pendingOperator: state.pendingOperator,
              charPending: {
                motion: action,
                key: keyRep,
                count: effectiveCount,
              },
            },
            result: { type: "pending", preventDefault: true },
          };
        }

        if (state.pendingOperator) {
          return {
            nextState: initialState(),
            result: {
              type: "execute-operator-motion",
              operator: state.pendingOperator.action,
              motion: action,
              operatorCount: state.pendingOperator.count,
              motionCount: effectiveCount,
            },
          };
        }

        return {
          nextState: initialState(),
          result: {
            type: "execute-motion",
            action,
            count: effectiveCount,
          },
        };
      }
      case "operator":
        return {
          nextState: {
            pendingKeys: [],
            count: null,
            charPending: null,
            pendingOperator: {
              action,
              key: keyRep,
              count: state.count,
            },
          },
          result: { type: "pending", preventDefault: true },
        };
    }
  }

  if (hasPrefix) {
    return {
      nextState: {
        ...state,
        pendingKeys: [...state.pendingKeys, keyRepresentation(event)],
      },
      result: { type: "pending", preventDefault: true },
    };
  }

  if (
    state.pendingOperator ||
    state.pendingKeys.length > 0 ||
    state.count !== null
  ) {
    return { nextState: initialState(), result: { type: "reset" } };
  }

  return { nextState: state, result: { type: "none" } };
}
