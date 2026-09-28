#!/usr/bin/env bash
# Fails if the BUILT output references any host we do not control.
#
# This gates the deploy — it runs against dist/ before anything is uploaded, so
# a third-party embed never reaches production in the first place.
set -euo pipefail

DIST="${1:-sites/sidelinehero/dist}"

# grep -r on a missing directory exits 2, and `if grep ...` reads a non-zero
# exit as "found nothing" — which would turn a broken build into a pass.
if [ ! -d "$DIST" ]; then
  echo "  FAIL $DIST does not exist — run the build first"
  exit 1
fi
if ! ls "$DIST"/*.html >/dev/null 2>&1; then
  echo "  FAIL $DIST contains no HTML at its root — build looks broken"
  exit 1
fi

# Matches absolute URLs AND protocol-relative ones (//evil.example/x.js), which
# is the form a pasted embed usually takes and which https?:// never catches.
# The host must contain a dot, so `// comment` in CSS/JS does not false-positive.
URL_RE='(https?:)?//[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]+)?(/[^"'"'"'`) >]*)?'

# (/|$) after the host is load-bearing: without it,
# sidelinehero.tommamakesthings.com.evil.example matches the prefix and passes.
ALLOWED='^(https:)?//sidelinehero\.tommamakesthings\.com(/|$)'

# XML namespace URIs are identifiers, never fetched. Anchored exactly, so a real
# asset hosted on w3.org would still be caught.
NAMESPACES='^https?://www\.w3\.org/(2000/svg|1999/xlink|1999/xhtml)$'

# External policy pages the privacy policy and terms MUST link to (App Store /
# Play require linking each processor's own policy). These are <a href>
# NAVIGATIONS — the browser only loads them when the reader taps, never as a
# page resource — so they cannot leak anything on load. Allowed as EXACT policy
# URLs, not whole hosts, so a resource embed from any of these hosts is still
# caught. The optional `</a` tolerates the grep capturing the closing tag.
POLICY_LINKS='^(https://policies\.google\.com/(privacy|technologies/partner-sites)|https://www\.apple\.com/legal/internet-services/itunes/dev/stdeula/|https://www\.revenuecat\.com/privacy)(</a)?$'

found=$(grep -rEoh "$URL_RE" "$DIST" \
  --include='*.html' --include='*.css' --include='*.js' --include='*.svg' \
  | grep -vE "$ALLOWED" | grep -vE "$NAMESPACES" | grep -vE "$POLICY_LINKS" | sort -u || true)

if [ -n "$found" ]; then
  echo "  FAIL third-party URLs found in built output:"
  echo "$found" | sed 's/^/         /'
  exit 1
fi

echo "  ok   no third-party asset URLs"
