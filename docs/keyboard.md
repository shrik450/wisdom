# Vim-Inspired Modal Keyboard Navigation

Design notes for a universal, extensible modal keyboard system for Wisdom.

## Goals

1. **Universal**: The keyboard system handles all keyboard navigation. No
   component implements its own `onKeyDown` for navigation purposes.
2. **Modal**: Vim-inspired modes where the same key does different things
   depending on mode.
3. **Extensible**: Components can push custom modes onto a mode stack.
   Viewers define actions; a central user-editable file wires keys to them.
4. **Leader key**: Space in Normal mode begins a key sequence (like vim's
   `<leader>`).
5. **Composable**: Integrates with the existing actions framework without
   requiring changes to `ActionSpec`.

## Current State

### Existing keyboard handling

| Key | Where | Effect |
|-----|-------|--------|
| Escape | Global (shell) | Close sidebar; exit fullscreen |
| Escape | Overflow menu | Close menu |
| Escape | Command palette | Close palette (stops propagation) |
| Escape | Breadcrumb input | Cancel create |
| Enter | Breadcrumb input | Submit create |
| Tab/Shift+Tab | Mobile drawer | Focus trap |
| ArrowDown/Up | Command palette | List navigation |
| Enter | Command palette | Select item |

There are no navigation shortcuts, no modal system, no key sequences. The shell
has one global `window.addEventListener("keydown", ...)` that only handles
Escape. That handler does not check `event.target`, so it fires even when an
input is focused. The command palette has its own `onKeyDown` for arrow keys,
Enter, and Escape.

### Relevant architecture

- **Actions framework** (`ui/src/actions/`): Priority-based action registry.
  Actions have `id`, `label`, `onSelect`, `priority`. Scoped to component
  lifetime via `useActions()` — actions appear on mount, vanish on unmount.
- **Viewer framework** (`ui/src/viewers/registry.ts`): Viewers receive
  `{ path, entry }` and render independently. Currently none register actions.
- **Shell state** (`ui/src/components/shell-state.ts`): Local `useReducer` with
  `fullscreen`, `navOpen`, `paletteOpen`. Not exposed via context.
- **Provider tree**: `WorkspaceMutatedProvider > ActionRegistryProvider >
  WorkspaceEntryProvider > Shell > WorkspaceView > Viewer`.

## Design

### Modes and the mode stack

Mode is explicit state managed as a **stack**. Components push modes on mount
and pop them on unmount. The top of the stack is the active mode. Built-in
modes are Normal, Insert, and Visual; components can define additional
contextual modes (like `"palette"`).

| Mode | When active | Key behavior |
|------|-------------|--------------|
| **Normal** | Default. Bottom of the stack. | Navigation keys active. Leader key (Space) starts sequences. |
| **Insert** | Derived fallback: when mode is Normal and an input is focused. | Only insert-mode bindings fire. Unmatched keys pass through to the focused input. |
| **Visual** | Explicitly pushed by a component (e.g., directory viewer for multi-select, future editor for text selection). | Visual-mode bindings fire. |
| **Custom** | Pushed by any component (e.g., `"palette"`, `"annotating"`). | Only bindings for that mode fire. Unmatched keys pass through. |

**Insert mode** is a derived fallback, not a stack entry. When the explicit
mode is Normal and `document.activeElement` matches `input, textarea, select,
[contenteditable="true"]`, the effective mode is Insert. This handles
"unmanaged" inputs (breadcrumb creator, etc.) without requiring every input to
push a mode. If a component has pushed any other mode (palette, visual, etc.),
the derived check does not apply — the explicit mode takes precedence.

**Mode stack mechanics:**

```typescript
pushMode(mode: string): void   // push onto stack
popMode(): void                // pop top, restoring previous mode
```

The palette calls `pushMode("palette")` on mount and `popMode()` on unmount.
When it pops, the previous mode (Normal, or whatever was active before) is
restored automatically. There is no need to know what the previous mode was.

**Isolation:** When a mode is active, only bindings for that mode are resolved.
This provides hard isolation — a viewer's insert-mode Ctrl+B binding cannot
fire while the palette mode is active, because the handler only checks
palette-mode bindings.

