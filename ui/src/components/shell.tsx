import {
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "wouter";
import {
  buildBreadcrumbs,
  buildWorkspaceHref,
  joinWorkspacePath,
  normalizeWorkspacePath,
} from "../path-utils";
import { createDirectory, deleteEntry, writeFile } from "../api/fs";
import { ApiError } from "../api/types";
import { useWorkspaceEntryInfo } from "../hooks/use-workspace-entry-info";
import {
  useWorkspaceMutated,
  useWorkspaceRefreshToken,
} from "../hooks/use-workspace-mutated";
import { getWorkspaceEntryInfo } from "../workspace-entry-info";
import { partitionShellActions } from "./shell-action-layout";
import {
  useShellActions,
  useShellResolvedActions,
  type ShellResolvedAction,
} from "./shell-actions";
import {
  canDeleteWorkspaceEntry,
  deleteConfirmationMessage,
  SHELL_DELETE_ACTION_ID,
} from "./shell-delete-action";
import { SidebarNav } from "./sidebar";
import { shellReducer, type ShellState } from "./shell-state";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const FULLSCREEN_KEY = "wisdom:fullscreen";
const FULLSCREEN_IDLE_TIMEOUT_MS = 1800;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");
const HEADER_ACTION_GAP_PX = 8;
const HEADER_ACTION_BUTTON_CLASSES =
  "inline-flex h-8 shrink-0 items-center rounded-md border border-bdr bg-surface px-3 text-sm leading-none text-txt transition-colors hover:border-bdr hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

function readFullscreenPref(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_KEY) === "true";
  } catch {
    return false;
  }
}

function createInitialShellState(): ShellState {
  return {
    fullscreen: readFullscreenPref(),
    sidebarOpen: false,
  };
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    return element.getClientRects().length > 0;
  });
}

