import assert from "node:assert/strict";
import test from "node:test";
import type {
  CommandActionSpec,
  MotionActionSpec,
  OperatorActionSpec,
  ResolvedAction,
} from "../src/actions/action-model.ts";
import {
  dispatch,
  expirePending,
  initialState,
  type KeyBindingDef,
  type KeyEventLike,
  type KeybindState,
} from "../src/keyboard/keybind-state-machine.ts";

function key(
  keyValue: string,
  mods?: Partial<Record<"ctrl" | "meta" | "alt" | "shift", boolean>>,
): KeyEventLike {
  return {
    key: keyValue,
    ctrlKey: !!mods?.ctrl,
    metaKey: !!mods?.meta,
    altKey: !!mods?.alt,
    shiftKey: !!mods?.shift,
  };
}

function commandAction(id: string): CommandActionSpec & {
  priority: number;
  registrationOrder: number;
  actionOrder: number;
} {
  return {
    kind: "command",
    id,
    label: id,
    onSelect: (count) => {
      void count;
    },
    priority: 0,
    registrationOrder: 0,
    actionOrder: 0,
  };
}

function motionAction(
  id: string,
  awaitChar = false,
): MotionActionSpec & {
  priority: number;
  registrationOrder: number;
  actionOrder: number;
} {
  return {
    kind: "motion",
    id,
    label: id,
    range: (count, char) => {
      void count;
      void char;
      return { from: 1, to: 2 };
    },
    awaitChar,
    priority: 0,
    registrationOrder: 0,
    actionOrder: 0,
  };
}

function operatorAction(id: string): OperatorActionSpec & {
  priority: number;
  registrationOrder: number;
  actionOrder: number;
} {
  return {
    kind: "operator",
    id,
    label: id,
    apply: (range) => {
      void range;
    },
    priority: 0,
    registrationOrder: 0,
    actionOrder: 0,
  };
}

function buildActionMap(actions: readonly ResolvedAction[]) {
  return new Map(actions.map((action) => [action.id, action]));
}

function step(
  state: KeybindState,
  event: KeyEventLike,
  bindings: readonly KeyBindingDef[],
  actions: readonly ResolvedAction[],
  mode = "normal",
  activeScope: string | null = null,
  inputFocused = false,
) {
  return dispatch(
    state,
    event,
    bindings,
    buildActionMap(actions),
    mode,
    activeScope,
    inputFocused,
  );
}

test("count accumulates and is passed to command", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "j", action: "j" },
  ];
  const actions: ResolvedAction[] = [commandAction("j")];

  let state = initialState();

  let result = step(state, key("3"), bindings, actions);
  assert.equal(result.result.type, "pending");
  state = result.nextState;

  result = step(state, key("j"), bindings, actions);
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.count, 3);
});

test("multi-digit count is accumulated", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "j", action: "j" },
  ];
  const actions: ResolvedAction[] = [commandAction("j")];

  let state = initialState();
  state = step(state, key("1"), bindings, actions).nextState;
  state = step(state, key("0"), bindings, actions).nextState;

  const result = step(state, key("j"), bindings, actions);
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.count, 10);
});

test("0 alone does not start count", () => {
  const result = step(initialState(), key("0"), [], []);
  assert.equal(result.result.type, "none");
  assert.equal(result.nextState.count, null);
});

test("count resets on Escape and unbound key", () => {
  let state = initialState();
  state = step(state, key("3"), [], []).nextState;

  let result = step(state, key("Escape"), [], []);
  assert.equal(result.result.type, "reset");

  state = initialState();
  state = step(state, key("3"), [], []).nextState;
  result = step(state, key("x"), [], []);
  assert.equal(result.result.type, "reset");
});

test("digits are not consumed when input is focused", () => {
  const result = step(initialState(), key("3"), [], [], "normal", null, true);
  assert.equal(result.result.type, "none");
  assert.equal(result.nextState.count, null);
});

test("operator then motion executes operator-motion", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "w", action: "motion.w" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    motionAction("motion.w"),
  ];

  let state = initialState();
  let result = step(state, key("d"), bindings, actions);
  assert.equal(result.result.type, "pending");
  state = result.nextState;

  result = step(state, key("w"), bindings, actions);
  assert.equal(result.result.type, "execute-operator-motion");
});

test("doubled-operator command executes as command", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "d d", action: "cmd.dd" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    commandAction("cmd.dd"),
  ];

  let state = initialState();
  state = step(state, key("d"), bindings, actions).nextState;
  const result = step(state, key("d"), bindings, actions);

  assert.equal(result.result.type, "execute-command");
});

test("operator pending resets on Escape or unknown key", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "w", action: "motion.w" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    motionAction("motion.w"),
  ];

  let state = initialState();
  state = step(state, key("d"), bindings, actions).nextState;
  let result = step(state, key("Escape"), bindings, actions);
  assert.equal(result.result.type, "reset");

  state = initialState();
  state = step(state, key("d"), bindings, actions).nextState;
  result = step(state, key("x"), bindings, actions);
  assert.equal(result.result.type, "reset");
});