### Handler logic

The keyboard handler follows one uniform path for every keypress:

1. **Determine the effective mode.** Top of the mode stack. If the stack is
   empty (or top is `"normal"`) and an input is focused, effective mode is
   `"insert"`.
2. **Ignore modifier-only keypresses.** If `event.ctrlKey`, `event.metaKey`, or
   `event.altKey` is true and the binding doesn't explicitly include that
   modifier, pass through.
3. **Append key to `pendingKeys`.** Scan the binding array for entries matching
   the effective mode.
4. **Resolve:**
   - **Full match** whose action resolves → call `onSelect()`,
     `preventDefault()`, clear buffer.
   - **Prefix match** → keep waiting, reset timeout, `preventDefault()`.
   - **No match** → clear buffer. The key passes through to the focused
     element (no `preventDefault`).
5. If a binding fully matches but its action ID doesn't resolve (component not
   mounted), treat as no match and continue scanning. This lets a later binding
   for the same key take effect as a fallback.

There are no special cases. Escape is a binding in each mode. Arrow keys in the
palette are bindings. Everything goes through the same path.

### Escape handling

Escape is a regular binding, defined per-mode in `keybinds.ts`:

```typescript
{ mode: "insert",  keys: "Escape", action: "app.blur" },
{ mode: "palette", keys: "Escape", action: "palette.close" },
{ mode: "visual",  keys: "Escape", action: "app.enter-normal" },
```

- In Insert mode (derived): `app.blur` calls
  `(document.activeElement as HTMLElement)?.blur()`. The input loses focus,
  and with no input focused, the derived mode check returns Normal.
- In palette mode: `palette.close` closes the palette. The palette unmounts,
  calling `popMode()`, which restores the previous mode.
- In Visual mode: `app.enter-normal` pops Visual mode (or resets to Normal).
- In Normal mode: Escape has no binding. No-op.

### Key handling architecture

The keyboard system is a **hook used by Shell**, not a provider wrapping it.

- The handler needs resolved actions (from `ActionRegistryProvider`, which is
  an ancestor of Shell) for binding resolution.
- Shell already owns the global keydown listener — this replaces it.

Shell calls `useKeyboardNav()`, which:

1. Attaches a `window.addEventListener("keydown", handler)` in bubble phase.
   Bubble phase lets components that genuinely need to intercept events (like
   focus traps) use `stopPropagation()` to prevent the handler from firing.
2. Owns the mode stack, `pendingKeys` buffer, and sequence timeout.
3. Resolves keypresses against the binding list and resolved actions.

A `KeyboardNavContext` is exposed via React context:

```typescript
interface KeyboardNavContext {
  mode: string;                    // effective mode (top of stack or derived)
  pendingKeys: readonly string[];
  pushMode: (mode: string) => void;
  popMode: () => void;
}
```

### Leader key and key sequences

In Normal mode, pressing Space starts a key sequence:

1. Buffer the key in `pendingKeys`.
2. Start a timeout (configurable via a constant, default TBD). If it fires with
   no follow-up key, cancel the sequence and clear `pendingKeys`.
3. On the next keypress, append to the buffer and scan the binding list:
   - **Full match** → resolve the action, execute, clear buffer.
   - **Prefix match** (some binding starts with the current buffer) → keep
     waiting, reset timeout.
   - **No match** → cancel, clear buffer.

For single-key bindings (the common case), the buffer is populated and resolved
in the same event — no timeout involved.

Multi-key non-leader sequences (like `g g`) work the same way: `g` is buffered,
the system sees a prefix match, and waits for the next key.

Matching is a linear scan over the binding array — with ~10-15 bindings, this
is simpler and fast enough. A trie would only be warranted at hundreds of
bindings.

### Binding configuration via `keybinds.ts`

Capabilities and bindings are cleanly separated:

- **Components define actions** via `useActions()`. Action IDs are the stable
  contract between bindings and capabilities.
- **Components export suggested bindings** as static `defaultKeybinds` arrays.
- **A central `ui/src/keybinds.ts` file** is the single source of truth for
  all active bindings. It imports component defaults, defines shell defaults,
  and is the file the user edits to customize.