function isValidCreatePath(path: string): boolean {
  if (path === "" || path.startsWith("/")) {
    return false;
  }
  const segments = path.split("/");
  if (segments.length === 0) {
    return false;
  }
  return segments.every((segment) => {
    return segment.length > 0 && segment !== "." && segment !== "..";
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.body || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed";
}

function Breadcrumbs() {
  const onWorkspaceMutated = useWorkspaceMutated();
  const [, navigate] = useLocation();
  const {
    path,
    data: entryInfo,
    loading: entryInfoLoading,
    error: entryInfoError,
  } = useWorkspaceEntryInfo();
  const breadcrumbs = buildBreadcrumbs(path);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const isFileRoute = entryInfo?.kind === "file";
  const shouldReplaceCurrentCrumb =
    creating && isFileRoute && breadcrumbs.length > 0;
  const deleteEntryInfo = canDeleteWorkspaceEntry(entryInfo, path)
    ? entryInfo
    : null;
  const canDeleteCurrentEntry = deleteEntryInfo !== null;

  const basePath =
    entryInfo?.kind === "file" || entryInfo?.kind === "missing"
      ? entryInfo.parentPath
      : path;

  useEffect(() => {
    setCreating(false);
    setDraft("");
    setCreateError(null);
    setCreatePending(false);
    setDeletePending(false);
    setDeleteError(null);
  }, [path]);

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
    }
  }, [creating]);

  const closeComposer = useCallback(() => {
    if (createPending || deletePending) {
      return;
    }
    setCreating(false);
    setDraft("");
    setCreateError(null);
  }, [createPending, deletePending]);

  const openComposer = useCallback(() => {
    if (entryInfoLoading || createPending || deletePending) {
      return;
    }
    setCreateError(null);
    setDeleteError(null);
    setCreating(true);
  }, [entryInfoLoading, createPending, deletePending]);

  const submitCreate = useCallback(async () => {
    if (createPending || deletePending) {
      return;
    }

    const rawInput = draft.trim();
    const createDirectoryTarget = rawInput.endsWith("/");
    if (rawInput.startsWith("/")) {
      setCreateError("Enter a relative path");
      return;
    }
    const normalizedInput = normalizeWorkspacePath(rawInput);

    if (!isValidCreatePath(normalizedInput)) {
      setCreateError("Enter a valid relative path");
      return;
    }

    const targetPath = joinWorkspacePath(basePath, normalizedInput);
    setCreatePending(true);
    setCreateError(null);

    try {
      const existing = await getWorkspaceEntryInfo(targetPath);
      if (existing.kind === "file" || existing.kind === "directory") {
        setCreateError("Path already exists");
        return;
      }

      if (createDirectoryTarget) {
        await createDirectory(targetPath);
      } else {
        await writeFile(targetPath, "");
      }

      onWorkspaceMutated();
      setDraft("");
      setCreating(false);
      navigate(buildWorkspaceHref(targetPath));
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreatePending(false);
    }
  }, [
    basePath,
    createPending,
    deletePending,
    draft,
    navigate,
    onWorkspaceMutated,
  ]);

  const submitDelete = useCallback(async () => {
    if (!deleteEntryInfo || deletePending) {
      return;
    }

    const confirmed = window.confirm(
      deleteConfirmationMessage(deleteEntryInfo),
    );
    if (!confirmed) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);

    try {
      await deleteEntry(deleteEntryInfo.path, false);
      onWorkspaceMutated();
      navigate(buildWorkspaceHref(deleteEntryInfo.parentPath));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onWorkspaceMutated();
        navigate(buildWorkspaceHref(deleteEntryInfo.parentPath));
        return;
      }
      setDeleteError(errorMessage(error));
    } finally {
      setDeletePending(false);
    }
  }, [deletePending, deleteEntryInfo, navigate, onWorkspaceMutated]);

  const shellActions = useMemo(() => {
    if (!canDeleteCurrentEntry) {
      return [];
    }

    return [
      {
        id: SHELL_DELETE_ACTION_ID,
        label: deletePending ? "Deleting..." : "Delete",
        onSelect: () => {
          void submitDelete();
        },
        priority: -100,
        overflowOnly: true,
        disabled: deletePending,
      },
    ];
  }, [canDeleteCurrentEntry, deletePending, submitDelete]);

  useShellActions(shellActions);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submitCreate();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeComposer();
      }
    },
    [closeComposer, submitCreate],
  );

  const createInput = (
    <input
      ref={createInputRef}
      type="text"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (createError) {
          setCreateError(null);
        }
      }}
      onKeyDown={handleComposerKeyDown}
      placeholder="path/to/file.md or path/to/folder/"
      aria-label="Create path"
      aria-invalid={createError ? "true" : "false"}
      title={createError ?? undefined}
      className={`h-7 min-w-24 rounded border bg-surface-raised px-2 text-sm leading-none text-txt transition-colors focus-visible:border-accent focus-visible:outline-none ${
        createError ? "border-red-500" : "border-bdr"
      }`}
      disabled={createPending || deletePending}
      data-testid="breadcrumb-create-input"
    />
  );

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <nav
        aria-label="Breadcrumbs"
        className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden text-sm leading-none"
      >
        <Link
          to={buildWorkspaceHref("")}
          className="inline-flex h-8 shrink-0 items-center text-txt-muted transition-colors hover:text-txt"
        >
          ~
        </Link>
        {breadcrumbs.map((crumb) => {
          const isCurrentInput = shouldReplaceCurrentCrumb && crumb.isCurrent;
          return (
            <span
              key={crumb.href}
              className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden"
            >
              <span className="shrink-0 text-txt-muted">/</span>
              {isCurrentInput ? (
                createInput
              ) : crumb.isCurrent ? (
                <span className="inline-flex h-8 min-w-0 items-center truncate font-medium text-txt">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  to={crumb.href}
                  className="inline-flex h-8 min-w-0 items-center truncate text-txt-muted transition-colors hover:text-txt"
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          );
        })}
        {creating && !shouldReplaceCurrentCrumb && (
          <span className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden">
            <span className="shrink-0 text-txt-muted">/</span>
            {createInput}
          </span>
        )}
      </nav>
      <button
        type="button"
        aria-label="Create"
        onClick={openComposer}
        disabled={entryInfoLoading || createPending || deletePending}
        title={entryInfoError ? "Unable to determine current path type" : "New"}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-txt-muted transition-colors hover:border-bdr hover:bg-surface-raised hover:text-txt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="breadcrumb-create-button"
      >
        +
      </button>
      {createError && (
        <p
          className="hidden max-w-56 truncate text-xs text-red-600 md:block"
          data-testid="breadcrumb-create-error"
        >
          {createError}
        </p>
      )}
      {deleteError && (
        <p
          className="hidden max-w-56 truncate text-xs text-red-600 md:block"
          data-testid="breadcrumb-delete-error"
        >
          {deleteError}
        </p>
      )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ShrinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

interface ShellHeaderActionButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  children: ReactNode;
}

function ShellHeaderActionButton({
  children,
  className = "",
  type = "button",
  ...props
}: ShellHeaderActionButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${HEADER_ACTION_BUTTON_CLASSES} ${className}`}
    >
      {children}
    </button>
  );
}

interface ShellHeaderActionsProps {
  actions: readonly ShellResolvedAction[];
  routeKey: string;
  mobile: boolean;
}

function ShellHeaderActions({
  actions,
  routeKey,
  mobile,
}: ShellHeaderActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [buttonWidths, setButtonWidths] = useState<Record<string, number>>({});
  const [overflowButtonWidth, setOverflowButtonWidth] = useState(88);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    return partitionShellActions({
      actions,
      containerWidth,
      buttonWidths,
      overflowButtonWidth,
      gapPx: HEADER_ACTION_GAP_PX,
      mobile,
    });
  }, [actions, buttonWidths, containerWidth, mobile, overflowButtonWidth]);

  const handleActionSelect = useCallback((action: ShellResolvedAction) => {
    action.onSelect();
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [routeKey]);

  useEffect(() => {
    if (layout.overflowActions.length > 0) {
      return;
    }
    setMenuOpen(false);
  }, [layout.overflowActions.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth(Math.ceil(container.getBoundingClientRect().width));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [actions.length]);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure) {
      return;
    }

    const nextButtonWidths: Record<string, number> = {};
    const nodes = measure.querySelectorAll<HTMLElement>(
      "[data-shell-action-measure-index]",
    );
    for (const node of nodes) {
      const indexAttr = node.getAttribute("data-shell-action-measure-index");
      if (indexAttr === null) {
        continue;
      }
      const index = Number(indexAttr);
      if (!Number.isInteger(index)) {
        continue;
      }
      const action = actions[index];
      if (!action) {
        continue;
      }
      nextButtonWidths[action.id] = Math.ceil(
        node.getBoundingClientRect().width,
      );
    }

    setButtonWidths(nextButtonWidths);

    const overflowMeasure = measure.querySelector<HTMLElement>(
      "[data-shell-action-overflow-measure]",
    );
    if (!overflowMeasure) {
      return;
    }
    setOverflowButtonWidth(
      Math.ceil(overflowMeasure.getBoundingClientRect().width),
    );
  }, [actions]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = menuRootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node)) {
        return;
      }
      if (root.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setMenuOpen(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 flex-1"
      data-testid="shell-header-actions"
    >
      <div className="flex min-w-0 items-center justify-end gap-2">
        {layout.inlineActions.map((action) => (
          <ShellHeaderActionButton
            key={action.id}
            onClick={() => handleActionSelect(action)}
            disabled={action.disabled}
            data-shell-action-id={action.id}
          >
            {action.label}
          </ShellHeaderActionButton>
        ))}
        {layout.overflowActions.length > 0 && (
          <div ref={menuRootRef} className="relative shrink-0">
            <ShellHeaderActionButton
              aria-haspopup="menu"
              aria-expanded={menuOpen ? "true" : "false"}
              onClick={() => setMenuOpen((current) => !current)}
              data-testid="shell-actions-overflow-trigger"
            >
              <span>More</span>
              <span className="ml-1">
                <ChevronDownIcon />
              </span>
            </ShellHeaderActionButton>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+0.25rem)] z-[80] min-w-44 rounded-md border border-bdr bg-surface p-1 shadow-lg"
                data-testid="shell-actions-overflow-menu"
              >
                {layout.overflowActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    disabled={action.disabled}
                    onClick={() => handleActionSelect(action)}
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-txt transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                    data-shell-action-id={action.id}
                  >
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 h-0 overflow-hidden opacity-0"
      >
        <div className="flex items-center gap-2">
          {actions.map((action, index) => (
            <span
              key={action.id}
              data-shell-action-measure-index={index}
              className={HEADER_ACTION_BUTTON_CLASSES}
            >
              {action.label}
            </span>
          ))}
          <span
            data-shell-action-overflow-measure
            className={HEADER_ACTION_BUTTON_CLASSES}
          >
            <span>More</span>
            <span className="ml-1">
              <ChevronDownIcon />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ChromePanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-bdr bg-surface/95 shadow-sm backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

interface IconButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  label: string;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

function IconButton({
  label,
  children,
  className = "",
  buttonRef,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      ref={buttonRef}
      type={type}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-txt-muted transition-colors hover:border-bdr hover:bg-surface-raised hover:text-txt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {children}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    shellReducer,
    undefined,
    createInitialShellState,
  );
  const [location] = useLocation();
  const shellActions = useShellResolvedActions();

  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(
    () => !readFullscreenPref(),
  );
  const [controlsContainFocus, setControlsContainFocus] = useState(false);
  const [controlsIdleCycle, setControlsIdleCycle] = useState(0);
  const sidebarRefreshToken = useWorkspaceRefreshToken();
  const [isDesktop, setIsDesktop] = useState(() => {
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  });

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  const toggleFullscreen = useCallback(() => {
    dispatch({ type: "TOGGLE_FULLSCREEN" });
  }, []);

  const closeSidebar = useCallback(() => {
    dispatch({ type: "CLOSE_SIDEBAR" });
  }, []);

  const handleMobileNavigate = useCallback(() => {
    dispatch({ type: "CLOSE_SIDEBAR" });
  }, []);

  const handleMobileDrawerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "Tab") {
        return;
      }

      const drawer = mobileDrawerRef.current;
      if (!drawer) {
        return;
      }

      const nodes = getFocusableElements(drawer);
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const revealFullscreenControls = useCallback(() => {
    setFullscreenControlsVisible(true);
    setControlsIdleCycle((value) => value + 1);
  }, []);

  const handleControlsFocusCapture = useCallback(() => {
    setControlsContainFocus(true);
    setFullscreenControlsVisible(true);
  }, []);

  const handleControlsBlurCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        event.currentTarget.contains(nextTarget)
      ) {
        return;
      }
      setControlsContainFocus(false);
      setControlsIdleCycle((value) => value + 1);
    },
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(FULLSCREEN_KEY, String(state.fullscreen));
    } catch {
      // ignore
    }
  }, [state.fullscreen]);

  useEffect(() => {
    dispatch({ type: "ROUTE_CHANGED" });
  }, [location]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA_QUERY);

    const applyViewportState = () => {
      setIsDesktop(media.matches);
      if (media.matches) {
        dispatch({ type: "VIEWPORT_DESKTOP" });
      }
    };

    applyViewportState();
    media.addEventListener("change", applyViewportState);

    return () => {
      media.removeEventListener("change", applyViewportState);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (state.sidebarOpen) {
        dispatch({ type: "CLOSE_SIDEBAR" });
      }
      if (state.fullscreen) {
        dispatch({ type: "TOGGLE_FULLSCREEN" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [state.fullscreen, state.sidebarOpen]);

  useEffect(() => {
    if (!state.sidebarOpen) {
      return;
    }

    const drawer = mobileDrawerRef.current;
    if (!drawer) {
      return;
    }

    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableElements = getFocusableElements(drawer);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      menuButton?.focus();
    };
  }, [state.sidebarOpen]);

  useEffect(() => {
    if (!state.fullscreen) {
      setFullscreenControlsVisible(true);
      setControlsContainFocus(false);
      return;
    }
    setFullscreenControlsVisible(true);
    setControlsContainFocus(false);
  }, [state.fullscreen]);

  useEffect(() => {
    if (
      !state.fullscreen ||
      !fullscreenControlsVisible ||
      controlsContainFocus
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFullscreenControlsVisible(false);
    }, FULLSCREEN_IDLE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    state.fullscreen,
    fullscreenControlsVisible,
    controlsContainFocus,
    controlsIdleCycle,
  ]);

  return (
    <div
      data-testid="shell-root"
      data-fullscreen={state.fullscreen ? "true" : "false"}
      data-mobile-sidebar-open={state.sidebarOpen ? "true" : "false"}
      className="shell-root bg-bg"
    >
      <header className="shell-header">
        <ChromePanel className="shell-header-chrome h-full">
          <div className="flex h-full min-w-0 items-center gap-2 px-2">
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label={
                  state.fullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
                onClick={toggleFullscreen}
                data-testid="fullscreen-toggle-header"
              >
                {state.fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
              </IconButton>
              <IconButton
                label={
                  state.sidebarOpen ? "Close navigation" : "Open navigation"
                }
                onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
                buttonRef={menuButtonRef}
                className="md:hidden"
                data-testid="mobile-menu-button"
              >
                {state.sidebarOpen ? <CloseIcon /> : <MenuIcon />}
              </IconButton>
            </div>
            <div className="min-w-0 flex-1">
              <Breadcrumbs />
            </div>
            {shellActions.length > 0 && (
              <ShellHeaderActions
                actions={shellActions}
                routeKey={location}
                mobile={!isDesktop}
              />
            )}
          </div>
        </ChromePanel>
      </header>

      <aside
        className="shell-sidebar-desktop hidden md:block"
        data-testid="desktop-sidebar"
      >
        <ChromePanel className="shell-sidebar-desktop-chrome h-full">
          <SidebarNav refreshToken={sidebarRefreshToken} />
        </ChromePanel>
      </aside>

      <main className="shell-main">{children}</main>

      {state.fullscreen && (
        <>
          <button
            type="button"
            aria-label="Reveal fullscreen controls"
            className="shell-reveal-strip"
            data-testid="fullscreen-reveal-strip"
            onMouseEnter={revealFullscreenControls}
            onFocus={revealFullscreenControls}
            onClick={revealFullscreenControls}
          />
          <div
            data-testid="fullscreen-controls"
            data-visible={fullscreenControlsVisible ? "true" : "false"}
            className={`shell-fullscreen-controls ${fullscreenControlsVisible ? "" : "shell-fullscreen-controls-hidden"}`}
            onFocusCapture={handleControlsFocusCapture}
            onBlurCapture={handleControlsBlurCapture}
          >
            <ChromePanel className="p-1">
              <IconButton
                label="Exit fullscreen"
                onClick={toggleFullscreen}
                onMouseEnter={revealFullscreenControls}
                onClickCapture={revealFullscreenControls}
                data-testid="fullscreen-toggle-overlay"
              >
                <ShrinkIcon />
              </IconButton>
            </ChromePanel>
          </div>
        </>
      )}

      <div
        aria-hidden={!state.sidebarOpen}
        className="shell-backdrop md:hidden"
        data-testid="mobile-backdrop"
        onClick={closeSidebar}
      />
      <aside
        ref={mobileDrawerRef}
        aria-hidden={!state.sidebarOpen}
        aria-label="Workspace navigation"
        aria-modal="true"
        className="shell-sidebar-mobile md:hidden"
        data-testid="mobile-drawer"
        onKeyDown={handleMobileDrawerKeyDown}
        role="dialog"
      >
        <ChromePanel className="flex h-full flex-col shadow-lg">
          <div className="flex items-center justify-between border-b border-bdr px-3 py-2">
            <p className="text-sm font-medium text-txt">Navigation</p>
            <IconButton
              label="Close navigation"
              onClick={closeSidebar}
              data-testid="mobile-drawer-close"
            >
              <CloseIcon />
            </IconButton>
          </div>
          <SidebarNav
            onNavigate={handleMobileNavigate}
            refreshToken={sidebarRefreshToken}
          />
        </ChromePanel>
      </aside>
    </div>
  );
}
