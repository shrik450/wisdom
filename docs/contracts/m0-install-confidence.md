# M0 Contract: Install Confidence

## Scope

M0 delivers startup reliability and operational visibility for the backend and a
minimal server-rendered Web UI shell. This contract locks startup behavior,
migration failure policy, diagnostics APIs, and operations UI state handling for
Milestone M0 only.

## 1) API Routes + Payloads

### `GET /healthz`

- Purpose: quick liveness/readiness signal backed by runtime dependency checks.
- Status codes:
  - `200 OK` when no dependency check is in `error` state.
  - `503 Service Unavailable` when any dependency check is in `error` state.

Success/degraded payload schema:

```json
{
  "status": "ok|degraded",
  "checked_at": "RFC3339Nano timestamp",
  "checks": [
    {
      "name": "database|migrations|content_root",
      "status": "ok|warn|error",
      "message": "human-readable check detail",
      "checked_at": "RFC3339Nano timestamp"
    }
  ]
}
```

Failure payload schema (`503`):

```json
{
  "status": "error",
  "checked_at": "RFC3339Nano timestamp",
  "checks": [
    {
      "name": "database|migrations|content_root",
      "status": "ok|warn|error",
      "message": "human-readable check detail",
      "checked_at": "RFC3339Nano timestamp"
    }
  ],
  "error": {
    "code": "dependency_check_failed",
    "message": "one or more runtime checks failed",
    "next_steps": [
      "review /api/v1/ops/status for detailed checks",
      "verify configured paths and migration files",
      "check server logs and restart"
    ]
  }
}
```

### `GET /api/v1/ops/status`

- Purpose: stable runtime diagnostics snapshot for self-host operations.
- Status codes:
  - `200 OK` with structured diagnostics payload.

Payload schema:

```json
{
  "status": "ok|degraded|error",
  "startup_at": "RFC3339Nano timestamp",
  "uptime_seconds": 0,
  "checked_at": "RFC3339Nano timestamp",
  "checks": [
    {
      "name": "database|migrations|content_root",
      "status": "ok|warn|error",
      "message": "human-readable check detail",
      "checked_at": "RFC3339Nano timestamp"
    }
  ],
  "config": {
    "http_addr": ":8080",
    "data_dir": "/absolute/path",
    "db_path": "/absolute/path/wisdom.db",
    "content_root": "/absolute/path/content"
  }
}
```

### JSON Error Schema (contract for API errors in M0)

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "concise actionable message",
    "next_steps": ["optional follow-up steps"]
  }
}
```

## 2) Schema Delta + Migration Policy

- Schema delta for M0: **none required**. Existing migration
  `backend/migrations/0001_initial.sql` remains authoritative.
- Migration policy (startup hard gate):
  - Migration files are discovered from `backend/migrations` and sorted by
    numeric version prefix.
  - Startup fails fast on malformed migration filenames/version parsing errors.
  - Startup fails fast on duplicate migration version numbers.
  - Startup fails fast when DB has applied versions not present in local
    migration files (unknown state).
  - Startup fails fast when DB-recorded migration name mismatches file for same
    version (partial/corrupt state).
  - Each migration file is applied in a transaction, then recorded in
    `schema_migrations` in the same transaction.
  - Re-running startup is idempotent; already applied migrations are skipped
    after state validation.

## 3) Filesystem Side Effects

- Configured paths:
  - `WISDOM_HTTP_ADDR`
  - `WISDOM_DATA_DIR`
  - `WISDOM_DB_PATH`
  - `WISDOM_CONTENT_ROOT` (defaults to `<data_dir>/content`)
- Path handling: paths are trimmed, cleaned, and normalized to absolute paths at
  load time.
- Startup behavior before HTTP bind:
  - auto-create `data_dir` when missing.
  - auto-create `content_root` when missing.
  - auto-create parent directory for `db_path` when missing.
  - fail fast if `data_dir` or `content_root` exists but is not a directory.
  - fail fast if `db_path` exists and is a directory.
  - fail fast if DB open/ping or migrations fail.

## 4) Web UI Routes + States

Routes (server-rendered HTML):

- `GET /operations`
  - default state: `empty` (no diagnostics run yet).
  - with `?run=1`: executes diagnostics and renders `success` or `error`.
- `GET /operations/loading`
  - `loading` state with progressive enhancement redirect to
    `/operations?run=1`.
- Top-level nav routes present and stable:
  - `GET /library` (minimal explicit placeholder)
  - `GET /notes` (minimal explicit placeholder)
  - `GET /imports` (minimal explicit placeholder)
  - `GET /operations` (M0 operational page)

State coverage requirements for `/operations`:

- `loading`: running diagnostics transition page.
- `empty`: no diagnostics requested yet.
- `success`: diagnostics returned non-error overall status.
- `error`: diagnostics returned error overall status with next-step guidance.
- destructive `confirm`: not applicable in M0 (no destructive operation on this
  screen).

Error UX contract:

- Error state must include actionable next steps:
  - inspect `/api/v1/ops/status`
  - verify filesystem paths/migrations
  - check logs and restart.

## 5) Acceptance Checks

Required commands from `backend/`:

1. `just fmt`
2. `just lint`
3. `just test`
4. `just build`

Manual smoke checks:

1. Start backend successfully with defaults or explicit env overrides.
2. `curl /healthz` returns JSON and expected HTTP code.
3. `curl /api/v1/ops/status` returns diagnostics JSON contract.
4. Load `/operations`, `/operations/loading`, and `/operations?run=1` to confirm
   state rendering and nav.
5. Load `/library`, `/notes`, `/imports` placeholders and confirm non-deceptive
   milestone messaging.

## 6) Non-goals (Explicitly Out of Scope)

- Notes CRUD and notes editor flows.
- Sync push/pull APIs, cursor/tombstones inspector.
- Import pipelines and import job execution.
- Backlinks and annotation CRUD flows.
- Article/EPUB read/annotation features.
- External edit reconciliation and backup/restore hardening.