```typescript
// keybinds.ts — the user's keybinding configuration
import { defaultKeybinds as directoryBinds } from "./viewers/directory-viewer";
import { defaultKeybinds as plainTextBinds } from "./viewers/plain-text-viewer";
import { defaultKeybinds as paletteBinds } from "./components/command-palette";

export const keybinds: KeyBindingDef[] = [
  // -- Normal mode: shell defaults --
  { mode: "normal", keys: "Space Space", action: "app.open-palette" },
  { mode: "normal", keys: "Space f",     action: "app.toggle-fullscreen" },
  { mode: "normal", keys: "Space s",     action: "app.toggle-sidebar" },
  { mode: "normal", keys: "/",           action: "app.search" },
  { mode: "normal", keys: "g g",         action: "app.scroll-top" },
  { mode: "normal", keys: "G",           action: "app.scroll-bottom" },

  // -- Insert mode: shell defaults --
  { mode: "insert", keys: "Escape",      action: "app.blur" },

  // -- Visual mode: shell defaults --
  { mode: "visual", keys: "Escape",      action: "app.enter-normal" },

  // -- Viewer defaults --
  ...directoryBinds,
  ...plainTextBinds,

  // -- Palette defaults (after viewers, so palette wins when mounted) --
  ...paletteBinds,

  // -- User overrides below this line --
  // Last resolvable match wins for the same key+mode:
  //
  // { mode: "normal", keys: "j", action: "my-custom-action" },
];
```

**Array ordering determines priority.** Later entries win over earlier ones for
the same key and mode (last resolvable match wins). This is why palette
bindings go after viewer bindings: when the palette is mounted, its bindings
take precedence. When it's unmounted, its actions don't resolve and the handler
falls through to earlier bindings.

**Why this works:**

1. **Components are decoupled from the keyboard system.** A component defines
   actions (what it can do) and exports default bindings (what keys it
   suggests). It registers zero bindings at runtime — that's `keybinds.ts`'s
   job.

2. **Viewer-scoping is free.** Actions exist only while the component is
   mounted. A binding referencing `"directory.next-item"` is inert when the
   directory viewer isn't active. When it mounts and registers that action, the
   binding becomes live.

3. **Overlay isolation is through the mode stack.** The palette pushes
   `"palette"` mode. Only palette-mode bindings fire. The editor's insert-mode
   bindings are dormant. When the palette pops, the previous mode's bindings
   resume.

4. **Data, not callbacks.** Defaults are exported arrays — inspectable,
   composable (spread, filter, map), and the user can see what each import
   contributes.

5. **User-editable by design.** `keybinds.ts` is just another source file the
   user edits. No settings UI, no JSON config, no runtime configuration layer.

6. **`ActionSpec` stays unchanged.** Bindings are a user concern, not an action
   concern.

**Caveat:** Action IDs become a stable API surface. If a component renames an
action ID, bindings referencing the old ID silently become no-ops. This fails
safe (no crash), and the user controls both sides.

#### Binding definition type

```typescript
interface KeyBindingDef {
  mode: string;        // "normal", "insert", "visual", or custom mode name
  keys: string;        // single key "j" or sequence "Space Space", "g g"
  action: string;      // action ID, resolved at keypress time
  description?: string; // for discoverability
}
```

### Command palette example

The palette is a full participant in the keyboard system. It pushes a custom
mode, registers actions, and exports default bindings. It has no `onKeyDown`
handler.

```typescript
// command-palette.tsx

// On mount: push mode, register actions
pushMode("palette");
// On unmount: popMode() via cleanup

useActions([
  { id: "palette.next",   label: "Next Result",
    onSelect: () => setSelectedIndex(i => (i + 1) % items.length) },
  { id: "palette.prev",   label: "Previous Result",
    onSelect: () => setSelectedIndex(i => (i - 1 + items.length) % items.length) },
  { id: "palette.select", label: "Select Result",
    onSelect: () => selectItem(items[selectedIndex]) },
  { id: "palette.close",  label: "Close Palette",
    onSelect: () => onClose() },
]);

// Static export: default bindings
export const defaultKeybinds: KeyBindingDef[] = [
  { mode: "palette", keys: "ArrowDown", action: "palette.next" },
  { mode: "palette", keys: "ArrowUp",   action: "palette.prev" },
  { mode: "palette", keys: "Enter",     action: "palette.select" },
  { mode: "palette", keys: "Escape",    action: "palette.close" },
];
```

