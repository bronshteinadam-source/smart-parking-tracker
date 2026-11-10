# Notes B - Dockerfiles and nginx.conf

The web Dockerfile starts from the small nginx:1.27-alpine image, copies our nginx.conf over the default config, and copies the dashboard files (HTML, CSS, JS) into the folder Nginx serves.
The storage Dockerfile starts from httpd:2.4-alpine (Apache), adds our plates.conf, the sample photos and the entrypoint.sh script.
It also marks the photos folder as a VOLUME, so the car photos stay saved even if the container is deleted.
In nginx.conf, the path / serves the dashboard, and the path /plates/ is forwarded to the storage container, so Nginx itself does not keep any photos.
Because the browser only talks to Nginx, Apache does not need an open port and there are no CORS problems.
Nginx finds the storage container by its name using Docker's DNS (127.0.0.11) and checks it again every 10 seconds, so it keeps working if the storage container gets a new IP.
For safety, /plates/ only allows GET and HEAD requests, and Nginx adds security headers and hides its version.
The /healthz path just returns "ok", and Docker uses it to check that the web container is healthy.
