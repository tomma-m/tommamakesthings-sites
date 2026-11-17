#!/usr/bin/env bash
# Renders og-card.html to src/img/og-card.<hash>.png (1200x630) with headless
# Chrome, then deletes the previous card. The hash is in the FILE NAME because
# CloudFront ignores query strings and images are cached for 7 days. After
# running, build.mjs picks the new name up by itself (it looks for og-card.*.png).
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=3000 \
  --screenshot="$OUT/og-card.png" "file://$PWD/og-card.html" >/dev/null 2>&1
hash=$(shasum -a 256 "$OUT/og-card.png" | cut -c1-8)
rm -f ../src/img/og-card.*.png
mv "$OUT/og-card.png" "../src/img/og-card.$hash.png"
rmdir "$OUT"
echo "wrote src/img/og-card.$hash.png"
