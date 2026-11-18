# בחירת בסיס: תמונת Python 3.12 קלילה ויציבה (Alpine)
FROM python:3.12-alpine

# הגדרת סביבה: מניעת קבצי זבל (.pyc) והצגת לוגים מיד במסך
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# קביעת תיקיית העבודה הראשית בתוך הקונטיינר
WORKDIR /app

# העתקת קובץ התלויות והתקנתן (נשמר ב-Cache כדי לחסוך זמן בבניות הבאות)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# העתקת קוד ה-API עצמו לתוך הקונטיינר
COPY app.py .

# אבטחה: יצירת משתמש רגיל (לא root) והרצת האפליקציה דרכו
RUN adduser -D -u 10001 apiuser
USER 10001

# תיעוד בלבד: ציון שהשרת מאזין לפורט 8000 פנימית
EXPOSE 8000

# הפעלת ה-API בפועל בעזרת שרת Gunicorn עם 2 עובדים (Workers)
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--access-logfile", "-", "app:app"]
