import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/api/types.ts";
import { getWorkspaceEntryInfo } from "../src/workspace-entry-info.ts";

test("detects directory from dirlist content type", async () => {
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
        headers: { "Content-Type": "application/vnd.wisdom.dirlist+json" },
      },
    );
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("notes");
    assert.equal(info.kind, "directory");
    assert.equal(info.path, "notes");
    assert.equal(info.parentPath, "");
    assert.equal(info.extension, null);
    assert.equal(info.contentType, null);
    assert.equal(info.size, null);
    assert.equal(info.lastModified, null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("classifies JSON file as file, not directory", async () => {
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
    const info = await getWorkspaceEntryInfo("data/entries.json");
    assert.equal(info.kind, "file");
    assert.equal(info.contentType, "application/json");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("detects file metadata from non-directory payload", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("# heading", {
      status: 200,
      headers: {
        "Content-Type": "text/markdown",
        "Content-Length": "9",
        "Last-Modified": "Wed, 19 Feb 2026 12:00:00 GMT",
      },
    });
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("notes/today.md");
    assert.equal(info.kind, "file");
    assert.equal(info.path, "notes/today.md");
    assert.equal(info.parentPath, "notes");
    assert.equal(info.extension, "md");
    assert.equal(info.contentType, "text/markdown");
    assert.equal(info.size, 9);
    assert.equal(info.lastModified, "Wed, 19 Feb 2026 12:00:00 GMT");
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
    assert.equal(info.contentType, null);
    assert.equal(info.size, null);
    assert.equal(info.lastModified, null);
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

test("captures Content-Type for file responses", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("body", {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("notes/readme.md");
    assert.equal(info.kind, "file");
    assert.equal(info.contentType, "text/markdown");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("captures Content-Type for binary file responses", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("fake-png-data", {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("images/photo.png");
    assert.equal(info.kind, "file");
    assert.equal(info.contentType, "image/png");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("contentType is null when no Content-Type header on file response", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(new ArrayBuffer(4), { status: 200 });
  }) as typeof fetch;

  try {
    const info = await getWorkspaceEntryInfo("data/blob");
    assert.equal(info.kind, "file");
    assert.equal(info.contentType, null);
    assert.equal(info.lastModified, null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
