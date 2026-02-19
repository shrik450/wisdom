import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBreadcrumbs,
  buildFsApiUrl,
  buildWorkspaceHref,
  decodeWorkspaceRoutePath,
  encodeWorkspacePath,
  isSameOrAncestorPath,
  normalizeWorkspacePath,
} from "../src/path-utils.ts";

const roundtripCases = [
  "notes/hello world.md",
  "docs/chapter #1?/50% done.txt",
  "reading/研究/mañana.md",
  "/nested/path///file?.md/",
];

test("route encoding and decoding roundtrips reserved characters", () => {
  for (const input of roundtripCases) {
    const encoded = encodeWorkspacePath(input);
    const decoded = decodeWorkspaceRoutePath(encoded);
    const normalized = normalizeWorkspacePath(input);

    assert.equal(decoded, normalized, input);
  }
});

test("decode route path keeps malformed escape sequences as-is", () => {
  assert.equal(
    decodeWorkspaceRoutePath("notes/bad%2-escape.md"),
    "notes/bad%2-escape.md",
  );
});

test("builds breadcrumb hrefs with encoded segments", () => {
  const breadcrumbs = buildBreadcrumbs("folder/hello world#/file?.md");

  assert.deepEqual(
    breadcrumbs.map((crumb) => ({
      name: crumb.name,
      href: crumb.href,
      isCurrent: crumb.isCurrent,
    })),
    [
      { name: "folder", href: "/ws/folder/", isCurrent: false },
      {
        name: "hello world#",
        href: "/ws/folder/hello%20world%23/",
        isCurrent: false,
      },
      {
        name: "file?.md",
        href: "/ws/folder/hello%20world%23/file%3F.md/",
        isCurrent: true,
      },
    ],
  );
});

test("builds workspace hrefs for encoded route segments", () => {
  assert.equal(buildWorkspaceHref(""), "/ws/");
  assert.equal(
    buildWorkspaceHref("notes/chapter #1?.md"),
    "/ws/notes/chapter%20%231%3F.md/",
  );
  assert.equal(
    buildWorkspaceHref("/notes/100% done.md/"),
    "/ws/notes/100%25%20done.md/",
  );
});

test("builds encoded API fs paths", () => {
  assert.equal(buildFsApiUrl(""), "/api/fs/");
  assert.equal(buildFsApiUrl("/"), "/api/fs/");
  assert.equal(
    buildFsApiUrl("notes/chapter #1?.md"),
    "/api/fs/notes/chapter%20%231%3F.md",
  );
  assert.equal(
    buildFsApiUrl("notes/100% done.md"),
    "/api/fs/notes/100%25%20done.md",
  );
});

test("isSameOrAncestorPath handles exact, ancestor and collision cases", () => {
  const cases = [
    { path: "ui", target: "ui/src/components", expected: true },
    { path: "ui/src", target: "ui/src/components", expected: true },
    { path: "ui/src/components", target: "ui/src/components", expected: true },
    { path: "ui/src/components", target: "ui/src", expected: false },
    { path: "ui/src/component", target: "ui/src/components", expected: false },
    {
      path: "ui/src/components-legacy",
      target: "ui/src/components",
      expected: false,
    },
  ];

  for (const item of cases) {
    assert.equal(
      isSameOrAncestorPath(item.path, item.target),
      item.expected,
      `${item.path} -> ${item.target}`,
    );
  }
});