test("operator and motion counts are tracked separately", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "w", action: "motion.w" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    motionAction("motion.w"),
  ];

  let state = initialState();
  state = step(state, key("3"), bindings, actions).nextState;
  state = step(state, key("d"), bindings, actions).nextState;
  state = step(state, key("2"), bindings, actions).nextState;

  const result = step(state, key("w"), bindings, actions);
  assert.equal(result.result.type, "execute-operator-motion");
  if (result.result.type !== "execute-operator-motion") {
    throw new Error("expected execute-operator-motion");
  }
  assert.equal(result.result.operatorCount, 3);
  assert.equal(result.result.motionCount, 2);
});

test("char-pending motion waits for printable character", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "f", action: "motion.find" },
  ];
  const actions: ResolvedAction[] = [motionAction("motion.find", true)];

  let state = initialState();
  let result = step(state, key("f"), bindings, actions);
  assert.equal(result.result.type, "pending");
  state = result.nextState;

  result = step(state, key("ArrowUp"), bindings, actions);
  assert.equal(result.result.type, "none");

  result = step(state, key("x"), bindings, actions);
  assert.equal(result.result.type, "execute-motion");
  if (result.result.type !== "execute-motion") {
    throw new Error("expected execute-motion");
  }
  assert.equal(result.result.char, "x");
});

test("char-pending resets on Escape", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "f", action: "motion.find" },
  ];
  const actions: ResolvedAction[] = [motionAction("motion.find", true)];

  let state = initialState();
  state = step(state, key("f"), bindings, actions).nextState;

  const result = step(state, key("Escape"), bindings, actions);
  assert.equal(result.result.type, "reset");
});

test("operator + char-pending motion executes operator-motion", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "f", action: "motion.find" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    motionAction("motion.find", true),
  ];

  let state = initialState();
  state = step(state, key("d"), bindings, actions).nextState;
  state = step(state, key("f"), bindings, actions).nextState;

  const result = step(state, key("x"), bindings, actions);
  assert.equal(result.result.type, "execute-operator-motion");
  if (result.result.type !== "execute-operator-motion") {
    throw new Error("expected execute-operator-motion");
  }
  assert.equal(result.result.char, "x");
});

test("operator + char-pending resets on Escape", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "f", action: "motion.find" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    motionAction("motion.find", true),
  ];

  let state = initialState();
  state = step(state, key("d"), bindings, actions).nextState;
  state = step(state, key("f"), bindings, actions).nextState;

  const result = step(state, key("Escape"), bindings, actions);
  assert.equal(result.result.type, "reset");
  assert.equal(result.nextState.pendingOperator, null);
  assert.equal(result.nextState.charPending, null);
});

test("Escape binding executes when there is no pending state", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "Escape", action: "cmd.escape" },
  ];
  const actions: ResolvedAction[] = [commandAction("cmd.escape")];

  const result = step(initialState(), key("Escape"), bindings, actions);
  assert.equal(result.result.type, "execute-command");
});

test("dispatch uses mode-specific bindings", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "j", action: "cmd.j" },
  ];
  const actions: ResolvedAction[] = [commandAction("cmd.j")];

  const result = step(initialState(), key("j"), bindings, actions, "insert");
  assert.equal(result.result.type, "none");
});

test("dispatch filters scoped bindings by active scope", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "j", action: "cmd.j" },
    { mode: "normal", keys: "y", action: "text.copy", scope: "plain-text" },
  ];
  const actions: ResolvedAction[] = [
    commandAction("cmd.j"),
    commandAction("text.copy"),
  ];

  let result = step(
    initialState(),
    key("y"),
    bindings,
    actions,
    "normal",
    "directory",
  );
  assert.equal(result.result.type, "none");

  result = step(
    initialState(),
    key("y"),
    bindings,
    actions,
    "normal",
    "plain-text",
  );
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.action.id, "text.copy");

  result = step(
    initialState(),
    key("j"),
    bindings,
    actions,
    "normal",
    "plain-text",
  );
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.action.id, "cmd.j");
});

test("scoped prefix does not create pending state outside its scope", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "g g", action: "scoped.gg", scope: "directory" },
  ];
  const actions: ResolvedAction[] = [commandAction("scoped.gg")];

  const result = step(
    initialState(),
    key("g"),
    bindings,
    actions,
    "normal",
    "plain-text",
  );
  assert.equal(result.result.type, "none");
  assert.deepEqual(result.nextState.pendingKeys, []);
});

test("scoped same-sequence prefix resolves scoped action over global", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "g g", action: "global.gg" },
    { mode: "normal", keys: "g g", action: "scoped.gg", scope: "directory" },
    { mode: "normal", keys: "g x", action: "global.gx" },
  ];
  const actions: ResolvedAction[] = [
    commandAction("global.gg"),
    commandAction("scoped.gg"),
    commandAction("global.gx"),
  ];

  let state = initialState();
  let result = step(state, key("g"), bindings, actions, "normal", "directory");
  assert.equal(result.result.type, "pending");
  state = result.nextState;

  result = step(state, key("g"), bindings, actions, "normal", "directory");
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.action.id, "scoped.gg");

  state = initialState();
  result = step(state, key("g"), bindings, actions, "normal", "directory");
  assert.equal(result.result.type, "pending");
  state = result.nextState;

  result = step(state, key("x"), bindings, actions, "normal", "directory");
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.action.id, "global.gx");
});

