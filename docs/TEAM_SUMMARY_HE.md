<div dir="rtl" align="right">

# תקציר לצוות: Retro Rides (Smart Parking Tracker)

קראו את זה לפני שאתם נוגעים בקוד. 5 דקות והכל ברור.

## מה בנינו?

חניון חכם **לרכבי אספנות**. מצלמת IoT בכניסה שולחת ל-API את לוחית הרישוי של כל רכב. השומר פותח לוח בקרה (דאשבורד) ורואה בזמן אמת את כל הרכבים בחניון, כמה זמן כל אחד חונה, וכמה הוא חייב.

בחרנו **מסלול 2 (Full Stack DevOps)**: שרת Web, שרת API ומסד נתונים Redis, הכל עם Docker Compose. (בגרסה 1 עשינו מסלול 1 עם Apache. עברנו למסלול 2 כי הכיתה שלנו יד. פירוט ב-`docs/track2-changes.md`.)

## איך זה עובד? (4 שלבים)

1. המצלמה שולחת בקשת **POST** ל-`/api/cars` עם לוחית הרישוי, למשל `{"plate":"MUSTANG-65"}`.
2. שרת ה-**API** (`api`, כתוב ב-Python/Flask) בודק שהלוחית תקינה ושומר את הרכב ב-**Redis**, יחד עם שעת הכניסה.
3. **Redis** הוא מסד הנתונים. הוא כותב כל שינוי לקובץ בתוך **Volume** של Docker, ולכן גם אם מוחקים את כל הקונטיינרים, הרכבים נשארים.
4. שרת **Nginx** (`web`) מציג את הדאשבורד. ה-JavaScript שלו עושה `fetch` ל-`/api/cars` כל 3 שניות ובונה כרטיס לכל רכב. רכב חדש = כרטיס חדש על המסך, בלי רענון. Nginx גם מעביר (proxy) את קריאות ה-API פנימה.

## מה יש בפרויקט?

| קובץ / תיקייה | מה זה עושה |
|---|---|
| `docker-compose.yml` | מגדיר את כל המערכת: 3 שרתים, Volume אחד, רשת אחת |
| `web/` | Dockerfile + `nginx.conf` + הדאשבורד (HTML, CSS, JS) + תמונות הרכבים |
| `api/` | שרת ה-API: Dockerfile + `app.py` (4 נקודות קצה) |
| Redis | לא כתבנו לו Dockerfile: משתמשים בתמונה הרשמית `redis:7-alpine` |
| `scripts/camera.sh` / `camera.ps1` | "מצלמה מזויפת": שולחת POST עם רכב חדש |
| `scripts/smoke-test.sh` | בדיקה אוטומטית שהמערכת עובדת (7 בדיקות). אותו סקריפט רץ גם ב-CI |
| `scripts/persistence-test.sh` | מוכיח אוטומטית שהמידע שורד `down` ו-`up`. רץ גם ב-CI |
| `.github/workflows/ci.yml` | CI/CD: בדיקת Docker Build בכל Push + פרסום ל-GitHub Container Registry (בונוס, ל-amd64 ול-arm64) |
| `README.md`, `ARCHITECTURE.md`, `AI_USAGE.md` | התיעוד שהמטלה דורשת |
| `docs/` | תסריט ל-Demo, הכנה ל-Code Review, רשימת משימות, מה השתנה ממסלול 1 |

## מה הרכיב האישי שלנו?

