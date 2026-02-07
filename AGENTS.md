# Wisdom Agent Guide

This file is for coding agents operating in this repository.
Read it before making changes.

## Rule Sources and Precedence
- First follow direct user instructions.
- Then follow this file and repository docs.
- Architecture intent lives in `docs/architecture.md`, `docs/roadmap.md`, and `TODO.md`.
- Web UI and accessibility rules live in `docs/ui-guidelines.md`.
- Review standards live in `docs/agent-review-checklist.md`.
- Black-box testing standards live in `docs/agent-blackbox-test-checklist.md`.

## Cursor/Copilot Rules Status
- `.cursor/rules/` not present.
- `.cursorrules` not present.
- `.github/copilot-instructions.md` not present.
- If any of these files appear later, treat them as authoritative and update this guide.

## Repository Layout
- `backend/`: Go server (`cmd/wisdomd`, `internal/*`, `migrations/*`).
- `apps/wisdom/`: iOS SwiftUI app (`wisdom`, `wisdomTests`, `wisdomUITests`).
- `docs/`: architecture, roadmap, UI rules, and agent skill/checklist docs.

## Runtime Guardrails
- Do not run UI tests unless the user explicitly asks.
- Keep milestone scope tight; avoid cross-milestone refactors unless asked.
- Do not leave unresolved `TODO`/`FIXME` in changed implementation paths unless explicitly approved.
- Update docs/contracts when API or behavior contracts change.

## Build/Lint/Test Commands
- Run commands from the noted directory.

### Backend (`backend/`)
- Format: `just fmt` (runs `go fmt ./...`).
- Lint: `just lint` (runs `go vet ./...`).
- Test (all): `just test` (runs `go test ./...`).
- Build: `just build` (runs `go build ./...`).
- Run server: `just run` (runs `go run ./cmd/wisdomd`).
- Quickstart: `cp .env.example .env && just run`.
- Health check: `curl http://localhost:8080/healthz`.
- Single package: `go test ./internal/config`.
- Single test across packages: `go test ./... -run '^TestName$' -count=1`.
- Single test in one package: `go test ./internal/config -run '^TestLoad$' -count=1`.
- Verbose targeted test: `go test -v ./internal/migrations -run '^TestApply$' -count=1`.

### iOS App (`/Users/shrik450/Developer/wisdom`)
- List simulator destinations:
  `xcodebuild -showdestinations -project apps/wisdom/wisdom.xcodeproj -scheme wisdom`
- Build scheme:
  `xcodebuild -project apps/wisdom/wisdom.xcodeproj -scheme wisdom -destination 'generic/platform=iOS Simulator' build`
- Run unit-test target only (no UI tests):
  `xcodebuild test -project apps/wisdom/wisdom.xcodeproj -scheme wisdom -destination 'platform=iOS Simulator,name=<SimulatorName>' -only-testing:wisdomTests`
- Run one XCTest method:
  `xcodebuild test -project apps/wisdom/wisdom.xcodeproj -scheme wisdom -destination 'platform=iOS Simulator,name=<SimulatorName>' -only-testing:wisdomTests/wisdomTests/testDefaultServerURL`
- Run one XCTest class:
  `xcodebuild test -project apps/wisdom/wisdom.xcodeproj -scheme wisdom -destination 'platform=iOS Simulator,name=<SimulatorName>' -only-testing:wisdomTests/wisdomTests`
- Run `wisdomUITests` only when explicitly requested.

## Validation Before Hand-off
- If backend Go code changed: run `just fmt`, `just lint`, `just test`, `just build`.
- If Swift app code changed: run at least scheme build and relevant `wisdomTests`.
- Skip UI tests by default unless explicitly requested.

## Code Style Guidelines

### General
- Prefer simple, direct implementations over layered abstractions.
- Keep changes narrowly scoped to the requested task.
- Preserve existing comments unless they become incorrect.
- Add comments only when logic is non-obvious.

### Go (Backend)
- **Imports:** Use standard Go grouping and ordering (`gofmt` style).
- **Imports:** Keep blank imports only for intentional side effects (for example SQLite driver registration).
- **Dependencies**: Use the standard library where possible.
- **Dependencies**: For third-party packages, prefer well-known, maintained libraries with minimal surface area.
- **Dependencies**: You must seek user approval before adding new dependencies, even if they are small or well-known.
- **Formatting:** Let `go fmt` define formatting; do not hand-format around it.
- **Formatting:** Keep functions short; prefer early returns for guards and errors.
- **Types:** Prefer concrete structs/functions; add interfaces only at clear seams.
- **Types:** Use explicit JSON response structs with stable tags.
- **Naming:** Package names are lowercase and domain-based.
- **Naming:** Exported identifiers use `PascalCase`; unexported use `camelCase`.
- **Error handling:** Return errors instead of panicking in internal/library packages.
- **Error handling:** Wrap with operation context using `%w` (for example `fmt.Errorf("open sqlite database: %w", err)`).
- **Error handling:** Always clean up on failure paths (`rows.Close`, `tx.Rollback`, `db.Close`).
- **Logging:** Use structured logs with `slog` key/value pairs; never log secrets.
- **HTTP:** Use `r.Context()` for DB calls and set content type/status explicitly.
- **Persistence:** Keep schema changes in migrations; keep migration order deterministic (`<version>_<name>.sql`).

