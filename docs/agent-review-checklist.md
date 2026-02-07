# Agent Review Checklist (Backend + Web UI)

## Purpose

This checklist defines merge-quality validation for agent-driven changes.

Use it for every implementation PR and milestone contract review.

## Verdict Levels

- `pass`: no blocking issues.
- `changes_required`: at least one blocker or major issue.
- `blocked`: cannot review due to missing context, missing contract, or broken
  local validation setup.

Severity guidance:

- `blocker`: violates an explicit `MUST` rule or architecture invariant.
- `major`: high risk defect or consistency break.
- `minor`: quality issue worth fixing soon.
- `nit`: optional improvement.

## Checklist

### A) Web UI Style and Consistency

Apply when HTML/CSS/templates are changed.

- [ ] Uses semantic HTML landmarks and native controls where applicable.
- [ ] Preserves heading hierarchy and basic document structure.
- [ ] Uses semantic CSS tokens/classes (purpose-based naming).
- [ ] Reuses existing classes/tokens/component patterns when equivalent behavior
      already exists.
- [ ] Does not add new classes or style rules when similar existing primitives
      can enforce consistency.
- [ ] Keeps core flows functional without JS (progressive enhancement).
- [ ] Includes required state coverage for changed screens (`loading`, `empty`,
      `success`, `error`, destructive `confirm` when relevant).
- [ ] Preserves accessibility baseline (keyboard/focus/labels).

### B) Backend Quality and Architecture

Apply when Go/SQL/backend API behavior changes.

- [ ] Respects filesystem-as-source-of-truth model for content/path state.
- [ ] Preserves write protocol ordering (`filesystem -> sqlite -> sync_events`)
      for app-originated writes.
- [ ] Keeps annotation model consistent (`annotation = backlink + content`).
- [ ] Uses migrations for schema changes and keeps migration behavior safe and
      deterministic.
- [ ] Maintains API contract clarity (validation, explicit errors, stable
      payloads).
- [ ] Maintains reconciliation and sync semantics (cursor/event/tombstone rules)
      when touched.
- [ ] Includes useful operational signals (logs/status) for changed paths.

### C) Verification and Project Hygiene

Apply to all changes.

- [ ] Change scope matches approved milestone contract.
- [ ] Non-goal churn is avoided (no opportunistic refactors outside scope).
- [ ] Relevant docs are updated when behavior/contracts change.
- [ ] Backend checks pass: `just fmt`, `just lint`, `just test`, `just build`
      (when backend is touched).
- [ ] No UI tests are run unless explicitly requested.

### D) Shortcut Detection (Hard Gate)

Apply to all implementation changes.

- [ ] No critical behavior is stubbed, mocked, or hardcoded as a temporary
      shortcut unless explicitly approved by the milestone contract.
- [ ] No unresolved `TODO`/`FIXME` remains in changed implementation paths unless
      the contract explicitly allows that exact exception.
- [ ] Required validation and error handling are implemented (not deferred) for
      in-scope behavior.

Policy:

- Any unauthorized shortcut is a `blocker` and forces `changes_required`.

### E) Code Quality and Maintainability

Apply when implementation code changes.

- [ ] Code is clear, simple, and maintainable without unnecessary abstraction.
- [ ] Avoids avoidable duplication; reuses existing primitives where appropriate.
- [ ] Uses language-native affordances and idioms instead of reinventing common
      patterns.
- [ ] Balances implementation speed with long-term readability and ownership.

### F) Security Within Scope

Apply when behavior, APIs, storage, or data handling changes.

- [ ] No new security hole is introduced relative to documented constraints and
      trust boundaries.
- [ ] New input surfaces include appropriate validation/sanitization.
- [ ] Sensitive data is not leaked via logs, responses, or persisted artifacts.
- [ ] Any accepted security tradeoff is explicitly documented and approved as
      in-scope.

## Required Review Output Format

Reviewer output must include:

1. Verdict: `pass`, `changes_required`, or `blocked`.
2. Findings list with severity, file reference, and concise rationale.
3. Checklist summary with pass/fail per section (A/B/C/D/E/F).
4. Validation commands run and outcomes.
5. Clear next actions to reach `pass`.
