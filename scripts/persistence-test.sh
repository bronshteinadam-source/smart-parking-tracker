#!/usr/bin/env bash
# ההוכחה למסלול 2: מידע ב-Redis שורד docker compose down ואחריו up,
# כי Redis כותב אותו ל-Volume.   להריץ מתיקיית הפרויקט.
#
#     docker compose up -d --wait
#     ./scripts/persistence-test.sh
set -euo pipefail                                             # עוצר מיד אם פקודה נכשלת

BASE="${1:-http://localhost:8080}"                            # כתובת המערכת (ברירת מחדל localhost:8080)
plate="KEEP-$RANDOM"                                          # לוחית אקראית לבדיקה

curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"plate\":\"$plate\"}" "$BASE/api/cars" >/dev/null  # שולח POST ל-API: מוסיף את הרכב
echo "1. Added $plate"                                        # הדפסה למסך

docker compose down                                           # מוריד את הקונטיינרים. בלי -v, לכן ה-Volume נשאר
echo "2. docker compose down  (containers are gone)"          # הדפסה למסך
docker compose up -d --wait --wait-timeout 90                 # מרים קונטיינרים חדשים וממתין שיהיו healthy
echo "3. docker compose up    (new containers)"               # הדפסה למסך

if curl -fsS "$BASE/api/cars" | grep -q "$plate"; then        # שואל את ה-API ומחפש את הלוחית ברשימה
  echo "PASS  $plate survived the restart: Redis + Volume work."  # אם הלוחית שם: הבדיקה עברה
else                                                          # אחרת...
  echo "FAIL  $plate is gone after the restart" >&2           # ...הלוחית נעלמה: הבדיקה נכשלה
  exit 1                                                      # יציאה עם שגיאה, ה-CI ייכשל
fi
curl -fsS -X DELETE "$BASE/api/cars/$plate" >/dev/null || true  # מנקה: מוחק את רכב הבדיקה
