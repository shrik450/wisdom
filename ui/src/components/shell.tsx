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
import { useLocation } from "wouter";
import { useWorkspaceEntryInfo } from "../hooks/use-workspace-entry-info";
import { useWorkspaceRefreshToken } from "../hooks/use-workspace-mutated";
import { partitionHeaderActions } from "../actions/action-header-layout";
import {
  useActions,
  useResolvedActions,
  type ActionSpec,
  type ResolvedAction,
} from "../actions/action-registry";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import {
  ChevronDownIcon,
  CloseIcon,
  ExpandIcon,
  MenuIcon,
  SearchIcon,
  ShrinkIcon,
} from "./icons";
import { SidebarNav } from "./sidebar";
import { shellReducer, type PaletteMode, type ShellState } from "./shell-state";
import {
  KeyboardNavContext,
  ModeIndicator,
  useKeyboardNav,
} from "../keyboard/keyboard-nav";
import { keybinds } from "../keybinds";

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
  const isDesktopViewport = window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  return {
    fullscreen: readFullscreenPref(),
    navOpen: isDesktopViewport,
    paletteMode: null,
  };
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    return element.getClientRects().length > 0;
  });
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
  actions: readonly Extract<ResolvedAction, { kind: "command" }>[];
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
    return partitionHeaderActions({
      actions,
      containerWidth,
      buttonWidths,
      overflowButtonWidth,
      gapPx: HEADER_ACTION_GAP_PX,
      mobile,
    });
  }, [actions, buttonWidths, containerWidth, mobile, overflowButtonWidth]);

  const handleActionSelect = useCallback(
    (action: Extract<ResolvedAction, { kind: "command" }>) => {
      action.onSelect(null);
      setMenuOpen(false);
    },
    [],
  );

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
  const { path: workspacePath } = useWorkspaceEntryInfo();
  const allActions = useResolvedActions();
  const { contextValue: keyboardNav } = useKeyboardNav(keybinds, allActions);
  const { popMode } = keyboardNav;
  const headerActions = useMemo<
    readonly Extract<ResolvedAction, { kind: "command" }>[]
  >(() => {
    return allActions.filter(
      (action): action is Extract<ResolvedAction, { kind: "command" }> =>
        action.kind === "command" &&
        (action.headerDisplay === "inline" ||
          action.headerDisplay === "overflow"),
    );
  }, [allActions]);

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
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  const toggleFullscreen = useCallback(() => {
    dispatch({
      type: "TOGGLE_FULLSCREEN",
      isDesktop: window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: "TOGGLE_SIDEBAR" });
  }, []);

  const openPalette = useCallback((mode: PaletteMode) => {
    const isDesktopViewport = window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
    dispatch({ type: "OPEN_PALETTE", isDesktop: isDesktopViewport, mode });
  }, []);

  const closePalette = useCallback(() => {
    dispatch({ type: "CLOSE_PALETTE" });
  }, []);

  const closeSidebar = useCallback(() => {
    dispatch({ type: "CLOSE_SIDEBAR" });
  }, []);

  const handleMobileNavigate = useCallback(() => {
    dispatch({ type: "CLOSE_SIDEBAR" });
  }, []);

  const shellViewActions = useMemo<readonly ActionSpec[]>(
    () => [
      {
        kind: "command",
        id: "app.toggle-fullscreen",
        label: state.fullscreen ? "Exit Fullscreen" : "Enter Fullscreen",
        onSelect: (count) => {
          void count;
          toggleFullscreen();
        },
      },
      {
        kind: "command",
        id: "app.toggle-sidebar",
        label: "Toggle Sidebar",
        onSelect: (count) => {
          void count;
          toggleSidebar();
        },
      },
      {
        kind: "command",
        id: "app.open-palette",
        label: "Open Palette",
        onSelect: (count) => {
          void count;
          openPalette("search");
        },
        headerDisplay: "palette-only",
      },
      {
        kind: "command",
        id: "app.open-command-palette",
        label: "Open Command Palette",
        onSelect: (count) => {
          void count;
          openPalette("command");
        },
        headerDisplay: "palette-only",
      },
      {
        kind: "command",
        id: "app.blur",
        label: "Blur",
        onSelect: (count) => {
          void count;
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          }
        },
        headerDisplay: "palette-only",
      },
      {
        kind: "command",
        id: "app.enter-normal",
        label: "Enter Normal Mode",
        onSelect: (count) => {
          void count;
          popMode();
        },
        headerDisplay: "palette-only",
      },
    ],
    [state.fullscreen, toggleFullscreen, toggleSidebar, openPalette, popMode],
  );

  useActions(shellViewActions);

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
    const isDesktopViewport = window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
    dispatch({ type: "ROUTE_CHANGED", isDesktop: isDesktopViewport });
  }, [location]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA_QUERY);

    const applyViewportState = () => {
      setIsDesktop(media.matches);
    };

    applyViewportState();
    media.addEventListener("change", applyViewportState);

    return () => {
      media.removeEventListener("change", applyViewportState);
    };
  }, []);

  useEffect(() => {
    // On desktop the sidebar is an in-flow grid element, not an overlay
    // drawer, so body scroll locking only applies to the mobile drawer.
    if (!state.navOpen || isDesktop) {
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
  }, [state.navOpen, isDesktop]);

  useEffect(() => {
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
    <KeyboardNavContext.Provider value={keyboardNav}>
      <div
        data-testid="shell-root"
        data-fullscreen={state.fullscreen ? "true" : "false"}
        data-nav-open={state.navOpen ? "true" : "false"}
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
                  label="Search"
                  onClick={() => openPalette("search")}
                  buttonRef={paletteTriggerRef}
                  data-testid="palette-trigger"
                >
                  <SearchIcon />
                </IconButton>
                <IconButton
                  label={state.navOpen ? "Close navigation" : "Open navigation"}
                  onClick={toggleSidebar}
                  buttonRef={menuButtonRef}
                  data-testid="mobile-menu-button"
                >
                  {state.navOpen ? <CloseIcon /> : <MenuIcon />}
                </IconButton>
              </div>
              <div className="min-w-0 flex-1">
                <Breadcrumbs key={workspacePath} />
              </div>
              {headerActions.length > 0 && (
                <ShellHeaderActions
                  actions={headerActions}
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
          aria-hidden={!state.navOpen}
        >
          <ChromePanel className="shell-sidebar-desktop-chrome h-full">
            <SidebarNav refreshToken={sidebarRefreshToken} />
          </ChromePanel>
        </aside>

        <main className="shell-main">{children}</main>

        {state.paletteMode !== null && (
          <CommandPalette
            actions={allActions}
            onClose={closePalette}
            triggerRef={paletteTriggerRef}
            openMode={state.paletteMode}
          />
        )}

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
          aria-hidden={!state.navOpen}
          className="shell-backdrop md:hidden"
          data-testid="mobile-backdrop"
          onClick={closeSidebar}
        />
        <aside
          ref={mobileDrawerRef}
          aria-hidden={!state.navOpen}
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
        <ModeIndicator />
      </div>
    </KeyboardNavContext.Provider>
  );
}
