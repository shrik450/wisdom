# Agent Review Skill Spec

## Goal

Define a consistent review-agent workflow that enforces UI style consistency,
backend quality, and milestone-scope discipline.

This skill consumes `docs/agent-review-checklist.md` as its source of truth.

Project skill entrypoint: `.claude/skills/agent-review/SKILL.md`.

## Inputs

The review agent should be provided:

- PR diff or patch under review.
- Current milestone ID and approved contract reference.
- Any explicit constraints for this review cycle.

## Review Workflow

1. Scope detection
   - Classify changed files as Web UI, backend, docs, or mixed.
   - Select checklist sections to apply (A/B/C/D/E/F).

2. Contract alignment
   - Compare changes against the approved milestone contract.
   - Flag out-of-scope work as at least `major`.

3. UI style and consistency review
   - Enforce semantic HTML/CSS rules.
   - Enforce style reuse rule: do not add a new class/style when similar
     existing primitives already satisfy the need.
   - Validate progressive enhancement and accessibility basics.

4. Backend quality review
   - Validate architectural invariants and write-path behavior.
   - Validate migration/API/sync implications where touched.
   - Validate operational observability expectations.

5. Shortcut detection (hard gate)
   - Fail if critical behavior is stubbed/hardcoded as temporary unless
     explicitly allowed by contract.
   - Fail if unresolved `TODO`/`FIXME` remains in changed implementation paths
     without explicit approval.

6. Quality review
   - Evaluate clarity, simplicity, maintainability, and idiomatic language use.
   - Flag avoidable duplication, wheel reinvention, and unnecessary complexity.

7. Security review
   - Validate changes against documented security constraints and trust boundary.
   - Flag undocumented security holes or unsafe defaults as `blocker`.

8. Validation commands
   - If backend code changed, run:
     - `just fmt`
     - `just lint`
     - `just test`
     - `just build`
   - Do not run UI tests unless explicitly requested.

9. Produce structured report
   - Return verdict and findings using the required output format.

## Output Contract

The review agent response must include:

- `verdict`: `pass`, `changes_required`, or `blocked`
- `findings`: list of items with
  - severity (`blocker|major|minor|nit`)
  - file reference (`path:line` when possible)
  - rationale
  - required fix
- `checklist_status`: section-by-section status for A/B/C/D/E/F
- `validation`: commands executed and outcome summary
- `next_actions`: shortest path to get to `pass`

## Pass/Fail Policy

- Any `blocker` finding forces `changes_required`.
- Any failed backend validation command forces `changes_required`.
- Missing milestone contract reference yields `blocked`.
- Any unauthorized shortcut yields `changes_required`.
- Any undocumented/out-of-scope security hole yields `changes_required`.

## Suggested Invocation Template

Use this template when invoking a review agent:

```text
Review this PR against docs/agent-review-checklist.md and docs/ui-guidelines.md.
Milestone: <M#>
Contract reference: <doc path>
Scope constraints: <constraints>
Return output using the required format from docs/agent-review-checklist.md.
```
