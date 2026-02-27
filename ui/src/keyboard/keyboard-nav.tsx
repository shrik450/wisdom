import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ResolvedAction } from "../actions/action-model";
import {
  dispatch,
  expirePending,
  initialState,
  type KeyBindingDef,
  type KeybindState,
} from "./keybind-state-machine";

export interface KeyboardNavContextValue {
  mode: string;
  pendingKeys: readonly string[];
  count: number | null;
  pendingOperatorKey: string | null;
  charPendingKey: string | null;
  pushMode: (mode: string) => void;
  popMode: () => void;
}

const SEQUENCE_TIMEOUT_MS = 500;
const INPUT_SELECTOR = "input, textarea, select, [contenteditable='true']";

function multiplyCount(a: number | null, b: number | null): number | null {
  if (a === null && b === null) {
    return null;
  }
  return (a ?? 1) * (b ?? 1);
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  return el.matches(INPUT_SELECTOR);
}

function effectiveMode(modeStack: readonly string[]): string {
  const top = modeStack.length > 0 ? modeStack[modeStack.length - 1] : "normal";
  if (top === "normal" && isInputFocused()) return "insert";
  return top;
}

export const KeyboardNavContext = createContext<KeyboardNavContextValue | null>(
  null,
);

export function useKeyboardNavContext(): KeyboardNavContextValue {
  const ctx = useContext(KeyboardNavContext);
  if (!ctx) {
    throw new Error(
      "useKeyboardNavContext must be used inside KeyboardNavContext.Provider",
    );
  }
  return ctx;
}

export function useKeyboardNav(
  bindings: readonly KeyBindingDef[],
  resolvedActions: readonly ResolvedAction[],
): { contextValue: KeyboardNavContextValue } {
  const modeStackRef = useRef<string[]>([]);
  const stateRef = useRef<KeybindState>(initialState());
  const timeoutRef = useRef<number>(0);
  const [mode, setMode] = useState("normal");
  const [pendingKeys, setPendingKeys] = useState<readonly string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [pendingOperatorKey, setPendingOperatorKey] = useState<string | null>(
    null,
  );
  const [charPendingKey, setCharPendingKey] = useState<string | null>(null);

  const actionMapRef = useRef(new Map<string, ResolvedAction>());
  useEffect(() => {
    const map = new Map<string, ResolvedAction>();
    for (const action of resolvedActions) {
      map.set(action.id, action);
    }
    actionMapRef.current = map;
  }, [resolvedActions]);

  const syncState = useCallback(() => {
    setMode(effectiveMode(modeStackRef.current));
    const state = stateRef.current;
    setPendingKeys([...state.pendingKeys]);
    setCount(state.count);
    setPendingOperatorKey(state.pendingOperator?.key ?? null);
    setCharPendingKey(state.charPending?.key ?? null);
  }, []);

  const clearPendingTimeout = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = 0;
  }, []);

  const onTimeout = useCallback(() => {
    const state = stateRef.current;
    const nextState = expirePending(state);
    if (nextState !== state) {
      stateRef.current = nextState;
      syncState();
    }
  }, [syncState]);

  const resetTimeout = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(onTimeout, SEQUENCE_TIMEOUT_MS);
  }, [onTimeout]);

  const clearPending = useCallback(() => {
    stateRef.current = initialState();
    clearPendingTimeout();
    syncState();
  }, [clearPendingTimeout, syncState]);

  const pushMode = useCallback(
    (m: string) => {
      modeStackRef.current = [...modeStackRef.current, m];
      clearPending();
    },
    [clearPending],
  );

  const popMode = useCallback(() => {
    modeStackRef.current = modeStackRef.current.slice(0, -1);
    clearPending();
  }, [clearPending]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const currentMode = effectiveMode(modeStackRef.current);
      const { nextState, result } = dispatch(
        stateRef.current,
        event,
        bindings,
        actionMapRef.current,
        currentMode,
        isInputFocused(),
      );
      stateRef.current = nextState;

      switch (result.type) {
        case "none":
          return;
        case "pending":
          if (result.preventDefault) {
            event.preventDefault();
          }
          syncState();
          if (
            !nextState.charPending &&
            (nextState.pendingKeys.length > 0 || nextState.pendingOperator)
          ) {
            resetTimeout();
          } else {
            clearPendingTimeout();
          }
          return;
        case "reset":
          if (result.preventDefault) {
            event.preventDefault();
          }
          syncState();
          clearPendingTimeout();
          return;
        case "execute-command":
          event.preventDefault();
          result.action.onSelect(result.count);
          syncState();
          clearPendingTimeout();
          return;
        case "execute-motion":
          event.preventDefault();
          result.action.range(result.count, result.char);
          syncState();
          clearPendingTimeout();
          return;
        case "execute-operator-motion": {
          event.preventDefault();
          const count = multiplyCount(result.operatorCount, result.motionCount);
          const range = result.motion.range(count, result.char);
          result.operator.apply(range);
          syncState();
          clearPendingTimeout();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, clearPendingTimeout, resetTimeout, syncState]);

  useEffect(() => {
    const onFocusChange = () => setMode(effectiveMode(modeStackRef.current));
    document.addEventListener("focusin", onFocusChange, true);
    document.addEventListener("focusout", onFocusChange, true);
    return () => {
      document.removeEventListener("focusin", onFocusChange, true);
      document.removeEventListener("focusout", onFocusChange, true);
    };
  }, []);

  const contextValue = useMemo<KeyboardNavContextValue>(
    () => ({
      mode,
      pendingKeys,
      count,
      pendingOperatorKey,
      charPendingKey,
      pushMode,
      popMode,
    }),
    [
      charPendingKey,
      count,
      mode,
      pendingKeys,
      pendingOperatorKey,
      popMode,
      pushMode,
    ],
  );

  return { contextValue };
}

const KEY_DISPLAY: Record<string, string> = {
  Space: "SPC",
};

function formatPendingKey(key: string): string {
  return KEY_DISPLAY[key] ?? key;
}

export function ModeIndicator() {
  const { mode, pendingKeys, count, pendingOperatorKey, charPendingKey } =
    useKeyboardNavContext();

  const parts: string[] = [];
  if (count !== null) {
    parts.push(String(count));
  }
  if (pendingOperatorKey) {
    parts.push(pendingOperatorKey);
  }
  if (charPendingKey) {
    parts.push(charPendingKey);
  }
  if (pendingKeys.length > 0) {
    parts.push(...pendingKeys.map(formatPendingKey));
  }

  const displayMode = mode !== "normal" ? mode.toUpperCase() : null;
  const displayKeys = parts.length > 0 ? parts.join(" ") : null;

  if (!displayMode && !displayKeys) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 font-mono text-xs text-txt-muted"
      style={{ zIndex: "var(--shell-z-mode-indicator)" }}
      data-testid="mode-indicator"
    >
      {displayKeys && <span className="mr-2 text-accent">{displayKeys}</span>}
      {displayMode && <span>{displayMode}</span>}
    </div>
  );
}
