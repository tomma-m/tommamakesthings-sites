#!/usr/bin/env bash
set -euo pipefail
BASE="https://sidelinehero.tommamakesthings.com"
fail=0

check() {  # description, expected-status, path
  local got
  got=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$3")
  if [ "$got" = "$2" ]; then echo "  ok   $1 ($got)"
  else echo "  FAIL $1 — expected $2, got $got"; fail=1; fi
}

check "home"              200 "/"
check "privacy"           200 "/privacy"
check "support"           200 "/support"
check "missing page 404s" 404 "/definitely-not-a-page"

echo "checking for third-party requests..."
if grep -rEoh 'https?://[^"'"'"' )]+' sites/sidelinehero/dist --include='*.html' --include='*.css' \
   | grep -vE '^https://(sidelinehero\.tommamakesthings\.com|formspree\.io)' \
   | sort -u | grep .; then
  echo "  FAIL third-party URLs found in built output"; fail=1
else
  echo "  ok   no third-party asset URLs"
fi

echo "checking the privacy policy actually rendered..."
if curl -sS "$BASE/privacy" | grep -q 'all your data stays on your device'; then
  echo "  ok   app policy present"
else
  echo "  FAIL app policy missing from /privacy"; fail=1
fi

exit $fail
