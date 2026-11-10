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
code_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
post_plate() {
  curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"plate\":\"$1\"}" "$BASE/api/cars"
}

# 1. Nginx is up
curl -fsS "$BASE/healthz" >/dev/null || fail "Nginx health endpoint ($BASE/healthz)"
pass "Nginx answers on /healthz"

# 2. Nginx serves the dashboard
curl -fsS -o "$TMP/index.html" "$BASE/" || fail "dashboard page ($BASE/)"
grep -q "Retro Rides" "$TMP/index.html" || fail "dashboard page does not look right"
pass "Dashboard page is served"

# 3. Nginx -> API -> Redis works, and the API seeded the first cars
curl -fsS -o "$TMP/cars.json" "$BASE/api/cars" || fail "GET $BASE/api/cars: is the API running?"
grep -q "BELAIR-55" "$TMP/cars.json" || fail "the starting cars are missing from GET /api/cars"
pass "GET /api/cars works through Nginx and has the starting cars"

# 4. The camera flow: POST a new car, it shows up in GET, DELETE removes it
plate="SMOKE-$RANDOM"
[ "$(post_plate "$plate")" = "201" ] || fail "POST /api/cars should return 201 for $plate"
curl -fsS "$BASE/api/cars" | grep -q "$plate" || fail "$plate is not in GET /api/cars after the POST"
[ "$(post_plate "$plate")" = "409" ] || fail "posting $plate twice should return 409"
pass "POST /api/cars adds a car (201), shows up in GET, duplicate is refused (409)"

# 5. Bad input is refused, unknown cars are 404
[ "$(post_plate '<script>')" = "400" ] || fail "an invalid plate should return 400"
[ "$(code_of -X DELETE "$BASE/api/cars/$plate")" = "204" ] || fail "DELETE of $plate should return 204"
[ "$(code_of -X DELETE "$BASE/api/cars/$plate")" = "404" ] || fail "DELETE of a missing car should return 404"
pass "Invalid plate -> 400, DELETE -> 204, DELETE again -> 404"

# 6. A car photo is served by Nginx
curl -fsS -o "$TMP/photo.png" "$BASE/cars/BELAIR-55.png" || fail "photo download (/cars/BELAIR-55.png)"
[ "$(wc -c < "$TMP/photo.png")" -gt 1000 ] || fail "photo is suspiciously small"
pass "Car photo downloads correctly"

# 7. Security: other HTTP methods are refused, security headers are present
[ "$(code_of -X PUT "$BASE/api/cars")" = "403" ] || fail "PUT /api/cars should be refused with 403"
curl -fsSI "$BASE/" | grep -qi '^content-security-policy:' || fail "Content-Security-Policy header is missing"
pass "PUT is refused (403) and security headers are present"

echo "All checks passed."
