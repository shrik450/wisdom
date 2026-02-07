---
name: agent-review
description: Reviews changes for merge readiness using Wisdom's UI and backend quality checklist. Use before milestone acceptance or merge.
argument-hint: "[milestone-id] [contract-doc-path]"
disable-model-invocation: true
---

# Agent Review

Use this skill to produce a structured review against project standards.

## Required references

Read these documents before reviewing:

- `docs/agent-review-checklist.md`
- `docs/ui-guidelines.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `AGENTS.md`

## Inputs

- Milestone identifier (for example `M1`).
- Contract reference path for the milestone.
- The code diff to review.

If milestone or contract is missing, return verdict `blocked`.

## Review workflow

1. Determine scope (Web UI, backend, docs, mixed).
2. Compare changes to milestone contract and flag out-of-scope work.
3. Apply checklist sections from `docs/agent-review-checklist.md`.
4. Run validation commands when backend code is touched:
   - `just fmt`
   - `just lint`
   - `just test`
   - `just build`
5. Do not run UI tests unless explicitly requested.
6. Return the required structured review output.

## Mandatory fail gates

### 1) Shortcuts

Treat as `blocker` unless explicitly allowed by the approved contract:

- placeholder or stub logic presented as complete behavior
- unresolved `TODO`/`FIXME` in changed implementation paths
- temporary hardcoded values that bypass required behavior
- omitted error handling or validation that the scope requires

If any unauthorized shortcut exists, verdict must be `changes_required`.

### 2) Quality

Review for clarity, simplicity, maintainability, and idiomatic language use.

Flag as `major` or `blocker` when present:

- avoidable duplication instead of clear reuse
- non-idiomatic implementation when native language affordances are available
- unnecessary reinvention of existing project primitives
- complexity that harms readability without benefit

### 3) Security

Validate against documented constraints and threat posture.

Flag as `blocker` when present:

- security gaps not documented as out of scope
- unsafe defaults or trust-boundary violations
- missing validation/sanitization for newly introduced input surfaces
- exposure of sensitive data in logs, responses, or persisted artifacts

## Output format (required)

Return all of the following:

1. `verdict`: `pass` | `changes_required` | `blocked`
2. `findings`: severity + `path:line` + rationale + required fix
3. `checklist_status`: pass/fail per checklist section
4. `validation`: commands executed and outcomes
5. `next_actions`: shortest path to `pass`

Keep findings actionable and concise.