test("operator-pending motion matching respects scope", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "d", action: "op.d" },
    { mode: "normal", keys: "j", action: "motion.j", scope: "directory" },
  ];
  const actions: ResolvedAction[] = [
    operatorAction("op.d"),
    motionAction("motion.j"),
  ];

  let state = initialState();
  state = step(
    state,
    key("d"),
    bindings,
    actions,
    "normal",
    "directory",
  ).nextState;
  let result = step(state, key("j"), bindings, actions, "normal", "directory");
  assert.equal(result.result.type, "execute-operator-motion");
  if (result.result.type !== "execute-operator-motion") {
    throw new Error("expected execute-operator-motion");
  }
  assert.equal(result.result.motion.id, "motion.j");

  state = initialState();
  state = step(
    state,
    key("d"),
    bindings,
    actions,
    "normal",
    "plain-text",
  ).nextState;
  result = step(state, key("j"), bindings, actions, "normal", "plain-text");
  assert.equal(result.result.type, "reset");
});

test("scoped full match shadows global full match", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "insert", keys: "Escape", action: "app.blur" },
    {
      mode: "insert",
      keys: "Escape",
      action: "palette.close",
      scope: "palette",
    },
  ];
  const actions: ResolvedAction[] = [
    commandAction("app.blur"),
    commandAction("palette.close"),
  ];

  let result = step(
    initialState(),
    key("Escape"),
    bindings,
    actions,
    "insert",
    "palette",
  );
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.action.id, "palette.close");

  result = step(initialState(), key("Escape"), bindings, actions, "insert");
  assert.equal(result.result.type, "execute-command");
  if (result.result.type !== "execute-command") {
    throw new Error("expected execute-command");
  }
  assert.equal(result.result.action.id, "app.blur");
});

test("scoped prefixes do not suppress unrelated global prefixes", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "g g", action: "scoped.gg", scope: "directory" },
    { mode: "normal", keys: "Space f", action: "global.fullscreen" },
  ];
  const actions: ResolvedAction[] = [
    commandAction("scoped.gg"),
    commandAction("global.fullscreen"),
  ];

  const result = step(
    initialState(),
    key(" "),
    bindings,
    actions,
    "normal",
    "directory",
  );
  assert.equal(result.result.type, "pending");
  assert.deepEqual(result.nextState.pendingKeys, ["Space"]);
});

test("dispatch ignores full matches with missing actions", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "j", action: "missing" },
  ];

  const result = step(initialState(), key("j"), bindings, []);
  assert.equal(result.result.type, "none");
});

test("dispatch falls through from missing full match to resolvable one", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "j", action: "missing" },
    { mode: "normal", keys: "j", action: "cmd.j" },
  ];
  const actions: ResolvedAction[] = [commandAction("cmd.j")];

  const result = step(initialState(), key("j"), bindings, actions);
  assert.equal(result.result.type, "execute-command");
});

test("dispatch ignores unresolved prefix matches", () => {
  const bindings: KeyBindingDef[] = [
    { mode: "normal", keys: "g g", action: "missing" },
  ];

  const result = step(initialState(), key("g"), bindings, []);
  assert.equal(result.result.type, "none");
  assert.deepEqual(result.nextState.pendingKeys, []);
});

test("Escape reset requests preventDefault", () => {
  let state = initialState();
  state = step(state, key("3"), [], []).nextState;

  const result = step(state, key("Escape"), [], []);
  assert.equal(result.result.type, "reset");
  if (result.result.type !== "reset") {
    throw new Error("expected reset");
  }
  assert.equal(result.result.preventDefault, true);
});

test("mismatch reset does not request preventDefault", () => {
  let state = initialState();
  state = step(state, key("3"), [], []).nextState;

  const result = step(state, key("x"), [], []);
  assert.equal(result.result.type, "reset");
  if (result.result.type !== "reset") {
    throw new Error("expected reset");
  }
  assert.equal(result.result.preventDefault, false);
});

test("expirePending clears stale count when sequence times out", () => {
  const state: KeybindState = {
    pendingKeys: ["g"],
    count: 2,
    pendingOperator: null,
    charPending: null,
  };

  const nextState = expirePending(state);
  assert.deepEqual(nextState, initialState());
});

test("expirePending keeps char-pending state", () => {
  const state: KeybindState = {
    pendingKeys: [],
    count: 1,
    pendingOperator: null,
    charPending: {
      motion: motionAction("motion.find", true),
      key: "f",
      count: 1,
    },
  };

  const nextState = expirePending(state);
  assert.equal(nextState, state);
});
