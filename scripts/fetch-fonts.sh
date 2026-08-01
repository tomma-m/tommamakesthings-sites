#!/usr/bin/env bash
set -euo pipefail
OUT="sites/sidelinehero/src/fonts"
mkdir -p "$OUT"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

fetch() {  # family, weight, outfile
  local css url
  css=$(curl -sS -H "User-Agent: $UA" \
    "https://fonts.googleapis.com/css2?family=$1:wght@$2&display=swap")
  # Google's css2 response has one @font-face block per unicode-range
  # subset (vietnamese, cyrillic, greek, latin-ext, latin, ...). The
  # basic-Latin block is always named exactly "latin" and is listed last,
  # so a bare `head -1` picks up a non-Latin subset that can't render
  # ASCII text. Anchor on the "/* latin */" comment specifically.
  url=$(echo "$css" | awk '/\/\* latin \*\//{f=1} f && /\.woff2/{print; exit}' \
    | grep -o 'https://[^)]*\.woff2')
  [ -n "$url" ] || { echo "no woff2 for $1 $2" >&2; exit 1; }
  curl -sS "$url" -o "$OUT/$3"
  echo "  $3"
}

fetch "Anton" 400 "anton-400.woff2"
fetch "Saira" 700 "saira-700.woff2"
fetch "Hanken+Grotesk" 400 "hanken-400.woff2"
fetch "Hanken+Grotesk" 700 "hanken-700.woff2"

curl -sS https://openfontlicense.org/documents/OFL.txt -o "$OUT/OFL.txt" \
  || echo "OFL.txt: fetch manually from the font's Google Fonts page" >&2
