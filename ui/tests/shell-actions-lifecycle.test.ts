import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  ShellActionsProvider,
  useShellActions,
  useShellResolvedActions,
} from "../src/components/shell-actions.tsx";

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
  useShellActions([
    {
      id,
      label,
      onSelect: () => {
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
  const resolvedActions = useShellResolvedActions();

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
    ShellActionsProvider,
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

async function renderWithAct(
  element: ReactNode,
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error("Expected renderer instance");
  }
  return renderer;
}

test("useShellActions updates do not churn registration order", async () => {
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

test("useShellActions unregisters on unmount", async () => {
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
