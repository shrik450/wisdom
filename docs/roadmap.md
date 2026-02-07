# Wisdom Roadmap (Backend + Web UI) to v0.1

## Scope

This roadmap covers Backend and Web UI only. Apple platform UI is intentionally
deferred and will be planned separately.

Web UI implementation should follow `docs/ui-guidelines.md`.

## Delivery Strategy

Use a dual-lane milestone model so every step is both useful to users and safe
for implementation:

1. User lane: each milestone adds a clear, usable user flow in the Web UI.
2. System lane: each milestone locks one backend contract (API, schema,
   filesystem behavior, sync semantics, or recovery behavior).
3. Operations lane: each milestone improves observability so self-host users can
   understand system state.

Each milestone must be working end-to-end before moving to the next one.

## Agent Control and Contract Locking

Before coding each milestone, create and approve a short implementation contract:

- API routes and request/response payloads.
- Schema delta and migration details.
- Filesystem side effects and reconciliation expectations.
- Web UI routes, states, and error handling behavior.
- Acceptance checks (manual script or automated tests).

Execution constraints:

- One milestone contract per PR.
- No cross-milestone refactors unless explicitly approved.
- If a later milestone requires changing a prior contract, treat it as a
  separate explicit decision.
- Agent reviews should follow `docs/agent-review-checklist.md` and
  `docs/agent-review-skill.md`.
- Prefer running reviews via `/agent-review`
  (`.claude/skills/agent-review/SKILL.md`).

## Milestones

### M0 Install Confidence

- User-facing outcome: user can run the server and quickly verify system health.
- Backend scope: config loading, migrations, SQLite setup, content root checks,
  health endpoint.
- Web UI scope: minimal status shell for service health and key runtime
  diagnostics.
- Contract lock: startup behavior and migration failure policy.
- Done when: clean startup and diagnostics are visible and reliable.

### M1 Notes Loop

- User-facing outcome: user can create, edit, delete, and browse notes.
- Backend scope: filesystem-first note writes, `documents` upsert,
  `sync_events` append.
- Web UI scope: notes list, note detail, note editor with explicit save.
- Contract lock: note CRUD API shape, path normalization rules, atomic writes.
- Done when: complete note workflow works with durable persistence.

### M2 Sync v1 (Notes Only)

- User-facing outcome: user gains confidence that note changes are synchronizable
  and traceable.
- Backend scope: `push`/`pull` sync APIs, cursor semantics, tombstones,
  last-write-wins with server timestamps.
- Web UI scope: sync inspector page showing cursor progression and sync events.
- Contract lock: sync payload versioning and conflict authority rules.
- Done when: deterministic convergence scenarios pass for note changes.

### M3 Backlinks and Markdown Annotations

- User-facing outcome: user can connect notes and see backlinks.
- Backend scope: backlink CRUD, markdown segment normalization,
  annotation-as-backlink behavior.
- Web UI scope: backlink panel, link insertion, heading-level segment targeting.
- Contract lock: markdown segment reference JSON shape and versioning.
- Done when: links and note-attached annotations are discoverable both ways.

### M4 Article Import

- User-facing outcome: user can paste a URL and get a locally archived article in
  the library.
- Backend scope: URL ingestion pipeline, archive persistence, metadata extraction,
  `web_article` document creation.
- Web UI scope: import form, import queue/status, article detail page.
- Contract lock: import job states, retry semantics, and error reporting.
- Done when: successful and failed imports are both observable and recoverable.

### M5 Article Annotation

- User-facing outcome: user can annotate imported articles.
- Backend scope: `web_article` segment indexing, shadow document lifecycle,
  annotation targeting.
- Web UI scope: article reader with highlight + annotation sidebar.
- Contract lock: `web_article` segment reference format and shadow doc linkage.
- Done when: article highlights/annotations persist and re-open correctly.

### M6 EPUB Import and Read Baseline

- User-facing outcome: user can upload EPUBs, browse chapters, and target
  annotations.
- Backend scope: EPUB ingestion, metadata extraction, chapter/section indexing,
  document registration.
- Web UI scope: EPUB library entries, chapter navigation, baseline reader view.
- Contract lock: EPUB segment addressing schema and indexing behavior.
- Done when: EPUBs are reliably imported and navigable with stable targets.

### M7 External Edit Reconciliation

- User-facing outcome: user can safely edit content outside Wisdom and see changes
  reflected.
- Backend scope: startup/periodic scans, create/update/rename/delete detection,
  reindex + sync event emission.
- Web UI scope: reconciliation activity view and external-change visibility.
- Contract lock: conflict rule when external edits disagree with app state
  (filesystem authoritative).
- Done when: external edits converge predictably without data loss.

### M8 v0.1 Hardening

- User-facing outcome: user has operational confidence in a self-hosted setup.
- Backend scope: backup/restore validation, migration guardrails,
  recovery/retry hardening.
- Web UI scope: operational dashboard for imports, sync, reconciliation, and
  recovery status.
- Contract lock: release-level acceptance checks and reliability criteria.
- Done when: system passes v0.1 reliability and operability checklist.

## UX Growth Direction (Web UI)

- Keep a stable top-level navigation from early milestones: Library, Notes,
  Imports, Operations.
- Reuse one document detail frame across content types (`note`, `web_article`,
  `epub`) so capabilities grow without redesign churn.
- Add operational transparency early (sync/import/reconciliation visibility) as a
  first-class self-host feature.

## Review Cadence

- Reconfirm roadmap order after each completed milestone.
- Allow scope changes only through an explicit contract update.
