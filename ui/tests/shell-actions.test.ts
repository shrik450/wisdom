import assert from "node:assert/strict";
import test from "node:test";
import { partitionShellActions } from "../src/components/shell-action-layout.ts";
import {
  createShellActionRegistryState,
  removeShellActionContributor,
  resolveShellActions,
  type ShellActionContributor,
  upsertShellActionContributor,
} from "../src/components/shell-actions-model.ts";

const noop = () => {};

function resolveFromContributors(
  contributors: readonly ShellActionContributor[],
) {
  return resolveShellActions(contributors);
}

test("resolveShellActions throws on duplicate action IDs", () => {
  const contributors: ShellActionContributor[] = [
    {
      contributorId: 1,
      registrationOrder: 0,
      actions: [
        {
          id: "open",
          label: "Open",
          onSelect: noop,
        },
      ],
    },
    {
      contributorId: 2,
      registrationOrder: 1,
      actions: [
        {
          id: "open",
          label: "Open Again",
          onSelect: noop,
        },
      ],
    },
  ];

  assert.throws(
    () => resolveFromContributors(contributors),
    /Duplicate shell action id "open"/,
  );
});

test("upsertShellActionContributor keeps registration order on updates", () => {
  const initial = createShellActionRegistryState();
  const first = upsertShellActionContributor(initial, 11, [
    {
      id: "first",
      label: "First",
      onSelect: noop,
    },
  ]);
  const second = upsertShellActionContributor(first, 22, [
    {
      id: "second",
      label: "Second",
      onSelect: noop,
    },
  ]);
  const updated = upsertShellActionContributor(second, 11, [
    {
      id: "first",
      label: "First Updated",
      onSelect: noop,
    },
  ]);

  assert.deepEqual(
    updated.contributors.map((contributor) => {
      return [contributor.contributorId, contributor.registrationOrder];
    }),
    [
      [11, 0],
      [22, 1],
    ],
  );
});

test("upsertShellActionContributor returns same state for equivalent actions", () => {
  const initial = createShellActionRegistryState();
  const withContributor = upsertShellActionContributor(initial, 11, [
    {
      id: "first",
      label: "First",
      onSelect: noop,
      priority: 1,
    },
  ]);

  const equivalent = upsertShellActionContributor(withContributor, 11, [
    {
      id: "first",
      label: "First",
      onSelect: noop,
      priority: 1,
    },
  ]);

  assert.equal(equivalent, withContributor);
});

test("removeShellActionContributor removes contributor and is idempotent", () => {
  const initial = createShellActionRegistryState();
  const withContributor = upsertShellActionContributor(initial, 11, [
    {
      id: "first",
      label: "First",
      onSelect: noop,
    },
  ]);

  const removed = removeShellActionContributor(withContributor, 11);
  assert.deepEqual(removed.contributors, []);

  const removedAgain = removeShellActionContributor(removed, 11);
  assert.equal(removedAgain, removed);
});

test("resolveShellActions orders by priority then registration order", () => {
  const resolved = resolveFromContributors([
    {
      contributorId: 10,
      registrationOrder: 1,
      actions: [
        {
          id: "global-low",
          label: "Global Low",
          onSelect: noop,
          priority: 2,
        },
      ],
    },
    {
      contributorId: 20,
      registrationOrder: 0,
      actions: [
        {
          id: "view-high",
          label: "View High",
          onSelect: noop,
          priority: 8,
        },
        {
          id: "view-mid",
          label: "View Mid",
          onSelect: noop,
          priority: 2,
        },
      ],
    },
  ]);

  assert.deepEqual(
    resolved.map((action) => action.id),
    ["view-high", "view-mid", "global-low"],
  );
});

test("partitionShellActions keeps overflow-only actions out of inline slot", () => {
  const actions = resolveFromContributors([
    {
      contributorId: 1,
      registrationOrder: 0,
      actions: [
        {
          id: "must-overflow",
          label: "Must Overflow",
          onSelect: noop,
          priority: 10,
          overflowOnly: true,
        },
        {
          id: "inline-a",
          label: "Inline A",
          onSelect: noop,
          priority: 5,
        },
        {
          id: "inline-b",
          label: "Inline B",
          onSelect: noop,
          priority: 4,
        },
      ],
    },
  ]);

  const layout = partitionShellActions({
    actions,
    containerWidth: 1000,
    buttonWidths: {},
    overflowButtonWidth: 90,
    gapPx: 8,
    mobile: false,
  });

  assert.deepEqual(
    layout.inlineActions.map((action) => action.id),
    ["inline-a", "inline-b"],
  );
  assert.deepEqual(
    layout.overflowActions.map((action) => action.id),
    ["must-overflow"],
  );
});

test("partitionShellActions shows one inline action on mobile", () => {
  const actions = resolveFromContributors([
    {
      contributorId: 1,
      registrationOrder: 0,
      actions: [
        {
          id: "top-action",
          label: "Top Action",
          onSelect: noop,
          priority: 10,
        },
        {
          id: "later-action",
          label: "Later Action",
          onSelect: noop,
          priority: 8,
        },
      ],
    },
  ]);

  const layout = partitionShellActions({
    actions,
    containerWidth: 320,
    buttonWidths: {},
    overflowButtonWidth: 90,
    gapPx: 8,
    mobile: true,
  });

  assert.deepEqual(
    layout.inlineActions.map((action) => action.id),
    ["top-action"],
  );
  assert.deepEqual(
    layout.overflowActions.map((action) => action.id),
    ["later-action"],
  );
});

test("partitionShellActions overflows remaining actions when width is limited", () => {
  const actions = resolveFromContributors([
    {
      contributorId: 1,
      registrationOrder: 0,
      actions: [
        { id: "a", label: "A", onSelect: noop, priority: 5 },
        { id: "b", label: "B", onSelect: noop, priority: 4 },
        { id: "c", label: "C", onSelect: noop, priority: 3 },
      ],
    },
  ]);

  const layout = partitionShellActions({
    actions,
    containerWidth: 220,
    buttonWidths: {
      a: 90,
      b: 90,
      c: 90,
    },
    overflowButtonWidth: 70,
    gapPx: 8,
    mobile: false,
  });

  assert.deepEqual(
    layout.inlineActions.map((action) => action.id),
    ["a"],
  );
  assert.deepEqual(
    layout.overflowActions.map((action) => action.id),
    ["b", "c"],
  );
});
