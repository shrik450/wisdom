import assert from "node:assert/strict";
import test from "node:test";
import {
  filterCommandActions,
  type ResolvedCommandAction,
} from "../src/components/command-palette-filter.ts";

function commandAction(
  id: string,
  label: string,
  aliases?: string[],
): ResolvedCommandAction {
  return {
    kind: "command",
    id,
    label,
    aliases,
    onSelect: (count) => {
      void count;
    },
    priority: 0,
    registrationOrder: 0,
    actionOrder: 0,
  };
}

test("label substring filtering still works", () => {
  const actions: ResolvedCommandAction[] = [
    commandAction("open", "Open File"),
    commandAction("close", "Close File"),
    commandAction("copy", "Copy Path"),
  ];

  const filtered = filterCommandActions(actions, "op");
  assert.deepEqual(
    filtered.map((action) => action.id),
    ["open", "copy"],
  );
});

test("exact alias match is promoted to top", () => {
  const actions: ResolvedCommandAction[] = [
    commandAction("write-notes", "Write Notes"),
    commandAction("save", "Save", ["w"]),
  ];

  const filtered = filterCommandActions(actions, "w");
  assert.deepEqual(
    filtered.map((action) => action.id),
    ["save", "write-notes"],
  );
});

test("alias matching is case-sensitive", () => {
  const actions: ResolvedCommandAction[] = [
    commandAction("lower", "Lower", ["x"]),
    commandAction("upper", "Upper", ["X"]),
  ];

  const filteredLower = filterCommandActions(actions, "x");
  assert.deepEqual(
    filteredLower.map((action) => action.id),
    ["lower"],
  );

  const filteredUpper = filterCommandActions(actions, "X");
  assert.deepEqual(
    filteredUpper.map((action) => action.id),
    ["upper"],
  );
});

test("alias collisions preserve deterministic input order", () => {
  const actions: ResolvedCommandAction[] = [
    commandAction("first", "First", ["w"]),
    commandAction("second", "Second", ["w"]),
    commandAction("label-only", "Write Through"),
  ];

  const filtered = filterCommandActions(actions, "w");
  assert.deepEqual(
    filtered.map((action) => action.id),
    ["first", "second", "label-only"],
  );
});
