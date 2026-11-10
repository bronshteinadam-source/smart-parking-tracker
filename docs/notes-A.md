# Notes - A (docker-compose and the Volume)

Our docker-compose.yml runs two services: "web" (Nginx, shows the dashboard) and "storage" (Apache, keeps the license plate photos).
Only "web" opens a port to the outside (8080), so the user goes to http://localhost:8080. "storage" has no ports on purpose, so nobody outside can reach it directly.
Both services are on a private network called parking-net, so Nginx can talk to Apache just by using the name "storage".
Thanks to depends_on with service_healthy, Nginx starts only after the healthcheck shows that Apache is really ready, not just started.

## The Volume
The photos are saved in a named Volume called plates-data, which lives outside the container.
That is why after "docker compose down" and "up" again, the cars and their parking time are still there.
Only "docker compose down -v" deletes the Volume and resets the lot back to the 4 starting cars.
To run everything we use one command: docker compose up --build.
