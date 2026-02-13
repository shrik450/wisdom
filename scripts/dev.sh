#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$root_dir/server"

if ! command -v air >/dev/null 2>&1; then
  echo "air is required for dev mode: https://github.com/air-verse/air" >&2
  exit 1
fi

air
