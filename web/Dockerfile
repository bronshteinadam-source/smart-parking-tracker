# Web server: Nginx. It serves the dashboard and the car photos and forwards /api/ requests to the API.
FROM nginx:1.27-alpine

# Replace the default site with ours
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The dashboard (HTML + CSS + JavaScript)
COPY html/ /usr/share/nginx/html/

EXPOSE 80
# The base image already starts Nginx (CMD ["nginx", "-g", "daemon off;"])
