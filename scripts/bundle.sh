#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$root_dir/dist"
bundle_dir="$dist_dir/bundle"

rm -rf "$bundle_dir"
mkdir -p "$bundle_dir/ui" "$dist_dir"

rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  "$root_dir/ui/" "$bundle_dir/ui/"

for name in watches schedules indexing; do
  src="$root_dir/${name}.toml.example"
  dest="$bundle_dir/${name}.toml"
  if [ ! -f "$src" ]; then
    echo "missing example file: $src" >&2
    exit 1
  fi
  cp "$src" "$dest"
done

rm -f "$dist_dir/wisdom-bundle.zip"
(
  cd "$bundle_dir"
  zip -r "$dist_dir/wisdom-bundle.zip" .
)
