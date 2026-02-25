import type { KeyBindingDef } from "./keyboard/keyboard-nav";
import { defaultKeybinds as paletteBinds } from "./components/command-palette";

export const keybinds: KeyBindingDef[] = [
  // -- Normal mode: shell defaults --
  { mode: "normal", keys: "Space Space", action: "app.open-palette" },
  { mode: "normal", keys: "Space f", action: "app.toggle-fullscreen" },
  { mode: "normal", keys: "Space s", action: "app.toggle-sidebar" },

  // -- Insert mode: shell defaults --
  { mode: "insert", keys: "Escape", action: "app.blur" },

  // -- Visual mode: shell defaults --
  { mode: "visual", keys: "Escape", action: "app.enter-normal" },

  // -- Palette defaults --
  ...paletteBinds,
];
