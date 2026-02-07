# Wisdom Backend

Milestone M0 backend for startup confidence and runtime diagnostics.

Current implementation notes:

- `segments_index` is intentionally not part of the initial schema.
- `markdown` is the first planned adapter for end-to-end bring-up.

## Prerequisites

- Go 1.25+
- just

## Quickstart

```bash
cp .env.example .env
just run
```

Startup checks run before HTTP bind:

- path normalization and config validation
- data/content directory validation and auto-create behavior
- SQLite open/connectivity checks
- migration apply and state validation

Defaults:

- HTTP bind: `:8080`
- data dir: `./data`
- db path: `./data/wisdom.db`
- content root: `./data/content`

If a startup invariant fails, the process exits non-zero with structured logs.

## Diagnostics

Health check (`200` healthy/degraded, `503` on failed dependency checks):

```bash
curl http://localhost:8080/healthz
```

Operations diagnostics snapshot:

```bash
curl http://localhost:8080/api/v1/ops/status
```

Operations UI shell:

- `http://localhost:8080/operations`
- `http://localhost:8080/operations/loading`

Top-level nav placeholders (M0 explicit placeholders):

- `http://localhost:8080/library`
- `http://localhost:8080/notes`
- `http://localhost:8080/imports`

## Commands

- `just fmt`
- `just lint`
- `just test`
- `just build`
- `just run`