חניון רכבי אספנות בסגנון שנות ה-50: הודעה מצחיקה לכל רכב שנכנס, מחיר לפי שעות (12 ש"ח לשעה שהתחילה, 10 דקות ראשונות חינם), התראת **חניון מלא** (6 מקומות), כפתור **שחרור רכב** (שולח DELETE ל-API), **Dark Mode**, צפירה אופציונלית, ו-**Easter Egg**: מקלידים `vroom` בדאשבורד ורכב חוצה את המסך.

## איך מריצים? (3 פקודות)

```
docker compose up --build        # מפעיל הכל, ואז נכנסים ל-http://localhost:8080
.\scripts\camera.ps1             # (בטרמינל שני) רכב חדש נכנס לחניון
docker compose down              # ואז: docker compose up -d  ← הרכבים עדיין שם!
```

הפקודה `docker compose down -v` מוחקת גם את ה-Volume, וזה היחיד שמאפס את החניון.

## מה כל אחד מאיתנו חייב לעשות

- [ ] להריץ את הפרויקט אצלו במחשב לפחות פעם אחת.
- [ ] לעשות **לפחות 2 commits** משלו ב-GitHub (המטלה דורשת יותר מ-commit אחד מכל איש צוות). חלוקה מוצעת נמצאת ב-`docs/TEAM_CHECKLIST.md`.
- [ ] להבין **כל** קובץ, לא רק את אלה שהוא העלה. בזמן ה-Code Review המרצה שואל על ה-Dockerfile, ה-Compose וה-Workflow, ושואל כל אחד.
- [ ] להוסיף ל-`AI_USAGE.md` את הפרומפטים האמיתיים שלו.
- [ ] לתרגל את ה-Demo פעם אחת עם שעון (5-10 דקות). התסריט ב-`docs/DEMO_SCRIPT.md`.

## 8 שאלות Code Review שכדאי לדעת לענות עליהן

1. **למה אין `ports` ל-api ול-redis?** כדי שרק Nginx (באותה רשת) יגיע אליהם, מבחוץ אי אפשר.
2. **איך Nginx מוצא את ה-API?** לפי שם השירות `api`. ה-DNS הפנימי של Docker מתרגם אותו ל-IP. אותו דבר ה-API מול `redis`.
3. **מה ההבדל בין `down` ל-`down -v`?** `down` מוחק קונטיינרים ורשת, אבל ה-Volume נשאר. `-v` מוחק גם אותו.
4. **למה Redis צריך `--appendonly yes`?** בלי זה Redis שומר לדיסק רק תמונת מצב כל כמה דקות. עם AOF הוא כותב כל שינוי לקובץ ב-`/data` (ה-Volume).
5. **למה `depends_on` עם `service_healthy`?** `depends_on` רגיל מחכה רק שהקונטיינר *יתחיל*, ה-healthcheck מוודא שהוא באמת *מוכן*. אצלנו: web מחכה ל-api, api מחכה ל-redis.
6. **מה זה `GITHUB_TOKEN`?** טוקן אוטומטי שנוצר לכל הרצה של ה-Workflow. משתמשים בו להתחברות ל-`ghcr.io` בלי לשמור סיסמה. צריך `permissions: packages: write`.
7. **איך נוצרים תגיות הגרסה?** `docker/metadata-action`. אם דוחפים תג `v2.0.0` מקבלים `2.0.0` ו-`2.0`, ובנוסף `sha-<commit>`, `build-<מספר>` ו-`latest` ל-main.
8. **למה אין עוד התחלה כפולה של 4 הרכבים אחרי `down` ו-`up`?** ה-API מכניס אותם רק אם הדגל `parking:seeded` לא קיים ב-Redis, והדגל נשמר ב-Volume.

תשובות מלאות ומפורטות: `docs/CODE_REVIEW_PREP.md` (באנגלית, בנוי כך שאפשר לקרוא בקול רם).

## הודעה מוכנה לשליחה בקבוצה

> חבר'ס, הפרויקט של ה-docker-compose כמעט גמור (עברנו למסלול 2: Nginx + API + Redis, חניון רכבי אספנות). נשאר רק לכל אחד: 1) להריץ אצלו `docker compose up --build`, 2) לעשות 2 commits משלו ב-GitHub, 3) לקרוא את `docs/TEAM_SUMMARY_HE.md`, `docs/track2-changes.md` ואת `docs/CODE_REVIEW_PREP.md` כדי שנדע לענות ב-Code Review. את ה-Demo נתרגל פעם אחת יחד.

</div>
