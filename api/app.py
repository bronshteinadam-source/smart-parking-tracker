"""Retro Rides - ה-API של החניון.

POST   /api/cars          המצלמה מדווחת על לוחית    -> 201 / 400 / 409 (כבר בפנים, או החניון מלא)
GET    /api/cars          הדאשבורד שואל מי בפנים   -> 200 JSON
DELETE /api/cars/<plate>  שחרור רכב                -> 204 / 404
GET    /api/health        לבדיקת התקינות של Docker

הנתונים נמצאים ב-Redis (ונשמרים ב-Volume בעזרת AOF):
  parking:cars     hash   לוחית -> שעת כניסה (שניות unix, UTC)
  parking:total    int    כמה רכבים נכנסו מאז ההתחלה
  parking:seeded   flag   4 רכבי ההתחלה כבר נוספו פעם אחת
"""
# ייבוא הספריות שהקוד צריך
import os                                                     # גישה למשתני סביבה (כמו REDIS_HOST)
import re                                                     # ביטויים רגולריים (לבדיקת לוחית)
import time                                                   # שעה נוכחית

import redis                                                  # הלקוח שמדבר עם Redis
from flask import Flask, jsonify, request                     # Flask: הספרייה שבונה את ה-API

# הגדרות: מספר המקומות, כלל ללוחית תקינה, שמות המפתחות ב-Redis ו-4 רכבי ההתחלה
CAPACITY = 6                                                  # מספר המקומות בחניון
PLATE_RE = re.compile(r"^[A-Z0-9-]{2,12}$")                   # לוחית תקינה: אותיות גדולות באנגלית, ספרות ומקף, באורך 2 עד 12
CARS = "parking:cars"                                         # מפתח ב-Redis (hash): לוחית ← שעת כניסה. מי בחניון עכשיו
TOTAL = "parking:total"                                       # מפתח ב-Redis: כמה רכבים נכנסו מאז ההתחלה
SEEDED = "parking:seeded"                                     # מפתח ב-Redis: דגל שאומר ש-4 רכבי ההתחלה כבר נוספו
# לוחית -> לפני כמה דקות נכנס
STARTERS = {"BELAIR-55": 95, "T-BIRD-58": 50, "WOODY-48": 25, "MODEL-T-1": 8}  # 4 רכבי ההתחלה, ולפני כמה דקות כל אחד נכנס

# יצירת אפליקציית ה-API והחיבור ל-Redis
app = Flask(__name__)                                         # יוצר את אפליקציית ה-API
db = redis.Redis(                                             # החיבור ל-Redis
    host=os.environ.get("REDIS_HOST", "redis"),               # הכתובת: מגיעה מ-REDIS_HOST ב-Compose (ברירת מחדל redis)
    port=int(os.environ.get("REDIS_PORT", "6379")),           # הפורט של Redis
    decode_responses=True,                                    # מקבל טקסט רגיל ולא bytes
    socket_connect_timeout=2,                                 # אם אי אפשר להתחבר תוך 2 שניות, נכשל
    socket_timeout=2,                                         # אם Redis לא עונה תוך 2 שניות, נכשל
)

# "תוסיף רכב אלא אם הוא כבר בפנים או שהחניון מלא", כצעד אחד אטומי בתוך Redis (סקריפט Lua).
# שתי מצלמות באותו רגע לא יכולות להכניס רכב שביעי. הסקריפט (שורות 41-45): בודק אם הלוחית
# קיימת (0), בודק אם יש כבר 6 (-1), מוסיף לחניון, ומגדיל את מונה הכניסות (1).
ADD_CAR = db.register_script("""
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[2]) then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('INCR', KEYS[2])
return 1
""")


# הוספת 4 רכבי ההתחלה, פעם אחת בלבד
def seed_once():                                              # מוסיף את רכבי ההתחלה, רק בפעם הראשונה
    """מוסיף את רכבי ההתחלה רק בפעם הראשונה (הדגל נשמר גם הוא ב-Redis)."""
    if db.set(SEEDED, "1", nx=True):                          # מנסה לסמן את הדגל. nx=True: רק אם לא קיים, לכן מצליח רק בפעם הראשונה
        now = int(time.time())                                # השעה עכשיו, בשניות
        pipe = db.pipeline()                                  # אוסף פקודות ושולח אותן ל-Redis ביחד
        for plate, minutes in STARTERS.items():               # עובר על רכבי ההתחלה
            pipe.hset(CARS, plate, now - minutes * 60)        # שומר את הלוחית עם שעת כניסה (עכשיו פחות הדקות)
        pipe.incrby(TOTAL, len(STARTERS))                     # מגדיל את מונה הכניסות ב-4
        pipe.execute()                                        # שולח הכל ל-Redis


