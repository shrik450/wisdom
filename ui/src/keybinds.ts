import type { KeyBindingDef } from "./keyboard/keyboard-nav";
import { defaultKeybinds as paletteBinds } from "./components/command-palette";

export const keybinds: KeyBindingDef[] = [
  // -- Normal mode: shell defaults --
  { mode: "normal", keys: "Space Space", action: "app.open-palette" },
  { mode: "normal", keys: "Space f", action: "app.toggle-fullscreen" },
  { mode: "normal", keys: "Space s", action: "app.toggle-sidebar" },

  // -- Normal mode: directory viewer --
  { mode: "normal", keys: "j", action: "dir.move-down" },
  { mode: "normal", keys: "k", action: "dir.move-up" },
  { mode: "normal", keys: "Enter", action: "dir.open" },
  { mode: "normal", keys: "l", action: "dir.open" },
  { mode: "normal", keys: "h", action: "dir.parent" },
  { mode: "normal", keys: "g g", action: "dir.first" },
  { mode: "normal", keys: "G", action: "dir.last" },

  // -- Normal mode: plain text viewer --
  { mode: "normal", keys: "y", action: "text.copy" },

  // -- Insert mode: shell defaults --
  { mode: "insert", keys: "Escape", action: "app.blur" },

  // -- Visual mode: shell defaults --
  { mode: "visual", keys: "Escape", action: "app.enter-normal" },

  // -- Palette defaults --
  ...paletteBinds,
];
