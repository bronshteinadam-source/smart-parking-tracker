#!/bin/sh
# Runs every time the Storage container starts, then hands over to Apache.
#
# First start only: the volume is empty, so we "park" a few classic cars that arrived
# a while ago. File names follow the camera convention:
#
#     YYYYMMDD-HHMMSS_PLATE.png      (time is UTC)
#
# On later starts (for example after `docker compose down` + `up`) the volume already
# has photos, so we do NOT seed again. That is exactly what proves the Volume works.
set -eu

PLATES_DIR="/usr/local/apache2/htdocs/plates"
SEED_DIR="/seed"

mkdir -p "$PLATES_DIR"

if ! ls "$PLATES_DIR"/*.png >/dev/null 2>&1; then
    echo "[storage] Volume is empty - seeding first cars"
    now=$(date +%s)
    # "plate:minutes ago"
    for entry in "BELAIR-55:95" "T-BIRD-58:50" "WOODY-48:25" "MODEL-T-1:8"; do
        plate="${entry%%:*}"
        mins="${entry##*:}"
        t=$((now - mins * 60))
        # BusyBox date (Alpine) understands "@epoch"; the second form is a fallback for other date versions
        ts=$(date -u -d "@$t" +%Y%m%d-%H%M%S 2>/dev/null || date -u -D %s -d "$t" +%Y%m%d-%H%M%S)
        cp "$SEED_DIR/$plate.png" "$PLATES_DIR/${ts}_${plate}.png"
        echo "[storage]   parked $plate (arrived $mins minutes ago)"
    done
else
    echo "[storage] Volume already has photos - keeping them"
fi

exec "$@"
