# Agent Black-Box Test Skill Spec

## Goal

Define a practical, execution-first workflow that validates a change behaves as requested when treated as a black box.

This skill is for proving behavior works in reality (UI, CLI, app), not for code-style review.

Project skill entrypoint: `.claude/skills/agent-blackbox-test/SKILL.md`.

## Inputs

The testing agent should be provided:

- Original user prompt or explicit acceptance criteria.
- Diff/PR/change summary to define scope.
- Runtime targets (URL, command, app launch entrypoint).
- Required environment details (ports, seed data, auth, feature flags).

If prompt contract or run target is missing, verdict must be `blocked`.

## Black-Box Testing Workflow

1. Prompt contract extraction
   - Translate prompt into explicit expected behavior items.
   - Classify each item as required (`must`) or nice-to-have (`should`).

2. Risk and edge-case modeling
   - Identify input dimensions, state transitions, and failure modes.
   - Enumerate edge classes: empty, null, malformed, min/max, duplicates, race/timing, retries, high volume.

3. Scenario matrix design
   - For each expected behavior, include at least:
     - one happy path
     - one negative/invalid path
     - one boundary or edge path
   - Add stress/repetition scenarios when change touches performance, retries, queues, or loops.

4. Interface and tool mapping
   - CLI behavior: `bash` commands + output validation.
   - Web/app behavior: Playwright automation in Python with PEP 723 metadata, executed via `uv run`.
   - App/OS behavior: use available automation path(s) for native interactions when applicable.
   - Artifact validation: logs, screenshots, output files, persisted state.

5. Execution and evidence
   - Run scenarios and record outcomes with reproducible commands/steps.
   - Capture screenshots for visual checkpoints.
   - Capture and inspect logs for expected and unexpected signals.
   - Inspect output files/data side effects where relevant.
   - Prefer evidence triangulation (at least two independent signals for critical behavior).

6. Prompt comparison and verdict
   - Compare observed outcomes to the prompt contract item-by-item.
   - Mark unvalidated behaviors and blockers explicitly.
   - Produce a strict verdict: `pass`, `changes_required`, or `blocked`.

## Required Validation Depth

- Do not stop after first success.
- Cover every in-scope behavior with non-happy-path checks.
- Stress test applicable variants.
- Validate with artifacts, not only exit statuses.
- If key behavior lacks evidence, verdict cannot be `pass`.

## Output Contract

Agent output must include:

- `verdict`: `pass`, `changes_required`, or `blocked`
- `prompt_contract`: behavior checklist derived from prompt
- `test_matrix`: scenario, interface, and validation method
- `results`: pass/fail per scenario with concise evidence
- `artifacts`: paths to screenshots/logs/output files
- `gaps_or_blockers`: what was not validated and why
- `next_actions`: shortest path to confidence

## Suggested Invocation Template

Use this template when invoking the skill:

```text
Black-box test this change against the original prompt.
Prompt: <prompt text>
Scope: <diff / PR / summary>
Run targets: <url/commands/app entrypoint>
Constraints: <auth/data/ports/flags>
Return output using the required format from docs/agent-blackbox-test-checklist.md.
```
