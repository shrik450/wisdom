import assert from "node:assert/strict";
import test from "node:test";
import {
  canRunWorkspaceEntry,
  formatRunClockLabel,
  isRunDirectoryPath,
  isRunsDirectoryPath,
  parseRunRequestRecord,
  runIDFromPath,
  runStatusGlyph,
  sortRunSummaries,
  type RunSummary,
} from "../src/runs.ts";
import { type WorkspaceEntryInfo } from "../src/workspace-entry-info.ts";

function entry(
  overrides: Partial<WorkspaceEntryInfo> = {},
): WorkspaceEntryInfo {
  return {
    kind: "file",
    path: "script.sh",
    name: "script.sh",
    parentPath: "",
    extension: "sh",
    contentType: "text/x-shellscript",
    size: 12,
    lastModified: null,
    isExecutable: true,
    ...overrides,
  };
}

function summary(
  id: string,
  status: RunSummary["state"]["status"],
  createdAt: string,
): RunSummary {
  return {
    id,
    directoryName: id,
    directoryPath: `.wisdom/runs/${id}`,
    lastModified: createdAt,
    request: {
      id,
      path: `scripts/${id}.sh`,
      args: [],
      cwd: ".",
      trigger: "manual",
      createdAt,
    },
    state: {
      id,
      status,
      createdAt,
      startedAt: createdAt,
      finishedAt: status === "running" ? null : createdAt,
      exitCode: status === "succeeded" ? 0 : null,
      terminationSignal: null,
    },
  };
}

test("run path helpers match run directories", () => {
  assert.equal(isRunsDirectoryPath(".wisdom/runs"), true);
  assert.equal(isRunsDirectoryPath("notes"), false);
  assert.equal(isRunDirectoryPath(".wisdom/runs/run-1"), true);
  assert.equal(isRunDirectoryPath(".wisdom/runs"), false);
  assert.equal(runIDFromPath(".wisdom/runs/run-1"), "run-1");
});

test("canRunWorkspaceEntry requires an executable non-.wisdom file", () => {
  assert.equal(canRunWorkspaceEntry(entry(), "script.sh"), true);
  assert.equal(
    canRunWorkspaceEntry(entry({ isExecutable: false }), "script.sh"),
    false,
  );
  assert.equal(
    canRunWorkspaceEntry(entry({ path: ".wisdom/tool.sh" }), ".wisdom/tool.sh"),
    false,
  );
});

test("sortRunSummaries keeps active runs first and newest first within groups", () => {
  const sorted = sortRunSummaries([
    summary("done-old", "succeeded", "2026-03-28T10:00:00Z"),
    summary("active-new", "running", "2026-03-28T12:00:00Z"),
    summary("done-new", "failed", "2026-03-28T11:00:00Z"),
    summary("active-old", "pending", "2026-03-28T09:00:00Z"),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["active-new", "active-old", "done-new", "done-old"],
  );
});

test("run status helpers format labels", () => {
  assert.equal(runStatusGlyph("running"), ">>>");
  assert.equal(
    formatRunClockLabel(
      {
        id: "run-1",
        status: "running",
        createdAt: "2026-03-28T12:00:00Z",
        startedAt: "2026-03-28T12:00:00Z",
        finishedAt: null,
        exitCode: null,
        terminationSignal: null,
      },
      Date.parse("2026-03-28T12:00:12Z"),
    ),
    "running for 12s",
  );
});

test("parseRunRequestRecord rejects null args", () => {
  assert.throws(
    () =>
      parseRunRequestRecord({
        id: "run-1",
        path: "script.sh",
        args: null,
        cwd: ".",
        trigger: "manual",
        createdAt: "2026-03-28T12:00:00Z",
      }),
    /request\.args must be an array of strings/,
  );
});
