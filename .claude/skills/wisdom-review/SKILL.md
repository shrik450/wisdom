# Wisdom Review

## Purpose

Extensive code review for this repository with strong emphasis on intent, simplicity, quality, and unnecessary complexity as defects.

## Use This Skill When

- Reviewing a branch, commit range, PR diff, or local changes
- You need review feedback aligned with `AGENTS.md`
- You want explicit "why"-driven critique, not just functional bug hunting

## Core Instructions

1. Read repository intent first:
   - `README.md`
   - `AGENTS.md`
   - `docs/architecture.md`
   - Relevant `docs/*` for touched components
   - `docs/testing.md` when judging tests
2. Determine the change intent and verify it fits goals/non-goals.
3. Review for correctness, simplicity, quality, taste, security, and test quality.
4. Treat unnecessary changes/abstractions as bugs.
5. Ask explicit "why" questions where intent is unclear.
6. Recommend the simplest viable fix that preserves scope.

## Required Questions

Ask these in your analysis whenever relevant:

- Why is this needed?
- Why is this implementation the simplest valid option?
- Why does this abstraction exist?
- Why is this test strategy adequate?
- Why is this complexity justified by project scope?

## Output Contract

Provide:

1. Blocking findings
2. Major findings
3. Minor findings
4. Open "why" questions
5. Positive notes (what is good)

Each finding must include:

- What is wrong
- Why it matters
- Evidence (file + line)
- Suggested fix
- Confidence (high/medium/low)
