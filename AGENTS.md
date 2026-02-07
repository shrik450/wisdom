# Agent Runtime Notes

- Do not run UI tests unless the user explicitly asks for them.
- For review tasks, follow `docs/agent-review-skill.md` and validate against
  `docs/agent-review-checklist.md`.
- Prefer invoking the project skill at `.claude/skills/agent-review/SKILL.md`
  (slash command: `/agent-review`) for structured reviews.
