# Wisdom Backend

Minimal v0 bootstrap for the Go server.

Current implementation notes:

- `segments_index` is intentionally not part of the initial schema.
- `markdown` is the first planned adapter for end-to-end bring-up.

## Prerequisites

- Go 1.25+

## Quickstart

```bash
cp .env.example .env
make run
```

Server starts on `:8080` by default and creates `./data/wisdom.db`.

Health check:

```bash
curl http://localhost:8080/healthz
```

## Commands

- `make fmt`
- `make lint`
- `make test`
- `make build`
- `make run`
