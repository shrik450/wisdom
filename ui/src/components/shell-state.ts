export type PaletteMode = "search" | "command";

export interface ShellState {
  fullscreen: boolean;
  navOpen: boolean;
  paletteMode: PaletteMode | null;
}

export type ShellAction =
  | { type: "TOGGLE_FULLSCREEN"; isDesktop: boolean }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "CLOSE_SIDEBAR" }
  | { type: "OPEN_PALETTE"; isDesktop: boolean; mode: PaletteMode }
  | { type: "CLOSE_PALETTE" }
  | { type: "ROUTE_CHANGED"; isDesktop: boolean };

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case "TOGGLE_FULLSCREEN":
      if (state.fullscreen) {
        // Exiting fullscreen: restore nav to viewport default, close palette.
        // This intentionally resets navOpen rather than preserving the
        // pre-fullscreen state - fullscreen hides nav entirely, so restoring
        // the viewport default avoids leaving the user with no visible
        // navigation.
        return {
          fullscreen: false,
          navOpen: action.isDesktop,
          paletteMode: null,
        };
      }

      // Entering fullscreen: hide everything else.
      return {
        fullscreen: true,
        navOpen: false,
        paletteMode: null,
      };

    case "TOGGLE_SIDEBAR":
      if (state.navOpen) {
        return { ...state, navOpen: false };
      }

      // Opening sidebar exits fullscreen and closes palette.
      return {
        fullscreen: false,
        navOpen: true,
        paletteMode: null,
      };

    case "CLOSE_SIDEBAR":
      if (!state.navOpen) {
        return state;
      }
      return { ...state, navOpen: false };

    case "OPEN_PALETTE":
      // On mobile, close sidebar when opening palette.
      return {
        ...state,
        paletteMode: action.mode,
        navOpen: action.isDesktop ? state.navOpen : false,
      };

    case "CLOSE_PALETTE":
      if (state.paletteMode === null) {
        return state;
      }
      return { ...state, paletteMode: null };

    case "ROUTE_CHANGED":
      // Close palette; on mobile, also close sidebar.
      if (state.paletteMode === null && (action.isDesktop || !state.navOpen)) {
        return state;
      }
      return {
        ...state,
        paletteMode: null,
        navOpen: action.isDesktop ? state.navOpen : false,
      };
  }
}
