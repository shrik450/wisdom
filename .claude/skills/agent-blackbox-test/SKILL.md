---
name: agent-blackbox-test
description: Manually black-box test a change against the prompt using every practical interface and evidence source.
argument-hint: "[original-prompt] [change-summary-or-diff] [run-target]"
disable-model-invocation: true
---

# Agent Black-Box Test

Use this skill to validate that a change actually works from the outside.

Focus on observed behavior, not implementation details.

## Required references

Read these before testing:

- `docs/agent-blackbox-test-skill.md`
- `docs/agent-blackbox-test-checklist.md`
- `AGENTS.md`

## Inputs

- Original prompt or acceptance criteria.
- Change scope (PR, diff, or implementation summary).
- Runnable target details (URL, CLI command, app entrypoint).
- Environment/setup constraints (seed data, feature flags, credentials, ports).

If the original prompt or runnable target is missing, return verdict `blocked`.

## Core principle

Assume the change is a black box.

Infer expected behavior from the prompt and external behavior only.

Do not treat internal code inspection as proof that behavior works.

## Workflow

1. Build the prompt contract.
   - Convert the prompt into explicit expected outcomes (`must`, `should`, `must_not`).
   - Identify likely risks and edge-case dimensions.
2. Build a test matrix.
   - For each expected outcome, define: happy path, negative path, boundary case, and stress/repetition case.
   - Map each scenario to the best interface and tool (CLI, web UI, app automation, artifacts).
3. Execute through all relevant interfaces.
   - CLI flows via `bash` with command, exit code, stdout/stderr capture.
   - Web/app flows via Playwright automation in Python using PEP 723 inline script metadata and `uv run`.
   - Additional app automation channels when available.
4. Collect multi-signal evidence.
   - Capture screenshots for key visual states.
   - Inspect logs (server/app/browser/console) for expected and unexpected signals.
   - Verify produced files/artifacts/side effects when relevant.
   - Use at least two independent confirmations for critical behaviors when possible.
5. Run edge and stress coverage.
   - Validate invalid input, empty/null input, min/max boundaries, repeated actions, and high-volume variants when relevant.
   - Re-run flaky/timing-sensitive scenarios multiple times.
6. Compare results to prompt contract.
   - Mark each expected outcome pass/fail with concrete evidence.
   - Call out partial behavior and regressions.
7. Return the required structured output.

## Mandatory thoroughness gates

- Never stop at one passing happy path.
- Every in-scope behavior needs at least one non-happy-path test.
- Use every practical validation channel available in the environment.
- Validate via artifacts (screenshots/logs/output files), not just exit codes.
- If a channel cannot be executed, document exact blocker and fallback checks.
- If evidence is incomplete for required behavior, verdict cannot be `pass`.

## Playwright requirement for UI/app validation

When UI or app behavior is in scope, automate at least the primary flow with Python Playwright using PEP 723 metadata and run it with `uv run`.

Template:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.50.0"]
# ///
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    # Execute scenario steps and assertions.
    page.screenshot(path="artifacts/blackbox/main-flow.png", full_page=True)
    browser.close()
```

Install browser binaries when needed with `uv run playwright install`.

## Output format (required)

Return all sections below:

1. `verdict`: `pass` | `changes_required` | `blocked`
2. `prompt_contract`: expected outcomes derived from prompt
3. `test_matrix`: scenario -> interface -> evidence source
4. `results`: pass/fail per scenario + concise evidence references
5. `artifacts`: screenshots/logs/output files (with paths)
6. `gaps_or_blockers`: unvalidated items and why
7. `next_actions`: shortest path to confidence

Keep the report concise, reproducible, and evidence-based.
