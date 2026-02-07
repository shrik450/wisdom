# Wisdom UI Guidelines (v0.1, Backend + Web UI)

## Scope

These guidelines apply to Backend + Web UI work for v0.1.

Apple platform UI is intentionally out of scope for this document and will be
defined separately.

## General Product Direction

- Build to native platform conventions.
- Do not force cross-platform visual or interaction consistency.
- For Web UI, prioritize web-native semantics, browser behavior, and accessibility.

## Rule Levels

- `MUST`: required for merge.
- `SHOULD`: expected by default; deviations require a stated reason.
- `MAY`: optional improvement.

## Web UI Rules

### 1) Semantic HTML

- `MUST` use semantic structure (`header`, `nav`, `main`, `section`, `article`,
  `aside`, `footer`) where appropriate.
- `MUST` use proper heading hierarchy and meaningful landmark regions.
- `MUST` use native controls for behavior (`button`, `a`, `form`, `label`,
  `input`, `textarea`, `select`) rather than generic `div`/`span` controls.
- `SHOULD` use lists/tables only when the content is structurally a list/table.

### 2) Semantic CSS and Theming

- `MUST` use CSS custom properties as semantic design tokens (for example,
  `--surface`, `--surface-muted`, `--text-primary`, `--text-secondary`,
  `--accent`, `--border`, `--danger`).
- `MUST` avoid hardcoded colors in component rules when a token exists.
- `MUST` use semantic class naming by purpose (for example, `note-list`,
  `import-status`) rather than visual naming (for example, `blue-card`).
- `MUST` reuse existing semantic classes, tokens, and component patterns before
  introducing new ones.
- `MUST NOT` add a new class or style rule when an existing style primitive can
  enforce the same behavior.
- `SHOULD` separate token, base, and component layers so themes can be swapped
  without rewriting components.
- `SHOULD` expose configurable theme values for user customization over time.

### 3) Accessibility Baseline

- `MUST` meet WCAG 2.2 AA standards for shipped UI.
- `MUST` support full keyboard navigation for core workflows.
- `MUST` provide clearly visible focus states.
- `MUST` include accessible names/labels for controls and form fields.
- `MUST` use ARIA only when native semantics cannot express the behavior.
- `SHOULD` respect `prefers-reduced-motion` for non-essential motion.

### 4) Progressive Enhancement

- `MUST` keep core flows functional with server-rendered HTML, links, and forms.
- `MUST` treat HTMX/JS as enhancement, not as a hard dependency for baseline
  functionality.
- `SHOULD` preserve predictable browser behavior (back/forward, reload,
  deep-linking) in enhanced flows.

### 5) Information Architecture and URL Contracts

- `MUST` maintain stable top-level navigation: `Library`, `Notes`, `Imports`,
  `Operations`.
- `MUST` provide deep-linkable URLs for primary list/detail/edit views.
- `SHOULD` avoid navigation redesign churn across milestones.

### 6) Required UI State Coverage

- `MUST` define and implement the following states for each major screen:
  `loading`, `empty`, `success`, `error`, and destructive `confirm` where
  applicable.
- `MUST` show actionable error messages with next-step guidance.
- `SHOULD` expose operational status for long-running backend actions (imports,
  sync, reconciliation).

### 7) Typography and Reading Ergonomics

- `MUST` separate UI typography tokens from reading/content typography tokens.
- `MUST` use readable defaults for long-form content (line height and line
  length suitable for notes/articles).
- `SHOULD` allow user-configurable reading font family and size.

### 8) Responsive and Input Ergonomics

- `MUST` support desktop and tablet web layouts.
- `MUST` ensure touch-friendly control sizing (minimum 44x44 CSS px targets for
  primary interactive controls).
- `SHOULD` avoid hover-only critical actions.

### 9) Performance and Privacy Defaults

- `MUST` avoid third-party tracking scripts.
- `MUST` prefer self-hosted assets for core UI dependencies.
- `SHOULD` keep JS payload minimal and prioritize fast first render of
  server-rendered pages.

### 10) Browser Support Policy

- `MUST` support current stable Safari, Chrome, and Firefox.
- `SHOULD` avoid introducing features that require experimental browser flags.

## PR Review Checklist (Web UI)

A Web UI PR should explicitly confirm:

- semantic HTML structure and native control usage
- token-based theming (no unnecessary hardcoded visual values)
- keyboard/focus/accessibility coverage
- baseline functionality without JS
- required state coverage and error handling
- URL/deep-link behavior for affected screens
