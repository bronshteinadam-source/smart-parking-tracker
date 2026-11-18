# תמונת הבסיס: Python קטן (alpine), בגרסה קבועה כדי שכל בנייה תהיה זהה
FROM python:3.12-alpine

# משתני סביבה: לא ליצור קבצי .pyc, והלוגים מודפסים מיד (בלי buffer)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# תיקיית העבודה בתוך הקונטיינר
WORKDIR /app

# קודם מעתיקים רק את רשימת הספריות ומתקינים אותן. כך Docker שומר את השלב ב-cache
# ולא מתקין מחדש בכל שינוי בקוד
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# רק עכשיו מעתיקים את קוד ה-API
COPY app.py .

# רצים כמשתמש רגיל ולא כ-root: יוצרים משתמש ועוברים אליו
RUN adduser -D -u 10001 apiuser
USER 10001

# תיעוד: ה-API מקשיב לפורט 8000 (הפורט לא נפתח החוצה)
EXPOSE 8000

# הפקודה שמפעילה את ה-API: gunicorn (שרת אמיתי) עם 2 תהליכים, על פורט 8000, והקובץ app והאובייקט app
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--access-logfile", "-", "app:app"]
