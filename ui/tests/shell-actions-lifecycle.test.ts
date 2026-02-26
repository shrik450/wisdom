import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  ActionRegistryProvider,
  useActions,
  useResolvedActions,
} from "../src/actions/action-registry.tsx";

const globalWithReactAct = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
globalWithReactAct.IS_REACT_ACT_ENVIRONMENT = true;

interface SnapshotAction {
  id: string;
  registrationOrder: number;
}

function Contributor({
  id,
  label,
  stamp,
}: {
  id: string;
  label: string;
  stamp: number;
}) {
  useActions([
    {
      kind: "command",
      id,
      label,
      onSelect: (count) => {
        void count;
        void stamp;
      },
    },
  ]);
  return null;
}

function SnapshotObserver({
  onSnapshot,
}: {
  onSnapshot: (actions: readonly SnapshotAction[]) => void;
}) {
  const resolvedActions = useResolvedActions();

  useEffect(() => {
    onSnapshot(
      resolvedActions.map((action) => {
        return {
          id: action.id,
          registrationOrder: action.registrationOrder,
        };
      }),
    );
  }, [onSnapshot, resolvedActions]);

  return null;
}

function Harness({
  includeFirst,
  stamp,
  onSnapshot,
}: {
  includeFirst: boolean;
  stamp: number;
  onSnapshot: (actions: readonly SnapshotAction[]) => void;
}) {
  return createElement(
    ActionRegistryProvider,
    null,
    includeFirst
      ? createElement(Contributor, {
          id: "first",
          label: "First",
          stamp,
        })
      : null,
    createElement(Contributor, {
      id: "second",
      label: "Second",
      stamp,
    }),
    createElement(SnapshotObserver, { onSnapshot }),
  );
}

async function renderWithAct(element: ReactNode): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error("Expected renderer instance");
  }
  return renderer;
}

test("useActions updates do not churn registration order", async () => {
  const snapshots: SnapshotAction[][] = [];

  const renderer = await renderWithAct(
    createElement(Harness, {
      includeFirst: true,
      stamp: 0,
      onSnapshot: (actions) => {
        snapshots.push([...actions]);
        if (snapshots.length > 20) {
          throw new Error("unexpected rerender loop");
        }
      },
    }),
  );

  for (let stamp = 1; stamp <= 3; stamp += 1) {
    await act(async () => {
      renderer.update(
        createElement(Harness, {
          includeFirst: true,
          stamp,
          onSnapshot: (actions) => {
            snapshots.push([...actions]);
            if (snapshots.length > 20) {
              throw new Error("unexpected rerender loop");
            }
          },
        }),
      );
    });
  }

  const latest = snapshots[snapshots.length - 1];
  assert.deepEqual(
    latest.map((action) => action.id),
    ["first", "second"],
  );
  assert.deepEqual(
    latest.map((action) => action.registrationOrder),
    [0, 1],
  );

  await act(async () => {
    renderer.unmount();
  });
});

function KindSwitchContributor({ kind }: { kind: "command" | "motion" }) {
  useActions(
    kind === "command"
      ? [
          {
            kind: "command",
            id: "switch",
            label: "Switch",
            onSelect: (count) => {
              void count;
            },
          },
        ]
      : [
          {
            kind: "motion",
            id: "switch",
            label: "Switch",
            range: (count, char) => {
              void count;
              void char;
              return { from: 0, to: 0 };
            },
          },
        ],
  );
  return null;
}

test("useActions throws when an action ID changes kind", async () => {
  const renderer = await renderWithAct(
    createElement(
      ActionRegistryProvider,
      null,
      createElement(KindSwitchContributor, { kind: "command" }),
    ),
  );

  await assert.rejects(async () => {
    await act(async () => {
      renderer.update(
        createElement(
          ActionRegistryProvider,
          null,
          createElement(KindSwitchContributor, { kind: "motion" }),
        ),
      );
    });
  }, /changed kind/);

  await act(async () => {
    renderer.unmount();
  });
});

function CommandActionContributor({
  onSelect,
}: {
  onSelect: (count: number | null) => void;
}) {
  useActions([
    {
      kind: "command",
      id: "cmd",
      label: "Command",
      onSelect,
    },
  ]);
  return null;
}

function CommandActionCapture({
  onAction,
}: {
  onAction: (action: (count: number | null) => void) => void;
}) {
  const resolvedActions = useResolvedActions();

  useEffect(() => {
    const action = resolvedActions.find((resolvedAction) => {
      return resolvedAction.id === "cmd";
    });
    if (!action || action.kind !== "command") {
      return;
    }
    onAction(action.onSelect);
  }, [onAction, resolvedActions]);

  return null;
}

test("command wrapper forwards null count", async () => {
  let received: number | null | undefined;
  let invoke: ((count: number | null) => void) | null = null;

  const renderer = await renderWithAct(
    createElement(
      ActionRegistryProvider,
      null,
      createElement(CommandActionContributor, {
        onSelect: (count) => {
          received = count;
        },
      }),
      createElement(CommandActionCapture, {
        onAction: (action) => {
          invoke = action;
        },
      }),
    ),
  );

  assert.ok(invoke);
  invoke(null);
  assert.equal(received, null);

  await act(async () => {
    renderer.unmount();
  });
});

test("useActions unregisters on unmount", async () => {
  let latest: readonly SnapshotAction[] = [];

  const renderer = await renderWithAct(
    createElement(Harness, {
      includeFirst: true,
      stamp: 0,
      onSnapshot: (actions) => {
        latest = actions;
      },
    }),
  );

  assert.deepEqual(
    latest.map((action) => action.id),
    ["first", "second"],
  );

  await act(async () => {
    renderer.update(
      createElement(Harness, {
        includeFirst: false,
        stamp: 1,
        onSnapshot: (actions) => {
          latest = actions;
        },
      }),
    );
  });

  assert.deepEqual(
    latest.map((action) => action.id),
    ["second"],
  );

  await act(async () => {
    renderer.unmount();
  });
});