### Swift (iOS)
- **Imports:** Keep imports minimal; remove unused imports promptly.
- **Imports:** Preferred order: `Foundation`, Apple frameworks (`SwiftUI`, `Combine`), then third-party (`GRDB`).
- **Formatting:** Use standard Xcode formatting (4-space indentation, brace-on-same-line style).
- **Types:** Prefer `struct` for value/service types; use `final class` for shared mutable state.
- **State:** Mark UI state owners `@MainActor` when mutating published UI state.
- **Concurrency:** Prefer `async/await`; use `Task {}` for UI event bridging only.
- **Naming:** New type names use `UpperCamelCase`; methods/properties/cases use `lowerCamelCase`.
- **Naming:** Views end with `View`; services/stores should be responsibility-oriented.
- **Errors:** Use typed domain/network errors; conform to `LocalizedError` for user-facing messages.
- **Errors:** Avoid force unwraps outside tests and show concise actionable UI error text.
- **Testing:** Keep deterministic unit tests in `apps/wisdom/wisdomTests`.
- **Testing:** Keep UI tests in `wisdomUITests`; run only when explicitly requested.

### SQL Migrations
- Use forward-only numbered files in `backend/migrations`.
- Keep DDL idempotent where practical (`IF NOT EXISTS` for create/index).
- Prefer explicit constraints (`NOT NULL`, `CHECK`, `FOREIGN KEY`) at schema definition time.

### Web UI and Accessibility
- Use semantic HTML landmarks and native controls.
- Use token-based CSS and semantic class names; avoid ad-hoc visual classes.
- Keep baseline flows functional without JS (progressive enhancement).
- Cover `loading`, `empty`, `success`, and `error` states for changed screens.
- Preserve keyboard navigation, focus visibility, and accessible labels.

## Config and Security Defaults
- Backend env vars are `WISDOM_HTTP_ADDR`, `WISDOM_DATA_DIR`, `WISDOM_DB_PATH`.
- Prefer safe defaults that work locally (`:8080`, `./data`, `./data/wisdom.db`).
- Keep trust-boundary assumptions aligned with docs (single user behind trusted proxy/basic auth).
- Do not expose credentials/tokens in logs, responses, or persisted debug artifacts.

## Architecture Invariants
- Filesystem is the source of truth for document bytes and hierarchy.
- SQLite is derived metadata/index/sync state.
- Write order for app-originated changes: filesystem -> sqlite -> `sync_events`.
- Annotation model invariant: annotation = backlink + content payload.
- Conflict rule remains last-write-wins with server authority.

## Agent Review and Black-Box Skills
- For review tasks, follow `docs/agent-review-skill.md` and `docs/agent-review-checklist.md`.
- Prefer `.claude/skills/agent-review/SKILL.md` via `/agent-review`.
- For behavior validation, follow `docs/agent-blackbox-test-skill.md` and `docs/agent-blackbox-test-checklist.md`.
- Prefer `.claude/skills/agent-blackbox-test/SKILL.md` via `/agent-blackbox-test`.

## Milestone Discipline
- One milestone contract per PR.
- Avoid out-of-scope refactors.
- If later milestones require contract changes, make that an explicit decision.
- Keep contract/doc updates in the same change when behavior shifts.

## Quick Command Reference
- Backend full validation: `cd backend && just fmt && just lint && just test && just build`.
- Backend single test example: `cd backend && go test ./internal/config -run '^TestLoad$' -count=1`.
- iOS single unit test example: `xcodebuild test -project apps/wisdom/wisdom.xcodeproj -scheme wisdom -destination 'platform=iOS Simulator,name=<SimulatorName>' -only-testing:wisdomTests/wisdomTests/testDefaultServerURL`.
- iOS destinations: `xcodebuild -showdestinations -project apps/wisdom/wisdom.xcodeproj -scheme wisdom`.

## Definition of Done for Agent Changes
- Requested behavior implemented and scoped correctly.
- Relevant checks run and passing.
- No unrelated file churn.
- Documentation updated when contracts/behavior changed.
