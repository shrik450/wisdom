# /wisdom-review

Perform an extensive code review aligned with this repository's standards.

## Scope

- Review target: `$ARGUMENTS`
- If no target is provided, review current staged + unstaged changes.

## Required Context First

Before reviewing any code, load and apply repository intent:

1. `README.md` (goals and non-goals)
2. `AGENTS.md`
3. `docs/architecture.md`
4. Any `docs/*` files relevant to changed components
5. `docs/testing.md` when evaluating tests

Do not skip this context step.

## Review Method

Review all changed files and evaluate both implementation and intent.

### 1) Understand intent

- Infer what the change is trying to achieve.
- Validate that the solution matches project goals and non-goals.
- Call out unnecessary work: if code exists without clear value, treat that as a defect.

### 2) Ask "why" questions explicitly

For each meaningful concern, ask the question behind it:

- Why is this change needed at all?
- Why this approach over the simplest alternative?
- Why this abstraction/data shape/API boundary?
- Why this dependency/pattern (if used)?
- Why is this level of complexity justified by project scope?
- Why is this test strategy sufficient?

If the answer is unclear from code + docs, record it as an open review question.

### 3) Evaluate with this rubric

Treat all categories as first-class:

1. Correctness and edge cases
2. Simplicity (least-complex viable solution)
3. Code quality and maintainability
4. Architectural fit with documented responsibilities
5. Security and safety within project constraints
6. Performance only where relevant to scope
7. Tests: meaningful coverage, black-box preference, no fragile internals
8. Style conformance (especially AGENTS.md language-specific guidance)

### 4) Anti-shortcut checks

Flag these explicitly when present:

- Important logic stubbed or hidden behind TODOs
- Unjustified abstractions/wrappers/components
- Overly clever type gymnastics instead of simpler design
- Over-engineering beyond stated goals
- Missing tests for critical behavior changes

## Output Format

Return findings grouped by severity:

### Blocking

- Issue
- Why this matters (tie to goals/scope)
- Evidence (file + line)
- Suggested fix (prefer simplest viable)
- Confidence (high/medium/low)

### Major

- Same structure as above

### Minor

- Same structure as above

### Open Questions

- List unanswered "why" questions required for confidence.

### What Is Good

- Briefly call out notable strengths and good decisions.

## Review Rules

- Be direct and specific; avoid vague criticism.
- Prefer actionable recommendations over stylistic preference.
- Do not propose architecture changes unless strictly required for correctness/safety.
- Keep recommendations proportional to project scope.
- If no issues are found, still report risks, assumptions, and what was verified.
