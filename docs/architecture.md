# Wisdom Architecture (v0.1)

## Goals

- Keep Wisdom simple to self-host and operate.
- Treat user files as the primary data they own and manage.
- Support one reliable loop: import, read, annotate, write notes, sync.
- Build around books and web articles first.
- Build protocols and interfaces first, then add format-specific behavior
  incrementally.

## Stack

- Backend: Go with `net/http` (stdlib server), SQLite, local filesystem.
- Web UI: server-rendered HTML templates plus HTMX.
- iPad app: Swift + SwiftUI + GRDB (local SQLite).
- Auth: HTTP Basic Auth at reverse proxy layer.

## Core Principles

1. Everything is a document.
2. An annotation is a backlink to a document segment with attached note text.
3. Filesystem is the source of truth for content and hierarchy.
4. SQLite stores metadata, indexes, and sync state as a derived view.

## Document Model

Document "type" should only exist to drive system behavior. It should not model
user intent like note vs journal.

- `role`: `primary` or `shadow`
  - `primary` is normal user content (book/article/note).
  - `shadow` is companion annotation content for a source document.
- `origin`: `manual` or `import`
  - `manual` is user-created content.
  - `import` is content created by an ingestion pipeline.
- `adapter`: identifies segment behavior and parsing strategy
  (for example `markdown`, `epub`, `web_article`).
- `doc_id`: immutable UUIDv7 for every document.

Notes and journals are the same model (`primary`, usually `manual`, often
`markdown`). Their difference is path, tags, and user convention.

## Storage Layout

Use filesystem paths that map closely to user-visible hierarchy.

- Content files live in a root content directory.
- Filenames are meaningful and user-controlled.
- The database stores each document's stable `doc_id` and current relative path.
- Rename/move updates path metadata without changing `doc_id`.
- Paths are normalized and stored as UNIX-style relative paths.

Example:

```text
data/
  content/
    Reading/Deep Work.epub
    Articles/Some Essay.html
    Articles/Some Essay.md
    Notes/2026-02-06.md
```

## Source of Truth and Reconciliation

- Filesystem wins for document bytes and relative paths.
- SQLite is rebuilt/reconciled from filesystem state when mismatches are found.
- External edits (outside Wisdom) are ingested via scanner/watcher path.
- Reconciliation emits sync events so clients converge to filesystem state.

## Write Protocol

For app-originated writes, apply changes in this order:

1. Write content to filesystem (atomic temp-file + rename).
2. Upsert derived metadata/index rows in SQLite.
3. Append `sync_events` row.

If any step fails, mark document as needing reconciliation and retry via recovery
job. Recovery always re-derives DB state from filesystem.

## Core Entities

- `documents`: identity, path, role, origin, adapter, metadata, timestamps.
- `backlinks`: directed links between docs/segments; optional content payload on
  each row.
- `sync_events`: ordered change feed for pull-based sync.
- `tombstones`: deletion records retained for sync correctness.

There is no separate `annotations` entity. An annotation is a backlink with
content attached.

Tombstones are garbage-collected after a retention window once they are no
longer needed for active client convergence.

## Segment Adapters

Each adapter defines how to address and index segments for a document format.

- Store canonical segment references as JSON text (for example
  `target_segment_json`).
- Maintain `segments_index` for fast lookup/filtering.
- Adapters validate and normalize segment refs.
- Segment refs include adapter + version for forward compatibility.
- Concrete ref JSON shapes are defined per adapter when that adapter is
  implemented.

Go shape (illustrative):

```go
type SegmentAdapter interface {
    Name() string
    BuildIndex(ctx context.Context, doc Document) ([]SegmentIndexRow, error)
    NormalizeRef(raw json.RawMessage) (json.RawMessage, error)
}
```

Initial adapters:

- `epub`: chapter/section and text range addressing.
- `web_article`: stable selectors/text ranges for archived article content.
- `markdown`: heading/range addressing for notes and shadow docs.

## Sync Contract

Server is the source of sync truth. Clients keep local state and reconcile.

- `POST /api/v1/sync/push`: send batched upserts/deletes from device.
- `GET /api/v1/sync/pull?cursor=<seq>&limit=<n>`: receive ordered changes.
- Cursor uses monotonic sequence from `sync_events`.
- Conflict rule: last-write-wins using server-assigned timestamps.
- Client timestamps are accepted as metadata but not conflict authority.
- Deletes are represented as tombstones and included in pull responses.

## Ingestion Pipelines (v0.1)

### EPUB import

- Ingest EPUB file into content tree.
- Extract metadata (title/author) into SQLite.
- Build segment index for chapter/section navigation and backlink targets.

### URL import

- Fetch article HTML and normalize content.
- Download referenced images and rewrite links to local archived copies.
- Store archived content as single-file HTML with assets inlined.
- Optionally derive normalized Markdown companion for reading/edit flow.
- Build segment index for stable annotation/backlink targets.

## External File Ingestion Path

- Run a startup scan and periodic scan of content roots.
- Detect create/update/rename/delete based on path + hash + mtime heuristics.
- Re-index changed docs and emit corresponding sync events.
- Treat filesystem state as canonical when conflicts are detected.

## Security Boundary

- Reverse proxy enforces HTTP Basic Auth.
- App does not perform user/session modeling in v0.1.
- App is expected to run behind a trusted proxy boundary.

## Web UI Scope

- Library browsing over filesystem-backed docs.
- Document detail view (metadata, backlinks, annotations).
- Basic operational pages (import status, sync status).
- Derived views (for example reading list) are query views over metadata.

## Backup and Restore

- Backup includes both SQLite database and content filesystem tree.
- Restore requires both to preserve link/index/sync integrity.
- Prefer consistent snapshots (SQLite backup API plus filesystem snapshot).

## Schema Migrations

- Use versioned `.sql` migration files.
- Track applied migrations in a `schema_migrations` table.
- Startup fails fast on unknown/partial migration state.

## Deferred Beyond v0.1

- RSS ingestion.
- Search and indexing UX.
- AI features (server-side only when introduced).
- Additional media types beyond EPUB and URL-based articles.
