# שרת האתר: Nginx. מגיש את הדאשבורד ואת תמונות הרכבים, ומעביר בקשות /api/ ל-API.
FROM nginx:1.27-alpine

# מחליפים את אתר ברירת המחדל בהגדרות שלנו
COPY nginx.conf /etc/nginx/conf.d/default.conf

# הדאשבורד (HTML + CSS + JavaScript)
COPY html/ /usr/share/nginx/html/

# תיעוד: Nginx מקשיב לפורט 80. החשיפה ל-8080 נעשית ב-docker-compose.yml
EXPOSE 80
# תמונת הבסיס כבר מפעילה את Nginx בעצמה (CMD ["nginx", "-g", "daemon off;"])