# בניית נתוני החניון לדאשבורד, ממוינים מהחדש לישן
def snapshot():                                               # בונה את התשובה (JSON) שהדאשבורד מקבל
    cars = [                                                  # רשימת הרכבים
        {"plate": p, "arrived_at": int(t)}                    # רכב אחד: לוחית ושעת כניסה
        for p, t in db.hgetall(CARS).items()                  # קורא את כל הרכבים מה-hash ב-Redis
    ]
    cars.sort(key=lambda c: c["arrived_at"], reverse=True)    # ממיין מהחדש לישן
    return {                                                  # התשובה:
        "capacity": CAPACITY,                                 # מספר המקומות
        "parked": len(cars),                                  # כמה רכבים בפנים כרגע
        "total_entered": int(db.get(TOTAL) or 0),             # כמה נכנסו בסך הכל (מ-Redis)
        "cars": cars,                                         # רשימת הרכבים
    }


# בדיקת תקינות: האם ה-API וה-Redis עובדים (Docker קורא לזה)
@app.get("/api/health")                                       # נקודת קצה לבדיקת תקינות. Docker קורא לה ב-healthcheck
def health():                                                 # הפונקציה שרצה
    try:                                                      # מנסה...
        db.ping()                                             # בודק ש-Redis עונה
        seed_once()                                           # מוודא שרכבי ההתחלה קיימים
    except redis.RedisError:                                  # אם Redis לא זמין...
        return jsonify(status="redis unavailable"), 503       # ...מחזיר 503: השירות לא זמין. הבדיקה נכשלת
    return jsonify(status="ok")                               # הכל תקין (200)


# הצגת כל הרכבים שנמצאים בחניון
@app.get("/api/cars")                                         # הדאשבורד שואל: מי בחניון?
def list_cars():                                              # הפונקציה שרצה
    try:
        seed_once()                                           # מוודא שרכבי ההתחלה קיימים
        return jsonify(snapshot())                            # מחזיר את הרשימה כ-JSON
    except redis.RedisError:                                  # אם Redis לא זמין...
        return jsonify(error="database unavailable"), 503     # ...מחזיר 503


# קליטת רכב חדש לחניון: בודק לוחית, כניסה כפולה וחניון מלא
@app.post("/api/cars")                                        # המצלמה מדווחת על רכב שנכנס
def add_car():                                                # הפונקציה שרצה
    body = request.get_json(silent=True) or {}                # קורא את גוף ה-JSON (אם הוא לא תקין, מקבל אובייקט ריק)
    plate = str(body.get("plate", "")).strip().upper()        # לוקח את הלוחית, מנקה רווחים והופך לאותיות גדולות
    if not PLATE_RE.match(plate):                             # בודק שהלוחית תקינה
        return jsonify(error="plate must be 2-12 chars: A-Z, 0-9, dash"), 400  # לוחית לא תקינה: 400 (בקשה שגויה)
    try:
        seed_once()                                           # מוודא שרכבי ההתחלה קיימים
        result = ADD_CAR(keys=[CARS, TOTAL], args=[plate, CAPACITY, int(time.time())])  # מריץ את סקריפט ה-Lua ב-Redis. מחזיר 1 (נוסף), 0 (כבר בפנים) או -1 (מלא)
        if result == 0:                                       # הרכב כבר בחניון...
            return jsonify(error="car is already in the lot"), 409  # ...409: התנגשות, הוא כבר בפנים
        if result == -1:                                      # החניון מלא...
            return jsonify(error=f"lot is full ({CAPACITY} spots): release a car first"), 409  # ...409: אין מקום (6 מקומות). כאן נדחה הרכב השביעי
        return jsonify(plate=plate, **snapshot()), 201        # הצליח: 201 (נוצר)
    except redis.RedisError:                                  # אם Redis לא זמין...
        return jsonify(error="database unavailable"), 503     # ...503


# הוצאת רכב מהחניון
@app.delete("/api/cars/<plate>")                              # שחרור רכב
def release_car(plate):                                       # הפונקציה שרצה
    plate = plate.upper()                                     # הופך לאותיות גדולות
    if not PLATE_RE.match(plate):                             # בודק שהלוחית תקינה
        return jsonify(error="bad plate"), 400                # לוחית לא תקינה: 400
    try:
        if db.hdel(CARS, plate) == 0:                         # מוחק את הרכב מה-hash. מחזיר 0 אם לא היה כזה
            return jsonify(error="no such car"), 404          # אין רכב כזה: 404
        return "", 204                                        # נמחק: 204 (הצליח, אין מה להחזיר)
    except redis.RedisError:                                  # אם Redis לא זמין...
        return jsonify(error="database unavailable"), 503     # ...503
