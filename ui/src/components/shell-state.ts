export interface ShellState {
  fullscreen: boolean;
  sidebarOpen: boolean;
}

export type ShellAction =
  | { type: "TOGGLE_FULLSCREEN" }
  | { type: "OPEN_SIDEBAR" }
  | { type: "CLOSE_SIDEBAR" }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "ROUTE_CHANGED" }
  | { type: "VIEWPORT_DESKTOP" };

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case "TOGGLE_FULLSCREEN":
      return {
        fullscreen: !state.fullscreen,
        sidebarOpen: false,
      };
    case "OPEN_SIDEBAR":
      return {
        fullscreen: false,
        sidebarOpen: true,
      };
    case "CLOSE_SIDEBAR":
      if (!state.sidebarOpen) {
        return state;
      }
      return { ...state, sidebarOpen: false };
    case "TOGGLE_SIDEBAR":
      if (state.sidebarOpen) {
        return { ...state, sidebarOpen: false };
      }
      return {
        fullscreen: false,
        sidebarOpen: true,
      };
    case "ROUTE_CHANGED":
      if (!state.sidebarOpen) {
        return state;
      }
      return { ...state, sidebarOpen: false };
    case "VIEWPORT_DESKTOP":
      if (!state.sidebarOpen) {
        return state;
      }
      return { ...state, sidebarOpen: false };
  }
}
