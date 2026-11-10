#!/usr/bin/env bash
# The Track 2 proof: data in Redis survives `docker compose down` + `up`,
# because Redis writes it to the Volume.   Run from the repository root.
#
#     docker compose up -d --wait
#     ./scripts/persistence-test.sh
set -euo pipefail

BASE="${1:-http://localhost:8080}"
plate="KEEP-$RANDOM"

curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"plate\":\"$plate\"}" "$BASE/api/cars" >/dev/null
echo "1. Added $plate"

docker compose down                         # NO -v: the Volume stays
echo "2. docker compose down  (containers are gone)"
docker compose up -d --wait --wait-timeout 90
echo "3. docker compose up    (new containers)"

if curl -fsS "$BASE/api/cars" | grep -q "$plate"; then
  echo "PASS  $plate survived the restart: Redis + Volume work."
else
  echo "FAIL  $plate is gone after the restart" >&2
  exit 1
fi
curl -fsS -X DELETE "$BASE/api/cars/$plate" >/dev/null || true
