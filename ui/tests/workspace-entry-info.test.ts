import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/api/types.ts";
import { getWorkspaceEntryInfo } from "../src/workspace-entry-info.ts";

test("detects directory metadata from directory payload", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify([
        {
          name: "a.md",
          size: 12,
          modTime: new Date().toISOString(),
          isDir: false,
        },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("notes");
    assert.equal(info.kind, "directory");
    assert.equal(info.path, "notes");
    assert.equal(info.parentPath, "");
    assert.equal(info.extension, null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("detects file metadata from non-directory payload", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("# heading", { status: 200 });
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("notes/today.md");
    assert.equal(info.kind, "file");
    assert.equal(info.path, "notes/today.md");
    assert.equal(info.parentPath, "notes");
    assert.equal(info.extension, "md");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns missing entry metadata for 404", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("notes/missing.md");
    assert.equal(info.kind, "missing");
    assert.equal(info.path, "notes/missing.md");
    assert.equal(info.parentPath, "notes");
    assert.equal(info.extension, null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("throws ApiError for non-404 API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("forbidden", { status: 403 });
  }) as typeof fetch;

  try {
    await assert.rejects(async () => {
      await getWorkspaceEntryInfo("nope");
    }, ApiError);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
