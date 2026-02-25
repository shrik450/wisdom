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

export interface KeyBindingDef {
  mode: string;
  keys: string;
  action: string;
  description?: string;
}

export type MatchResult = "full" | "prefix" | "none";

export interface KeyboardNavContextValue {
  mode: string;
  pendingKeys: readonly string[];
  pushMode: (mode: string) => void;
  popMode: () => void;
}

const SEQUENCE_TIMEOUT_MS = 500;
const INPUT_SELECTOR = "input, textarea, select, [contenteditable='true']";
const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift"]);

export function parseKeys(keys: string): string[] {
  return keys.split(" ");
}

function parseKeyStep(step: string): { modifiers: Set<string>; key: string } {
  const parts = step.split("+");
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  return { modifiers, key };
}

const KEY_ALIASES: Record<string, string> = { Space: " " };
const REVERSE_KEY_ALIASES: Record<string, string> = { " ": "Space" };

function eventMatchesStep(event: KeyboardEvent, step: string): boolean {
  const { modifiers, key } = parseKeyStep(step);
  const resolved = KEY_ALIASES[key] ?? key;
  if (event.key !== resolved) return false;
  if (modifiers.has("Ctrl") !== event.ctrlKey) return false;
  if (modifiers.has("Meta") !== event.metaKey) return false;
  if (modifiers.has("Alt") !== event.altKey) return false;
  if (key.length > 1 && modifiers.has("Shift") !== event.shiftKey) return false;
  return true;
}

export function keyRepresentation(event: KeyboardEvent): string {
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
  event: KeyboardEvent,
  binding: KeyBindingDef,
): MatchResult {
  const sequence = parseKeys(binding.keys);
  const nextIndex = pending.length;

  if (nextIndex >= sequence.length) return "none";

  for (let i = 0; i < pending.length; i++) {
    if (pending[i] !== sequence[i]) return "none";
  }

  if (!eventMatchesStep(event, sequence[nextIndex])) return "none";

  return nextIndex + 1 === sequence.length ? "full" : "prefix";
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
  const pendingKeysRef = useRef<string[]>([]);
  const timeoutRef = useRef<number>(0);
  const [mode, setMode] = useState("normal");
  const [pendingKeys, setPendingKeys] = useState<readonly string[]>([]);

  const actionMapRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    const map = new Map<string, () => void>();
    for (const action of resolvedActions) {
      map.set(action.id, action.onSelect);
    }
    actionMapRef.current = map;
  }, [resolvedActions]);

  const syncState = useCallback(() => {
    setMode(effectiveMode(modeStackRef.current));
    setPendingKeys([...pendingKeysRef.current]);
  }, []);

  const clearPending = useCallback(() => {
    pendingKeysRef.current = [];
    window.clearTimeout(timeoutRef.current);
    syncState();
  }, [syncState]);

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
      if (MODIFIER_KEYS.has(event.key)) return;

      const currentMode = effectiveMode(modeStackRef.current);
      const pending = pendingKeysRef.current;

      const modeBindings = bindings.filter((b) => b.mode === currentMode);

      let bestFullMatch: KeyBindingDef | null = null;
      let hasPrefix = false;

      for (const binding of modeBindings) {
        const result = matchBinding(pending, event, binding);
        if (result === "full") {
          if (actionMapRef.current.has(binding.action)) {
            bestFullMatch = binding;
          }
        } else if (result === "prefix") {
          hasPrefix = true;
        }
      }

      if (bestFullMatch) {
        event.preventDefault();
        pendingKeysRef.current = [];
        window.clearTimeout(timeoutRef.current);
        syncState();
        actionMapRef.current.get(bestFullMatch.action)?.();
        return;
      }

      if (hasPrefix) {
        event.preventDefault();
        const keyRep = keyRepresentation(event);
        pendingKeysRef.current = [...pending, keyRep];
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          pendingKeysRef.current = [];
          syncState();
        }, SEQUENCE_TIMEOUT_MS);
        syncState();
        return;
      }

      if (pending.length > 0) {
        pendingKeysRef.current = [];
        window.clearTimeout(timeoutRef.current);
        syncState();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, syncState]);

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
    () => ({ mode, pendingKeys, pushMode, popMode }),
    [mode, pendingKeys, pushMode, popMode],
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
  const { mode, pendingKeys } = useKeyboardNavContext();

  const displayMode = mode !== "normal" ? mode.toUpperCase() : null;
  const displayKeys =
    pendingKeys.length > 0 ? pendingKeys.map(formatPendingKey).join(" ") : null;

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
