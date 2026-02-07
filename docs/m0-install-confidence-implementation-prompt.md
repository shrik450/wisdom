# Milestone M0 Implementation Prompt — Install Confidence

You are implementing **M0: Install Confidence** for Wisdom (Backend + Web UI) in this repository.

## Goal

Deliver a clean, reliable startup + diagnostics baseline so a self-host user can:
1. run the server successfully,
2. verify core health quickly,
3. view key runtime diagnostics in a minimal Web UI status shell.

This work must satisfy the M0 definition in:
- `TODO.md`
- `docs/roadmap.md` (M0 section)
- `docs/architecture.md` (startup/migrations/security invariants)
- `docs/ui-guidelines.md`
- `docs/agent-review-checklist.md`

---

## Required reading (before coding)

Read and follow:
- `TODO.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/ui-guidelines.md`
- `docs/agent-review-checklist.md`
- `AGENTS.md`

Key constraints to honor:
- One milestone contract per PR.
- No cross-milestone refactors.
- No stubs/hardcoded shortcut behavior unless explicitly approved.
- No unresolved `TODO`/`FIXME` in changed implementation paths.
- Do **not** run UI tests unless explicitly requested.
- Backend validation must pass: `just fmt`, `just lint`, `just test`, `just build`.

---

## Current baseline (already present)

The repo already has a starter backend:
- `backend/cmd/wisdomd/main.go`
- `backend/internal/config/config.go`
- `backend/internal/store/sqlite/sqlite.go`
- `backend/internal/migrations/migrations.go`
- `backend/internal/server/router.go`
- `backend/migrations/0001_initial.sql`

Treat this as scaffold; extend it to fully satisfy M0.

---

## Phase 1 (required gate): Draft and lock the M0 contract

Create: `docs/contracts/m0-install-confidence.md`

Include these sections explicitly:

1. **API routes + payloads**
   - Exact routes, methods, status codes, response schema, error schema.
2. **Schema delta + migration policy**
   - Whether schema changes are needed for M0 (likely none/new migration optional only if necessary).
   - Startup behavior for unknown/partial migration state.
3. **Filesystem side effects**
   - Data dir, DB path, content root creation/validation rules.
   - Fail-fast vs auto-create behavior.
4. **Web UI routes + states**
   - Route list and required states (`loading`, `empty`, `success`, `error`, confirm if destructive action exists).
   - Error UX and next-step guidance.
5. **Acceptance checks**
   - Command-level and manual checks for M0 done criteria.
6. **Non-goals**
   - Explicitly exclude M1+ behavior (notes CRUD, sync APIs, imports, backlinks, etc.).

After writing the contract, output a concise summary and proceed with implementation aligned to it.

---

## Phase 2: Implement M0

### A) Startup guarantees + config

Implement startup behavior so server only starts listening after all required checks pass.

Required outcomes:
- Config supports and validates:
  - HTTP bind address
  - data directory
  - sqlite DB path
  - content root path (default under data dir unless overridden)
- Startup performs deterministic checks before binding HTTP:
  - path normalization/cleaning
  - ensure data/content directories exist with safe behavior
  - verify expected directory/file types
  - verify DB open/connectivity
  - run migrations
- If startup invariants fail, process exits non-zero with clear structured logs.

### B) Migration failure policy (contract lock for M0)

Enforce a strict startup migration policy aligned to architecture docs:
- Fail fast on unknown migration state (e.g., DB applied version not present in migration files).
- Fail fast on malformed migration file/version issues.
- Ensure deterministic ordering and idempotent re-run.
- Keep migration application transactional and reliable.

### C) Diagnostics API + health endpoint

Keep/add endpoints so users can verify health quickly and inspect runtime diagnostics.

Minimum expected routes:
- `GET /healthz`
  - quick liveness/readiness style signal
  - returns machine-readable JSON
  - `200` healthy, `503` when dependency check fails
- `GET /api/v1/ops/status` (or equivalent clearly named diagnostics endpoint)
  - returns runtime diagnostics (structured JSON), including at least:
    - overall status (`ok|degraded|error`)
    - key checks (db, migrations, content root)
    - relevant runtime/config snapshot (safe to expose in trusted local/self-host scope)
    - startup timestamp and/or uptime

Use explicit, stable payload fields and explicit errors.

### D) Minimal Web UI status shell (server-rendered)

Add M0 Web UI for operational confidence, using semantic HTML and accessibility baseline.

Requirements:
- Server-rendered HTML page for operations status (e.g., `/operations`).
- Stable top-level nav present: `Library`, `Notes`, `Imports`, `Operations`.
- Semantic landmarks and native controls only.
- Token-based CSS (semantic variables/classes; avoid hardcoded ad-hoc visual values when tokens exist).
- Required states for this screen:
  - `loading`
  - `empty`
  - `success`
  - `error`
- Actionable error messaging with next steps.
- Must remain functional without JS (progressive enhancement baseline).

If routes for non-M0 nav items are placeholders, keep them minimal, explicit, and non-deceptive.

### E) Tests

Add/extend tests for all M0-critical behavior:
- config loading/defaults/overrides
- migration ordering/idempotency/failure modes (unknown or invalid state)
- startup checks/fail-fast behavior
- health + diagnostics handler behavior
- operations page render/state coverage at minimum smoke level

Prefer focused unit/integration tests using temp dirs/DBs.

### F) Docs and developer UX

Update docs to reflect M0 runtime behavior:
- `backend/README.md` quickstart and diagnostics usage
- `.env.example` for any new config variables
- Any new contract/reference docs created for M0

Keep changes scoped; no opportunistic refactors.

---

## Validation commands (required before finishing)

Run from `backend/`:
1. `just fmt`
2. `just lint`
3. `just test`
4. `just build`

Also run a manual smoke check:
- start server
- call health endpoint
- call diagnostics endpoint
- load operations page and verify key states/routes

Do not run UI tests unless explicitly requested.

---

## Final output format

When done, return:
1. **Contract reference** (`docs/contracts/m0-install-confidence.md`) + brief lock summary.
2. **Changed files** grouped by backend, web UI, docs.
3. **Behavior summary** (startup policy, migration policy, diagnostics contract).
4. **Validation results** with command outcomes.
5. **M0 acceptance checklist** mapped to roadmap “Done when”.
6. **Any follow-up risks** (if any), with concrete mitigation.

If blocked, ask exactly one targeted question and include your recommended default.
