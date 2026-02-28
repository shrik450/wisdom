import type { KeyBindingDef } from "./keyboard/keybind-state-machine";

export const keybinds: KeyBindingDef[] = [
  // -- Normal mode: shell defaults --
  { mode: "normal", keys: "Space Space", action: "app.open-palette" },
  { mode: "normal", keys: "Space f", action: "app.toggle-fullscreen" },
  { mode: "normal", keys: "Space s", action: "app.toggle-sidebar" },

  // -- Normal mode: directory viewer --
  { mode: "normal", keys: "j", action: "dir.move-down", scope: "directory" },
  { mode: "normal", keys: "k", action: "dir.move-up", scope: "directory" },
  { mode: "normal", keys: "Enter", action: "dir.open", scope: "directory" },
  { mode: "normal", keys: "l", action: "dir.open", scope: "directory" },
  { mode: "normal", keys: "h", action: "dir.parent", scope: "directory" },
  { mode: "normal", keys: "g g", action: "dir.first", scope: "directory" },
  { mode: "normal", keys: "G", action: "dir.last", scope: "directory" },

  // -- Normal mode: plain text viewer --
  { mode: "normal", keys: "y", action: "text.copy", scope: "plain-text" },

  // -- Insert mode: shell defaults --
  { mode: "insert", keys: "Escape", action: "app.blur" },

  // -- Visual mode: shell defaults --
  { mode: "visual", keys: "Escape", action: "app.enter-normal" },

  // -- Palette defaults --
  { mode: "insert", keys: "Ctrl+n", action: "palette.next", scope: "palette" },
  { mode: "insert", keys: "Ctrl+p", action: "palette.prev", scope: "palette" },
  {
    mode: "insert",
    keys: "ArrowDown",
    action: "palette.next",
    scope: "palette",
  },
  {
    mode: "insert",
    keys: "ArrowUp",
    action: "palette.prev",
    scope: "palette",
  },
  {
    mode: "insert",
    keys: "Enter",
    action: "palette.select",
    scope: "palette",
  },
  {
    mode: "insert",
    keys: "Escape",
    action: "palette.close",
    scope: "palette",
  },
];
