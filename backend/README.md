# Wisdom Backend

Minimal v0 bootstrap for the Go server.

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

Server starts on `:8080` by default and creates `./data/wisdom.db`.

Health check:

```bash
curl http://localhost:8080/healthz
```

## Commands

- `just fmt`
- `just lint`
- `just test`
- `just build`
- `just run`
