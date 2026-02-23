# Guidance for LLMs

## What this project is about

@README.md

Make yourself familiar with the README and understand it fully, especially the
goals and non-goals. For more information on specific components of the project
and their responsibilities, read docs/architecture.md. Whenver you are touching
a component or advising on it, you must read the relevant files in @docs/
first.

## Agent roles

Your role in this project is narrow:

1. You may advise the human user on approaches;
2. You may write code when explicitly authorized to;
3. All decisions about the project must be made by the human, and if you need
   to make a decision when writing code, you must seek the human's permission;
4. You will often have to review code, but when doing so, keep the scope of the
   project in mind.
5. You will never make architecture decisions.

## Reviewing code

If you are reviewing code, also consider:

1. Shortcuts: Does the implementation take shortcuts that are not justified by
   the project goals or scope? Are important methods stubbed or marked with
   `TODO` when that is the whole point of the change?
2. Quality: Is the code well-written, clean and maintainable? Does it follow the
   style notes below?
3. Taste: Is the code well-designed and elegant? Does it show good judgment in
   how to structure things? Is it idiomatic for the language? On the flip side,
   is something odd or poorly considered?
4. Security: Given the constraints that are spelled out for the project, is the
   code insecure?
5. Simplicity: Is this the simplest solution to the problem? Is the code
   needlessly complex or long? Does it add an abstraction that wasn't required,
   or fails to use an existing one? Was this _required_?

## Style notes

### All languages

Do not add unnecessary comments. Comment sparingly and only when absolutely
required to explain the _why_ of code. Likewise, do not add doc comments for
trivial functions, classes or modules. If an element is self-documenting via
names and types, do not add more docs for no reason.

Name elements considering the full state of things. Never name something based
on the state of something else - a class named `Frobnicatorv2` is always a
terrible idea.

#### Project commands

Prefer running repo tasks via `just` from the repo root (not `go`/`npm` directly), unless you have a specific reason to bypass the wrappers.

Use these recipes by default:

- `just test` (server + UI tests)
- `just check` (CI-style checks: server `vet`, formatting checks, UI lint)
- `just fmt` / `just fmt-check`
- `just lint`
- `just tidy`
- `just build` / `just run` / `just dev`
- `just ui-install` when UI deps are needed

### Testing - All Languages

Read @docs/testing.md fully when testing - this applies to all languages.

### Go

Write clean, simple Go. Prefer the standard library whenver possible, and if
not possible, suggest dependencies to the user. Under no circumstances are you
allowed to add a depdndency without explicit user authorization to do so.

Code must be tested using the standard testing features. Prefer integration,
"black box" style tests over the public API. Never use internal details when
testing.

### HTML, CSS, TypeScript, React

Use semantic HTML elements as far as possible. For example, prefer `<main>`,
`<article>` and aside over `<div>` soup.

This project uses Tailwind. Use standard tailwind best practices: define
components to encapsulate shared styles.

Component extraction rule:

1. Extract a UI component only when both are true:
   - It is semantically reusable (the "name test": there is an obvious stable name for it).
   - It is used in 2 or more places.
2. If styles/markup are single-use and readable, keep them inline.
3. Do not create one-off wrapper components just to avoid a className string.
4. Keep shell-local components in the same file and unexported; only move/export
   when reused elsewhere.

In TypeScript, avoid `any` or `object` at all costs. Type things with the best
known type. If a types starts to get gnarly, consider if that function or
interface should be refactored to allow types to be simpler instead. Do not
reach for complex type definitions unless expressly allowed. An `as <type>` is
almost always a code smell and should be avoided. If you *must* use it, explain
why in a comment. If you notice an `as <type>` in review, flag it asnd ask for
an explanation.

When writing CSS, consider that this isn't a mass appeal, "normal" site. You
don't have to design for the median.

## Framework Reference

When working on the UI or backend, be aware of these existing framework
features. Read the linked files before building on or modifying them.

### Backend

- **Workspace abstraction:** `internal/workspace/workspace.go` — sandboxed filesystem access, path validation, atomic writes via `WriteStream`.
- **Filesystem API:** `internal/api/fs.go` — RESTful CRUD over workspace paths (GET/PUT/DELETE/PATCH). Protected paths (`"."`, `"ui"`) require `force: true`.
- **Fuzzy search:** `internal/api/fuzzymatch.go` + `search.go` — subsequence matching with scoring, exposed at `/api/search/paths`.
- **Middleware:** `internal/middleware/` — request logging and workspace context injection, applied in `cmd/wisdom/main.go`.
- **UI builder:** `internal/ui/` — esbuild watch/build integration, SPA-aware file serving with `index.html` fallback.

### Frontend

- **Actions framework:** `ui/src/actions/` — priority-based action registry. Register with `useActions()`, consume with `useResolvedActions()`. Higher priority number = shown first.
- **Viewer framework:** `ui/src/viewers/registry.ts` — predicate + priority viewer resolution. Register via `registerViewer()` and add the import to `viewers/index.ts`. Higher priority wins; `stat-viewer` is the fallback at priority -1000.
- **Command palette:** `ui/src/components/command-palette.tsx` — file search (default) and command mode (`>` prefix).
- **Shell / layout:** `ui/src/components/shell.tsx` + `shell-state.ts` + `theme.css` — CSS Grid layout, fullscreen mode, responsive sidebar drawer. State managed by reducer.
- **Filesystem hooks:** `ui/src/hooks/use-fs.ts` — `useDirectoryListing`, `useFileContent`, built on a generic `useAsync` hook.
- **Entry info:** `ui/src/workspace-entry-info.ts` + `ui/src/hooks/use-workspace-entry-info.tsx` — HEAD request to infer entry kind from Content-Type header. Directories use MIME type `application/vnd.wisdom.dirlist+json`.
- **Mutation notification:** `ui/src/hooks/use-workspace-mutated.tsx` — writers call `useWorkspaceMutated()`, readers subscribe via `useWorkspaceRefreshToken()`.
- **Path utilities:** `ui/src/path-utils.ts` — normalize, encode/decode, build hrefs (always trailing slash), build breadcrumbs.

## Working Notes

### UI

Very frequently, a UI change session goes like:

1. I request a change.
2. You implement the change, but that breaks something else.
3. I tell you about the breakage, you fix that but something _else_ breaks too.
4. Repeat.

This is awful, and you must do everything you can to prevent this from
happening. Here are a few approaches you can take:

1. Think globally, not locally. Do not make changes just to fix an immediate
   issue: consider the code design and structure and fix things via a root
   cause. Whenever you make a change, take a global view of it too, stepping out
   of the local context (like the parent div or component) into the full tree to
   understand if this works. You can often figure out if something broke by
   looking at the final state of the file again.

2. Use a Python script using Playwright with inline script metadata and run it
   with uv. Take plenty of screenshots and analyze them in detail for both
   aesthetics and functionality. Write thorough scripts that test functionality
   and visuals: multiple view ports, multiple states, different cases a user could
   see this UI in etc. This should mean that if your change introduces a
   regression elsewhere, you should catch that immediately. If you find yourself
   testing something often, make that a UI test! When you're done with a test,
   clean up any temporary scripts or turn them into proper UI tests.

3. Don't stop at "this works". Think about if this is **good**. If there are
   clear usability issues and bugs, don't assume your work is done just because
   I haven't flagged them.

4. If you find yourself just adding magic-numbered utility classes to make
   things work, you're probably doing something wrong. Do not be afraid to
   rethink your approach and layout from scratch; you'll often find that it's
   easier to re-write a component or a view to get the desired effect instead of
   jiggling utility classes around.
