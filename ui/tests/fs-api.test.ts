import assert from "node:assert/strict";
import test from "node:test";
import { readFileRange } from "../src/api/fs.ts";

test("readFileRange sends a Range header and parses the response", async () => {
  const previousFetch = globalThis.fetch;
  let seenRange: string | null = null;

  globalThis.fetch = (async (_input, init) => {
    seenRange = new Headers(init?.headers).get("Range");
    return new Response("tail", {
      status: 206,
      headers: {
        "Content-Range": "bytes 8-11/12",
        "Content-Length": "4",
      },
    });
  }) as typeof fetch;

  try {
    const result = await readFileRange("logs/output.log", { start: 8 });
    assert.equal(seenRange, "bytes=8-");
    assert.equal(result.text, "tail");
    assert.equal(result.status, 206);
    assert.equal(result.contentRange, "bytes 8-11/12");
    assert.equal(result.contentLength, 4);
    assert.equal(result.byteLength, 4);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("readFileRange supports suffix requests", async () => {
  const previousFetch = globalThis.fetch;
  let seenRange: string | null = null;

  globalThis.fetch = (async (_input, init) => {
    seenRange = new Headers(init?.headers).get("Range");
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    await readFileRange("logs/output.log", { suffixLength: 128 });
    assert.equal(seenRange, "bytes=-128");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
