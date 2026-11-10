#!/usr/bin/env bash
# Pretend to be the IoT camera at the gate: a new car arrives and its photo is saved
# on the Apache storage server (inside the Volume). The dashboard shows it within ~3 seconds.
#
#   ./scripts/camera.sh              a random car that is not already in the lot
#   ./scripts/camera.sh MUSTANG-65   a specific car (a file name from camera-samples/, without .png)
#   ./scripts/camera.sh --list       show available cars
#
# The stack must be running first:  docker compose up -d --build
set -euo pipefail
cd "$(dirname "$0")/.."

SAMPLES_DIR="camera-samples"
LOT_DIR="/usr/local/apache2/htdocs/plates"

if [ "${1:-}" = "--list" ]; then
  ls "$SAMPLES_DIR" | sed 's/\.png$//'
  exit 0
fi

if [ -n "${1:-}" ]; then
  plate="$1"
  if [ ! -f "$SAMPLES_DIR/$plate.png" ]; then
    echo "No such car: $plate  (try: ./scripts/camera.sh --list)" >&2
    exit 1
  fi
else
  # cars already parked (strip the timestamp and extension from the file names)
  parked=$(docker compose exec -T storage ls "$LOT_DIR" | sed -E 's/^[0-9]{8}-[0-9]{6}_//; s/\.png\r?$//')
  candidates=()
  for f in "$SAMPLES_DIR"/*.png; do
    p=$(basename "$f" .png)
    if ! printf '%s\n' "$parked" | grep -qx "$p"; then candidates+=("$p"); fi
  done
  if [ "${#candidates[@]}" -eq 0 ]; then
    echo "Every sample car is already in the lot. Release the volume with: docker compose down -v" >&2
    exit 1
  fi
  plate="${candidates[$((RANDOM % ${#candidates[@]}))]}"
fi

name="$(date -u +%Y%m%d-%H%M%S)_${plate}.png"
docker compose cp "$SAMPLES_DIR/$plate.png" "storage:$LOT_DIR/$name"
echo "Camera: spotted $plate -> saved as $name"
