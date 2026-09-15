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
check "faq"               200 "/faq"
check "missing page 404s" 404 "/definitely-not-a-page"

echo "checking for third-party requests..."
# Also run as its own workflow step BEFORE the S3 sync, so it gates the deploy
# rather than reporting on one that already happened. Repeated here so a local
# `./scripts/smoke.sh` still enforces everything.
if ! ./scripts/check-third-party.sh; then fail=1; fi

echo "checking the privacy policy actually rendered..."
privacy=$(curl -sS "$BASE/privacy")

if grep -q 'all your data stays on your device' <<<"$privacy"; then
  echo "  ok   app policy present"
else
  echo "  FAIL app policy missing from /privacy"; fail=1
fi

if grep -q 'This website' <<<"$privacy"; then
  echo "  ok   website policy present"
else
  echo "  FAIL website policy missing from /privacy"; fail=1
fi

# The two halves must stay in separate, distinctly-styled sections — a reader who
# merges them cannot tell which promise covers the app and which the website.
if grep -q 'class="policy policy-site"' <<<"$privacy"; then
  echo "  ok   website policy is in its own section"
else
  echo "  FAIL website policy section wrapper missing from /privacy"; fail=1
fi

# The app policy claimed a "Clear All Data" setting that does not exist.
if grep -q 'Clear All Data' <<<"$privacy"; then
  echo "  FAIL /privacy still names a 'Clear All Data' control the app does not have"; fail=1
else
  echo "  ok   no phantom 'Clear All Data' control"
fi

echo "checking the FAQ rendered both halves..."
faq=$(curl -sS "$BASE/faq")
for id in getting-started is-it-free; do
  if grep -q "id=\"$id\"" <<<"$faq"; then echo "  ok   faq has #$id"
  else echo "  FAIL faq is missing #$id"; fail=1; fi
done

exit $fail
