import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { searchPaths, type PathSearchResult } from "../api/search";
import { buildWorkspaceHref } from "../path-utils";
import { type ResolvedAction } from "../actions/action-model";
import { useActions, type ActionSpec } from "../actions/action-registry";
import { useKeyboardNavContext } from "../keyboard/keyboard-nav";
import type { KeyBindingDef } from "../keyboard/keybind-state-machine";

const DEBOUNCE_MS = 150;
const SEARCH_LIMIT = 20;

interface PaletteItem {
  id: string;
  label: string;
  directory?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteProps {
  actions: readonly ResolvedAction[];
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

type ResolvedCommandAction = Extract<ResolvedAction, { kind: "command" }>;

function fileResultsToPaletteItems(
  results: PathSearchResult[],
  navigate: (href: string) => void,
): PaletteItem[] {
  return results.map((result) => {
    const lastSlash = result.path.lastIndexOf("/");
    const filename =
      lastSlash >= 0 ? result.path.slice(lastSlash + 1) : result.path;
    const directory = lastSlash >= 0 ? result.path.slice(0, lastSlash) : "";

    return {
      id: `file:${result.path}`,
      label: filename,
      directory: directory ? directory + "/" : undefined,
      onSelect: () => {
        navigate(buildWorkspaceHref(result.path));
      },
    };
  });
}

function filterActions(
  actions: readonly ResolvedCommandAction[],
  query: string,
): PaletteItem[] {
  const lowerQuery = query.toLowerCase();
  return actions
    .filter((action) => action.label.toLowerCase().includes(lowerQuery))
    .map((action) => ({
      id: `action:${action.id}`,
      label: action.label,
      disabled: action.disabled,
      onSelect: () => action.onSelect(null),
    }));
}

export function CommandPalette({
  actions,
  onClose,
  triggerRef,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [fileResults, setFileResults] = useState<PathSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number>(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const isCommandMode = query.startsWith(">");
  const searchQuery = isCommandMode ? "" : query.trim();
  const commandQuery = isCommandMode ? query.slice(1).trim() : "";

  // Debounced file search.
  useEffect(() => {
    window.clearTimeout(debounceRef.current);

    if (isCommandMode || searchQuery === "") {
      abortRef.current?.abort();
      abortRef.current = null;
      setFileResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      searchPaths(searchQuery, SEARCH_LIMIT, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setFileResults(results);
            setSearching(false);
          }
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (!controller.signal.aborted) {
            setFileResults([]);
            setSearching(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [searchQuery, isCommandMode]);

  // Cleanup abort controller on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Return focus to the button that opened the palette on unmount.
  useEffect(() => {
    const trigger = triggerRef.current;
    return () => {
      trigger?.focus();
    };
  }, [triggerRef]);

  const commandActions = useMemo<readonly ResolvedCommandAction[]>(() => {
    return actions.filter((action): action is ResolvedCommandAction => {
      return action.kind === "command";
    });
  }, [actions]);

  const items = useMemo<PaletteItem[]>(() => {
    if (isCommandMode) {
      return filterActions(commandActions, commandQuery);
    }
    return fileResultsToPaletteItems(fileResults, navigate);
  }, [isCommandMode, commandQuery, commandActions, fileResults, navigate]);

  // Reset selection when items change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = useCallback(
    (item: PaletteItem) => {
      if (item.disabled) {
        return;
      }
      item.onSelect();
      onClose();
    },
    [onClose],
  );

  const { pushMode, popMode } = useKeyboardNavContext();

  useEffect(() => {
    pushMode("palette");
    return () => popMode();
  }, [pushMode, popMode]);

  const paletteActions = useMemo<readonly ActionSpec[]>(
    () => [
      {
        kind: "command",
        id: "palette.next",
        label: "Next Result",
        onSelect: (count) => {
          void count;
          setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1));
        },
        headerDisplay: "palette-only" as const,
      },
      {
        kind: "command",
        id: "palette.prev",
        label: "Previous Result",
        onSelect: (count) => {
          void count;
          setSelectedIndex(
            (prev) =>
              (prev - 1 + Math.max(items.length, 1)) %
              Math.max(items.length, 1),
          );
        },
        headerDisplay: "palette-only" as const,
      },
      {
        kind: "command",
        id: "palette.select",
        label: "Select Result",
        onSelect: (count) => {
          void count;
          if (items[selectedIndex]) {
            selectItem(items[selectedIndex]);
          }
        },
        headerDisplay: "palette-only" as const,
      },
      {
        kind: "command",
        id: "palette.close",
        label: "Close Palette",
        onSelect: (count) => {
          void count;
          onClose();
        },
        headerDisplay: "palette-only" as const,
      },
    ],
    [items, selectedIndex, selectItem, onClose],
  );

  useActions(paletteActions);

  // Scroll selected item into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Close on click outside.
  const backdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const hasQuery = isCommandMode ? commandQuery !== "" : searchQuery !== "";
  const noResults = hasQuery && !searching && items.length === 0;
  const showResultsPanel = items.length > 0 || searching || noResults;
  const inputRounding = showResultsPanel ? "rounded-t-lg" : "rounded-lg";

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: "var(--shell-z-palette)" }}
      onClick={backdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto mt-[15vh] w-full max-w-xl px-4">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            isCommandMode
              ? "Type a command..."
              : "Search files... (type > for commands)"
          }
          className={`w-full border border-bdr bg-surface px-4 py-3 text-sm text-txt shadow-xl transition-colors placeholder:text-txt-muted focus-visible:border-accent focus-visible:outline-none ${inputRounding}`}
          aria-label="Command palette"
          data-testid="command-palette-input"
        />

        {showResultsPanel && (
          <div
            ref={listRef}
            className="max-h-80 overflow-y-auto rounded-b-lg bg-surface shadow-xl"
            role="listbox"
            data-testid="command-palette-results"
          >
            {searching && items.length === 0 && (
              <p className="px-3 py-2 text-sm text-txt-muted">Searching...</p>
            )}

            {noResults && (
              <p className="px-3 py-2 text-sm text-txt-muted">
                No results found
              </p>
            )}

            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                data-selected={index === selectedIndex}
                onClick={() => selectItem(item)}
                disabled={item.disabled}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  index === selectedIndex
                    ? "bg-surface-raised text-txt"
                    : "text-txt hover:bg-surface-raised"
                }`}
              >
                {item.directory && (
                  <span className="min-w-0 shrink truncate text-txt-muted">
                    {item.directory}
                  </span>
                )}
                <span className="shrink-0 font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const defaultKeybinds: KeyBindingDef[] = [
  { mode: "palette", keys: "ArrowDown", action: "palette.next" },
  { mode: "palette", keys: "ArrowUp", action: "palette.prev" },
  { mode: "palette", keys: "Enter", action: "palette.select" },
  { mode: "palette", keys: "Escape", action: "palette.close" },
];