Typing in the palette input works because unmatched keys (letters, numbers)
have no palette-mode binding and pass through to the focused input without
`preventDefault`.

### Viewer example

```typescript
// directory-viewer.tsx

useActions([
  { id: "directory.next-item", label: "Next Item",
    onSelect: () => moveSelection(1) },
  { id: "directory.prev-item", label: "Previous Item",
    onSelect: () => moveSelection(-1) },
  { id: "directory.open", label: "Open",
    onSelect: () => openSelected() },
  { id: "directory.go-parent", label: "Go to Parent",
    onSelect: () => navigateUp() },
]);

export const defaultKeybinds: KeyBindingDef[] = [
  { mode: "normal", keys: "j",     action: "directory.next-item" },
  { mode: "normal", keys: "k",     action: "directory.prev-item" },
  { mode: "normal", keys: "Enter", action: "directory.open" },
  { mode: "normal", keys: "l",     action: "directory.open" },
  { mode: "normal", keys: "h",     action: "directory.go-parent" },
];
```

### Suggested default bindings

Starting suggestions — exact set is a human decision:

| Mode | Key | Action ID | Notes |
|------|-----|-----------|-------|
| normal | `Space Space` | `app.open-palette` | Leader sequence |
| normal | `Space f` | `app.toggle-fullscreen` | Leader sequence |
| normal | `Space s` | `app.toggle-sidebar` | Leader sequence |
| normal | `j` / `k` | `app.scroll-down` / `app.scroll-up` | Overridden by viewer actions |
| normal | `g g` | `app.scroll-top` | Multi-key sequence |
| normal | `G` | `app.scroll-bottom` | |
| normal | `/` | `app.search` | Opens palette in search mode |
| insert | `Escape` | `app.blur` | Blur input, return to Normal |
| visual | `Escape` | `app.enter-normal` | Pop Visual mode |

### Key representation

Keys use `KeyboardEvent.key` values. Sequences are space-separated in the
config string: `"Space Space"`, `"g g"`. Internally parsed to arrays:

```typescript
type KeySequence = string[];  // ["Space", "Space"] or ["g", "g"]
```

Modifiers are prefixed: `"Ctrl+s"`, `"Shift+G"`. The parser splits on spaces
first (sequence steps), then on `+` within each step (modifiers).

### Mode indicator and pending key display

The mode indicator sits in the bottom-right corner of the shell, similar to
vim's status line. It shows:

- **Pending keys** during a sequence (e.g., `SPC` after pressing Space, waiting
  for the next key). This is essential — without visible feedback, a pending
  leader key feels like a lost keypress.
- **Non-Normal modes** when active (e.g., `INSERT`, `VISUAL`, `PALETTE`).
  Normal mode does not need an indicator since it's the default.

The indicator reads `mode` and `pendingKeys` from `KeyboardNavContext`. On
touch-only devices (detected via `pointer: coarse` media query), the indicator
is hidden since the keyboard system is naturally inert without a physical
keyboard.

### Mobile / touch devices

There is no reliable browser API to detect whether a physical keyboard is
present. `pointer: fine` and `hover: hover` are proxies for "desktop-like
device" but actually describe the pointing device, not the keyboard.

**No special gating is needed.** On a pure touch device without a physical
keyboard, the user never presses single-letter keys outside of an input. When
they do type (via a virtual keyboard), an input is focused, so the derived
Insert mode applies and unmatched keys pass through. The keyboard system is
naturally inert on touch-only devices.

The only mobile concern is visual noise: the mode indicator is hidden on touch
devices via a `(pointer: coarse)` media query.

### Migration of existing handlers

The shell's global Escape handler is replaced by the binding system (insert-mode
Escape → `app.blur`). Fullscreen and sidebar toggle move to `Space f`,
`Space s`, and the palette. The command palette's `onKeyDown` handler is removed
entirely — its keyboard interaction is handled by palette-mode bindings.

