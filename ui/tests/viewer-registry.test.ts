import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearViewerRegistry,
  registerViewer,
  resolveAllViewers,
  resolveViewer,
  type ViewerProps,
} from "../src/viewers/registry.ts";
import { type WorkspaceEntryInfo } from "../src/workspace-entry-info.ts";

function entry(
  overrides: Partial<WorkspaceEntryInfo> = {},
): WorkspaceEntryInfo {
  return {
    kind: "file",
    path: "test.txt",
    name: "test.txt",
    parentPath: "",
    extension: "txt",
    contentType: "text/plain",
    ...overrides,
  };
}

function stubComponent(label: string) {
  function Viewer(props: ViewerProps) {
    void props;
    return null;
  }
  Viewer.displayName = label;
  return Viewer;
}

afterEach(() => {
  clearViewerRegistry();
});

test("resolveViewer returns null when no routes are registered", () => {
  assert.equal(resolveViewer(entry()), null);
});

test("resolveViewer returns the only matching route", () => {
  const component = stubComponent("A");
  registerViewer({
    name: "A",
    match: () => true,
    priority: 0,
    component,
  });

  const result = resolveViewer(entry());
  assert.equal(result?.component, component);
});

test("resolveViewer returns highest priority match", () => {
  const low = stubComponent("Low");
  const high = stubComponent("High");

  registerViewer({
    name: "Low",
    match: () => true,
    priority: 0,
    component: low,
  });
  registerViewer({
    name: "High",
    match: () => true,
    priority: 10,
    component: high,
  });

  const result = resolveViewer(entry());
  assert.equal(result?.component, high);
});

test("resolveViewer breaks ties by registration order", () => {
  const first = stubComponent("First");
  const second = stubComponent("Second");

  registerViewer({
    name: "First",
    match: () => true,
    priority: 5,
    component: first,
  });
  registerViewer({
    name: "Second",
    match: () => true,
    priority: 5,
    component: second,
  });

  const result = resolveViewer(entry());
  assert.equal(result?.component, first);
});

test("resolveViewer skips non-matching routes", () => {
  const never = stubComponent("Never");
  const always = stubComponent("Always");

  registerViewer({
    name: "Never",
    match: () => false,
    priority: 100,
    component: never,
  });
  registerViewer({
    name: "Always",
    match: () => true,
    priority: 0,
    component: always,
  });

  const result = resolveViewer(entry());
  assert.equal(result?.component, always);
});

test("resolveViewer passes entry to match predicate", () => {
  const component = stubComponent("DirOnly");
  registerViewer({
    name: "DirOnly",
    match: (e) => e.kind === "directory",
    priority: 0,
    component,
  });

  assert.equal(resolveViewer(entry({ kind: "file" })), null);
  assert.equal(
    resolveViewer(entry({ kind: "directory" }))?.component,
    component,
  );
});

test("resolveAllViewers returns empty array when nothing matches", () => {
  registerViewer({
    name: "Never",
    match: () => false,
    priority: 0,
    component: stubComponent("Never"),
  });

  assert.deepEqual(resolveAllViewers(entry()), []);
});

test("resolveAllViewers returns all matches sorted by priority", () => {
  const a = stubComponent("A");
  const b = stubComponent("B");

  registerViewer({ name: "A", match: () => true, priority: 5, component: a });
  registerViewer({ name: "B", match: () => true, priority: 10, component: b });

  const results = resolveAllViewers(entry());
  assert.equal(results.length, 2);
  assert.equal(results[0].component, b);
  assert.equal(results[1].component, a);
});

test("resolveAllViewers dedupes by component reference", () => {
  const shared = stubComponent("Shared");

  registerViewer({
    name: "Shared",
    match: () => true,
    priority: 10,
    component: shared,
  });
  registerViewer({
    name: "Shared",
    match: () => true,
    priority: 5,
    component: shared,
  });

  const results = resolveAllViewers(entry());
  assert.equal(results.length, 1);
  assert.equal(results[0].component, shared);
});

test("resolveAllViewers keeps first route when deduping same component", () => {
  const shared = stubComponent("Shared");

  registerViewer({
    name: "Shared High",
    match: () => true,
    priority: 20,
    component: shared,
  });
  registerViewer({
    name: "Shared Low",
    match: () => true,
    priority: 1,
    component: shared,
  });

  const results = resolveAllViewers(entry());
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Shared High");
  assert.equal(results[0].priority, 20);
});
