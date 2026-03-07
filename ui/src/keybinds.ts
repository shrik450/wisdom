import { defaultKeybinds as paletteKeybinds } from "./components/command-palette";
import { defaultKeybinds as directoryKeybinds } from "./viewers/directory-viewer";
import { defaultKeybinds as editorKeybinds } from "./viewers/editor/editor-viewer";
import { defaultKeybinds as plainTextKeybinds } from "./viewers/plain-text-viewer";
import type { KeyBindingDef } from "./keyboard/keybind-state-machine";

export const keybinds: KeyBindingDef[] = [
  // -- Normal mode: shell defaults --
  { mode: "normal", keys: "Space Space", action: "app.open-palette" },
  { mode: "normal", keys: ":", action: "app.open-command-palette" },
  { mode: "normal", keys: "Space f", action: "app.toggle-fullscreen" },
  { mode: "normal", keys: "Space s", action: "app.toggle-sidebar" },

  // -- Viewer defaults --
  ...directoryKeybinds,
  ...plainTextKeybinds,
  ...editorKeybinds,

  // -- Insert mode: shell defaults --
  { mode: "insert", keys: "Escape", action: "app.blur" },

  // -- Visual mode: shell defaults --
  { mode: "visual", keys: "Escape", action: "app.enter-normal" },

  // -- Palette defaults --
  ...paletteKeybinds,
];
