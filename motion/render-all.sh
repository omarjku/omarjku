#!/usr/bin/env bash
# Renders every scene: a README GIF, a small card GIF for the profile, and an MP4.
# Usage: motion/render-all.sh [out_dir]   (default: motion/out)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/out}"
mkdir -p "$out"

# scene      gif width   card width
while read -r scene gif card; do
  [ -z "$scene" ] && continue
  args=(--scale 1.5 --gif "$gif" --out "$out")
  [ "$card" != "-" ] && args+=(--card "$card")
  node "$here/render.mjs" "$scene" "${args[@]}" </dev/null
done <<'EOF'
profile    1200 -
leyrd      1000 440
orchestra  1000 440
genome     1000 440
rice       1000 440
agentmesh  1000 440
cnn        1000 440
EOF
