#!/usr/bin/env bash
# Pretend to be the IoT camera at the gate: a new car arrives, and the camera tells the API
# (POST /api/cars). The API stores it in Redis. The dashboard shows it within ~3 seconds.
#
#   ./scripts/camera.sh              a random car that is not already in the lot
#   ./scripts/camera.sh MUSTANG-65   a specific car (any plate; photos exist for the names in --list)
#   ./scripts/camera.sh --list       show the cars that have a photo
#
# The stack must be running first:  docker compose up -d --build
# Another address:  API_BASE=http://localhost:8081 ./scripts/camera.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${API_BASE:-http://localhost:8080}"
PHOTOS_DIR="web/html/cars"

if [ "${1:-}" = "--list" ]; then
  ls "$PHOTOS_DIR" | sed 's/\.png$//'
  exit 0
fi

if [ -n "${1:-}" ]; then
  plate="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
else
  # cars already parked, asked from the API
  parked=$(curl -fsS "$BASE/api/cars" | grep -o '"plate":"[A-Z0-9-]*"' | cut -d'"' -f4 || true)
  candidates=()
  for f in "$PHOTOS_DIR"/*.png; do
    p=$(basename "$f" .png)
    if ! printf '%s\n' "$parked" | grep -qx "$p"; then candidates+=("$p"); fi
  done
  if [ "${#candidates[@]}" -eq 0 ]; then
    echo "Every sample car is already in the lot. Release one on the dashboard first." >&2
    exit 1
  fi
  plate="${candidates[$((RANDOM % ${#candidates[@]}))]}"
fi

code=$(curl -s -o /tmp/camera.out -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d "{\"plate\":\"$plate\"}" "$BASE/api/cars" || true)
case "$code" in
  201) echo "Camera: spotted $plate -> sent to the API (201 Created)" ;;
  409) echo "Camera: $plate was refused (409): $(grep -o '"error":"[^"]*"' /tmp/camera.out | cut -d'"' -f4)" >&2; exit 1 ;;
  400) echo "Camera: the API rejected the plate '$plate' (400)" >&2; exit 1 ;;
  *)   echo "Camera: cannot reach the API at $BASE (HTTP $code). Is the stack running?" >&2; exit 1 ;;
esac