## Implementation approach

### New files

- `ui/src/keyboard/keyboard-nav.tsx` — types, the `useKeyboardNav` hook,
  `KeyboardNavContext`, mode stack, and binding resolution. Pure state (types,
  sequence matching logic) lives at the top of this file until it's large enough
  to split.
- `ui/src/keybinds.ts` — the user's keybinding configuration file.

### Accessibility

Globally capturing single-letter keys can interfere with screen readers (which
use letter keys for quick navigation) and browser accessibility features. Given
Wisdom's scope (personal tool, "for consenting adults"), full WCAG compliance
is not a goal. However, the system preserves browser modifier shortcuts
(Ctrl/Cmd/Alt combinations) by default, and the derived Insert mode bail-out
covers the most common assistive-technology interaction pattern.

## Open questions

1. **Sequence timeout duration**: configurable via a constant. Starting value
   TBD — 500ms is snappy, 1000ms is more forgiving. Tune by feel.
2. **Which built-in bindings to ship**: the table above is a starting point.
   Exact set is a human decision.

## Deferred

These are explicitly out of scope for v1:

- **Counts/repeats** (`5j` to move down 5 items): adds complexity to the
  key parsing for little benefit at current scale.
- **Operator-pending mode** (`d` + motion): viewer concern.
- **Help overlay** (`?` to show bindings): nice to have but not essential for
  v1. The user can read `keybinds.ts` directly.

## Design rationale: custom modes vs shared insert mode

An earlier version of this design used a fixed mode enum (Normal/Insert/Visual)
with no custom modes. The palette would have used insert-mode bindings, relying
on action lifecycle (mount/unmount) and keybinds.ts array ordering for scoping.

This was rejected because **action lifecycle scoping is based on mount/unmount,
not focus.** When the palette opens, the editor viewer stays mounted. Both the
editor's and palette's insert-mode bindings would be live simultaneously. A key
that only the editor binds (e.g., Ctrl+B for bold) would fire while the user is
in the palette — wrong behavior.

Custom modes solve this with hard isolation: the palette pushes `"palette"`
mode, and only palette-mode bindings are resolved. The editor's insert-mode
bindings are dormant. This follows the Vimium model (extensible mode stack with
automatic restoration) and avoids the precedence bugs that CodeMirror 6
encountered with ordering-based isolation.

Neovim uses a fixed mode set but achieves isolation through buffer-local
mappings — a two-level scope hierarchy (buffer-local > global) where only the
focused buffer's mappings take precedence. This is analogous to a focus-based
scoping mechanism that we don't have. Custom modes are a simpler way to achieve
the same isolation in a web context.

## Prior art and references

- [Vimium](https://github.com/philc/vimium) — browser extension with full vim
  navigation. Uses an extensible mode stack (`HandlerStack`) where each feature
  creates its own Mode. Stable, well-tested model for custom modes.
- [Mousetrap](https://craig.is/killing/mice) — JS library for keyboard
  shortcuts with sequence support, ~2kb.
- [CodeMirror 6](https://codemirror.net/docs/guide/) — uses keymap ordering
  for isolation. Had
  [precedence bugs](https://discuss.codemirror.net/t/autocompletion-keymap-precedence-again/4827)
  with autocompletion overlays — motivating our choice of custom modes over
  ordering.
- [Neovim](https://neovim.io/doc/user/) — fixed mode set with buffer-local
  mapping scoping. Custom modes
  [requested for 10+ years](https://github.com/neovim/neovim/issues/992) but
  never implemented; buffer-local scoping is "good enough." Plugins like
  [nvim-libmodal](https://github.com/Iron-E/nvim-libmodal) build custom modes
  in userland via `vim.on_key()`.
- [QMK leader key](https://thomasbaart.nl/2018/12/20/qmk-basics-leader-key/) —
  hardware keyboard firmware leader key with timeout; clean mental model.
- [Key sequence detection in JS](https://www.aleksandrhovhannisyan.com/blog/key-sequences-in-javascript/) —
  walkthrough of sequence detection with timeouts.
