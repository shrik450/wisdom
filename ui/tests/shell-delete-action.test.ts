import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteWorkspaceEntry,
  deleteConfirmationMessage,
} from "../src/components/shell-delete-action.ts";
import { type WorkspaceEntryInfo } from "../src/workspace-entry-info.ts";

function entry(info: Partial<WorkspaceEntryInfo>): WorkspaceEntryInfo {
  return {
    kind: "file",
    path: "",
    name: "",
    parentPath: "",
    extension: null,
    ...info,
  };
}

test("canDeleteWorkspaceEntry allows regular files and directories", () => {
  assert.equal(
    canDeleteWorkspaceEntry(
      entry({
        kind: "file",
        path: "notes/today.md",
        name: "today.md",
      }),
      "notes/today.md",
    ),
    true,
  );

  assert.equal(
    canDeleteWorkspaceEntry(
      entry({
        kind: "directory",
        path: "notes",
        name: "notes",
      }),
      "notes",
    ),
    true,
  );
});

test("canDeleteWorkspaceEntry rejects protected paths and non-existing entries", () => {
  assert.equal(
    canDeleteWorkspaceEntry(
      entry({
        kind: "directory",
        path: "",
      }),
      "",
    ),
    false,
  );

  assert.equal(
    canDeleteWorkspaceEntry(
      entry({
        kind: "directory",
        path: "ui",
        name: "ui",
      }),
      "ui",
    ),
    false,
  );

  assert.equal(
    canDeleteWorkspaceEntry(
      entry({
        kind: "missing",
        path: "notes/missing.md",
      }),
      "notes/missing.md",
    ),
    false,
  );
});

test("canDeleteWorkspaceEntry rejects stale entry data for another route", () => {
  assert.equal(
    canDeleteWorkspaceEntry(
      entry({
        kind: "file",
        path: "notes/old.md",
        name: "old.md",
      }),
      "notes/new.md",
    ),
    false,
  );
});

test("deleteConfirmationMessage includes the entry name", () => {
  const message = deleteConfirmationMessage(
    entry({
      kind: "file",
      path: "notes/today.md",
      name: "today.md",
    }),
  );

  assert.equal(message, 'Delete "today.md"? This cannot be undone.');
});
