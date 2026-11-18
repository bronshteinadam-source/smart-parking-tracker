#!/usr/bin/env bash
# Smoke test: האם המערכת שרצה תקינה ומחוברת נכון?
# רץ ב-CI וגם במחשב שלך (Git Bash, macOS, Linux):
#
#     docker compose up -d --wait
#     ./scripts/smoke-test.sh                  # tests http://localhost:8080
#     ./scripts/smoke-test.sh http://localhost:8081   # another address
#
# צריך רק curl. קוד יציאה 0 = כל הבדיקות עברו.
set -euo pipefail                                             # עוצר מיד אם פקודה נכשלת

BASE="${1:-http://localhost:8080}"                            # כתובת המערכת (ברירת מחדל localhost:8080)
TMP="$(mktemp -d)"                                            # תיקייה זמנית לקבצים של הבדיקה
trap 'rm -rf "$TMP"' EXIT                                     # בסוף, בכל מקרה, מוחק את התיקייה הזמנית

pass() { echo "PASS  $1"; }                                   # פונקציה: מדפיסה PASS
fail() { echo "FAIL  $1" >&2; exit 1; }                       # פונקציה: מדפיסה FAIL ויוצאת עם שגיאה
code_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }    # פונקציה: מחזירה רק את קוד ה-HTTP של בקשה
post_plate() {                                                # פונקציה: שולחת POST עם לוחית ומחזירה את קוד ה-HTTP
  curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"plate\":\"$1\"}" "$BASE/api/cars"
}

# 1. Nginx עובד
curl -fsS "$BASE/healthz" >/dev/null || fail "Nginx health endpoint ($BASE/healthz)"  # פונה ל-/healthz של Nginx. אם לא עונה, נכשל
pass "Nginx answers on /healthz"                              # בדיקה 1 עברה

# 2. Nginx מגיש את הדאשבורד
curl -fsS -o "$TMP/index.html" "$BASE/" || fail "dashboard page ($BASE/)"  # מוריד את דף הבית
grep -q "Retro Rides" "$TMP/index.html" || fail "dashboard page does not look right"  # בודק שהדף מכיל את השם Retro Rides
pass "Dashboard page is served"                               # בדיקה 2 עברה

# 3. Nginx -> API -> Redis עובד, וה-API הוסיף את רכבי ההתחלה
curl -fsS -o "$TMP/cars.json" "$BASE/api/cars" || fail "GET $BASE/api/cars: is the API running?"  # קורא את רשימת הרכבים דרך Nginx וה-API
grep -q "BELAIR-55" "$TMP/cars.json" || fail "the starting cars are missing from GET /api/cars"  # בודק שרכב ההתחלה BELAIR-55 קיים
pass "GET /api/cars works through Nginx and has the starting cars"  # בדיקה 3 עברה

# 4. זרימת המצלמה: POST של רכב חדש, הוא מופיע ב-GET, ו-DELETE מוריד אותו
plate="SMOKE-$RANDOM"                                         # לוחית אקראית לבדיקה
[ "$(post_plate "$plate")" = "201" ] || fail "POST /api/cars should return 201 for $plate"  # POST של רכב חדש חייב להחזיר 201
curl -fsS "$BASE/api/cars" | grep -q "$plate" || fail "$plate is not in GET /api/cars after the POST"  # הרכב מופיע ברשימה
[ "$(post_plate "$plate")" = "409" ] || fail "posting $plate twice should return 409"  # POST של אותו רכב שוב חייב להחזיר 409

# בחניון יש 6 מקומות: מוסיפים רכבים עד שה-API אומר לא, ובודקים שהוא עצר על 6.
added=()                                                      # רשימת הרכבים שנוסיף כדי למלא את החניון
code=""                                                       # קוד התשובה האחרון
for i in $(seq 1 20); do                                      # מנסה להוסיף עד 20 רכבים...
  code="$(post_plate "FULL-$i")"                              # שולח POST ושומר את הקוד
  if [ "$code" = "201" ]; then added+=("FULL-$i"); else break; fi  # 201 = נוסף, ממשיכים. אחרת (409) עוצרים
done                                                          # סוף הלולאה
curl -fsS "$BASE/api/cars" -o "$TMP/full.json"                # קורא את הרשימה אחרי שהחניון התמלא
parked="$(grep -o '"parked":[0-9]*' "$TMP/full.json" | cut -d: -f2)"  # שולף את מספר הרכבים שבפנים
for p in ${added[@]+"${added[@]}"}; do curl -fsS -X DELETE "$BASE/api/cars/$p" >/dev/null || true; done  # מנקה: מוחק את כל הרכבים שהוספנו
[ "$code" = "409" ] || fail "a car beyond the 6 spots should be refused with 409, got HTTP $code"  # הרכב שאחרי ה-6 חייב להידחות עם 409
[ "$parked" = "6" ] || fail "the lot should stop at 6 cars, it holds $parked"  # החניון חייב לעצור על 6 רכבים
pass "POST /api/cars adds a car (201), shows up in GET, duplicate and 7th car are refused (409)"  # בדיקה 4 עברה

# 5. קלט לא תקין נדחה, רכב לא קיים מחזיר 404
[ "$(post_plate '<script>')" = "400" ] || fail "an invalid plate should return 400"  # לוחית לא תקינה חייבת להחזיר 400
[ "$(code_of -X DELETE "$BASE/api/cars/$plate")" = "204" ] || fail "DELETE of $plate should return 204"  # מחיקת הרכב מחזירה 204
[ "$(code_of -X DELETE "$BASE/api/cars/$plate")" = "404" ] || fail "DELETE of a missing car should return 404"  # מחיקה שנייה מחזירה 404: כבר אין כזה
pass "Invalid plate -> 400, DELETE -> 204, DELETE again -> 404"  # בדיקה 5 עברה

# 6. תמונת רכב מוגשת על ידי Nginx
curl -fsS -o "$TMP/photo.png" "$BASE/cars/BELAIR-55.png" || fail "photo download (/cars/BELAIR-55.png)"  # מוריד תמונת רכב מ-Nginx
[ "$(wc -c < "$TMP/photo.png")" -gt 1000 ] || fail "photo is suspiciously small"  # התמונה חייבת להיות גדולה מ-1000 בתים
pass "Car photo downloads correctly"                          # בדיקה 6 עברה

# 7. אבטחה: שיטות HTTP אחרות נחסמות, וכותרות האבטחה קיימות
[ "$(code_of -X PUT "$BASE/api/cars")" = "403" ] || fail "PUT /api/cars should be refused with 403"  # PUT חייב להיחסם עם 403
curl -fsSI "$BASE/" | grep -qi '^content-security-policy:' || fail "Content-Security-Policy header is missing"  # בודק שכותרת האבטחה CSP קיימת
pass "PUT is refused (403) and security headers are present"  # בדיקה 7 עברה

echo "All checks passed."                                     # כל הבדיקות עברו
