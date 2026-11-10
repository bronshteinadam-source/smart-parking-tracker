#!/usr/bin/env bash
# Smoke test: is the running stack healthy and wired correctly?
# Used by the CI pipeline AND runnable on your own computer (Git Bash, macOS, Linux):
#
#     docker compose up -d --wait
#     ./scripts/smoke-test.sh                  # tests http://localhost:8080
#     ./scripts/smoke-test.sh http://localhost:8081   # another address
#
# It only needs curl. Exit code 0 = all checks passed.
set -euo pipefail

BASE="${1:-http://localhost:8080}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1" >&2; exit 1; }

# 1. Nginx is up
curl -fsS "$BASE/healthz" >/dev/null || fail "Nginx health endpoint ($BASE/healthz)"
pass "Nginx answers on /healthz"

# 2. Nginx serves the dashboard
curl -fsS -o "$TMP/index.html" "$BASE/" || fail "dashboard page ($BASE/)"
grep -q "Retro Rides" "$TMP/index.html" || fail "dashboard page does not look right"
pass "Dashboard page is served"

# 3. Nginx -> Apache proxy works, and Apache seeded the first cars into the Volume
curl -fsS -o "$TMP/listing.html" "$BASE/plates/" || fail "photo listing ($BASE/plates/): is Apache running?"
grep -q "BELAIR-55" "$TMP/listing.html" || fail "the starting cars are missing from the listing"
pass "Apache listing is reachable through Nginx and has the starting cars"

# 4. A photo can be downloaded through the proxy
# (the name shows up twice per row, as link and as text, so keep only the first match)
photo="$(grep -o '[0-9]\{8\}-[0-9]\{6\}_BELAIR-55\.png' "$TMP/listing.html" | sed -n 1p)"
curl -fsS -o "$TMP/photo.png" "$BASE/plates/$photo" || fail "photo download ($photo)"
[ "$(wc -c < "$TMP/photo.png")" -gt 1000 ] || fail "photo is suspiciously small"
pass "Photo $photo downloads correctly"

# 5. The public side is read-only: uploads and deletes through the proxy are refused
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/plates/")"
[ "$code" = "403" ] || fail "POST to /plates/ should be refused with 403 but got $code"
pass "POST to /plates/ is refused (403)"

# 6. Security headers are present
curl -fsSI "$BASE/" | grep -qi '^content-security-policy:' || fail "Content-Security-Policy header is missing"
pass "Security headers are present"

echo "All checks passed."
