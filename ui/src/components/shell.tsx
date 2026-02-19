import {
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  buildBreadcrumbs,
  buildWorkspaceHref,
  decodeWorkspaceRoutePath,
} from "../path-utils";
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

function Breadcrumbs() {
  const [, params] = useRoute("/ws/*");
  const encodedPath = params?.["*"] ?? "";
  const path = decodeWorkspaceRoutePath(encodedPath);
  const breadcrumbs = buildBreadcrumbs(path);

  return (
    <nav
      aria-label="Breadcrumbs"
      className="flex min-w-0 items-center gap-1 overflow-hidden text-sm"
    >
      <Link
        to={buildWorkspaceHref("")}
        className="shrink-0 text-txt-muted transition-colors hover:text-txt"
      >
        ~
      </Link>
      {breadcrumbs.map((crumb) => (
        <span
          key={crumb.href}
          className="flex min-w-0 shrink items-center gap-1 overflow-hidden"
        >
          <span className="shrink-0 text-txt-muted">/</span>
          {crumb.isCurrent ? (
            <span className="truncate font-medium text-txt">{crumb.name}</span>
          ) : (
            <Link
              to={crumb.href}
              className="truncate text-txt-muted transition-colors hover:text-txt"
            >
              {crumb.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
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

  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(
    () => !readFullscreenPref(),
  );
  const [controlsContainFocus, setControlsContainFocus] = useState(false);
  const [controlsIdleCycle, setControlsIdleCycle] = useState(0);

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

    const normalizeDesktop = () => {
      if (media.matches) {
        dispatch({ type: "VIEWPORT_DESKTOP" });
      }
    };

    normalizeDesktop();
    media.addEventListener("change", normalizeDesktop);

    return () => {
      media.removeEventListener("change", normalizeDesktop);
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
          </div>
        </ChromePanel>
      </header>

      <aside
        className="shell-sidebar-desktop hidden md:block"
        data-testid="desktop-sidebar"
      >
        <ChromePanel className="shell-sidebar-desktop-chrome h-full">
          <SidebarNav />
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
          <SidebarNav onNavigate={handleMobileNavigate} />
        </ChromePanel>
      </aside>
    </div>
  );
}
