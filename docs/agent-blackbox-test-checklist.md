# Agent Black-Box Test Checklist

## Purpose

This checklist enforces practical, evidence-based validation that a change works according to the original prompt.

Use it for implementation verification where behavior must be proven via real interfaces.

## Verdict Levels

- `pass`: required behavior validated with sufficient evidence.
- `changes_required`: one or more required behaviors failed or evidence is insufficient.
- `blocked`: cannot execute meaningful validation due to missing prompt contract, missing runtime target, or environment blocker.

Severity guidance:

- `blocker`: prevents validation or shows required behavior is broken.
- `major`: significant mismatch or gap in required behavior.
- `minor`: non-blocking but meaningful quality/coverage gap.
- `nit`: optional improvement.

## Checklist

### A) Prompt Contract Extraction

- [ ] Original prompt/acceptance criteria is present.
- [ ] Expected behavior is translated into explicit checklist items.
- [ ] Required vs optional expectations are distinguished.

### B) Scenario Coverage Design

- [ ] Each required behavior has at least one happy-path scenario.
- [ ] Each required behavior has at least one non-happy-path scenario.
- [ ] Boundary/edge cases are included for each relevant input dimension.
- [ ] Stress/repetition scenarios are included when relevant.

### C) Interface Execution Coverage

- [ ] CLI behavior is tested via commands and output verification when applicable.
- [ ] UI/app behavior is tested via Playwright automation when applicable.
- [ ] Additional automation interfaces are used when applicable.
- [ ] Persisted outputs/side effects are validated when applicable.

### D) Evidence Quality

- [ ] Screenshots are captured for key visual checkpoints when UI is involved.
- [ ] Logs are inspected for expected and unexpected behavior.
- [ ] Output files/artifacts are inspected when part of behavior.
- [ ] Critical behaviors are validated by multiple evidence signals when possible.
- [ ] Reproduction commands/steps are recorded.

### E) Edge and Stress Validation

- [ ] Invalid/malformed input handling is tested.
- [ ] Empty/null/zero and min/max boundaries are tested.
- [ ] Repeated and rapid interactions are tested when relevant.
- [ ] High-volume or large-payload variants are tested when relevant.
- [ ] Timing-sensitive scenarios are re-run to detect flakiness.

### F) Prompt Alignment and Reporting

- [ ] Every prompt contract item is marked pass/fail/unvalidated.
- [ ] Failures include concrete evidence and minimal repro.
- [ ] Gaps/blockers are explicitly documented.
- [ ] Verdict follows policy and is evidence-backed.

## Mandatory Fail Gates

- Missing prompt contract details for required behavior -> `blocked`.
- Missing runnable target or required environment details -> `blocked`.
- Any failed required behavior -> `changes_required`.
- Any required behavior without sufficient evidence -> `changes_required`.
- Any skipped non-happy-path coverage for required behavior without justification -> `changes_required`.

## Required Output Format

1. `verdict`: `pass` | `changes_required` | `blocked`
2. `prompt_contract`: list of expected behaviors
3. `test_matrix`: scenario -> interface -> evidence method
4. `results`: pass/fail/unvalidated per scenario with concise rationale
5. `artifacts`: screenshots/logs/output files with paths
6. `gaps_or_blockers`: explicit missing coverage or environment blockers
7. `next_actions`: minimal path to confidence
