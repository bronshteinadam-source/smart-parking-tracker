# Architectural decisions

Each decision: what we chose, why, and what the alternative would have been.

## 1. Three containers, one job each

`web` (Nginx) serves the dashboard. `api` (Flask) holds the rules (is the plate valid? is the car already in?). `redis` only stores data. This is the micro-services idea from the assignment: each service can be rebuilt, restarted or replaced without touching the others. For example we could replace Flask with Node.js and the dashboard and the database would not notice, as long as the endpoints stay the same.

## 2. Nginx is a reverse proxy for the API

`location /api/ { proxy_pass http://api:8000; }`

- The browser and the camera talk to **one** address (`localhost:8080`). No CORS configuration is needed because everything is the same origin.
- The `api` and `redis` services have **no published port**. They are reachable only from inside the Docker network. Smaller attack surface.
- `api` is a hostname that Docker's built-in DNS resolves on the Compose network. We never hard-code an IP address.

Alternative: publish the API on port 5000 and let the browser call it directly. That needs CORS headers and exposes a second port.

## 3. Redis with a Volume (AOF persistence)

`redis-server --appendonly yes` and `redis-data:/data`

By default Redis keeps data in memory. With `--appendonly yes` it also writes every change to an append-only file (AOF) in `/data`, and the Volume keeps `/data` alive when the container is removed. When Redis starts again it replays the file and has all cars back. Only `docker compose down -v` removes the Volume. That is exactly what the demo needs to prove.

Alternatives: RDB snapshots (the default) save only every few minutes, so the last changes can be lost; a bind mount (`./data:/data`) depends on the host's folder layout and permissions, and behaves differently on Windows. A named Volume works the same on every machine.

## 4. The data model in Redis

| Key | Type | Meaning |
|---|---|---|
| `parking:cars` | hash | plate -> arrival time (unix seconds, UTC) |
| `parking:total` | integer | how many cars entered, ever |
| `parking:seeded` | flag | the 4 starter cars were already added |

A hash gives us the rules for free: `HSETNX` adds a plate only if it is not there (a second POST of the same plate returns `409`, even if two requests arrive at the same moment), `HDEL` removes it, `HGETALL` lists everyone.

The arrival time is stored as unix seconds in UTC, so the camera, the server and the browser never disagree about time zones. The browser calculates "parked for" and the price from it.

## 5. A small, validated API

- `POST /api/cars`, `GET /api/cars`, `DELETE /api/cars/<plate>`, `GET /api/health`.
- Input is never trusted: the plate must match `^[A-Z0-9-]{2,12}$` (it is upper-cased first), otherwise `400`. The dashboard also re-checks what it receives and writes text with `textContent` (never `innerHTML`), so a strange plate cannot inject HTML or script.
- Status codes carry meaning: `201` created, `409` duplicate, `400` bad input, `404` unknown car, `204` released, `503` when Redis is down.
- `gunicorn` (a real WSGI server) with 2 workers, not Flask's development server. The container runs as a normal user (`apiuser`), not root.

## 6. `depends_on` with a health check

Start order: `web` waits for `api` to be healthy, and `api` waits for `redis` to be healthy. Plain `depends_on` only waits for the container to *start*; a health check makes it wait until the service really answers: `redis-cli ping`, `GET /api/health` (which also pings Redis) and `/healthz` in Nginx.

The health checks call `127.0.0.1`, not `localhost`. In Alpine, `localhost` can resolve to the IPv6 address `::1` first, and a server that listens only on IPv4 then looks "unhealthy" even though it works.

## 6b. Nginx re-resolves the name `api`

`proxy_pass` with a hostname normally resolves the name once, when Nginx starts. If the `api` container is later recreated (for example `docker compose up -d --build api`) it gets a new IP, and Nginx would keep calling the old one and answer 502. So `nginx.conf` uses `resolver 127.0.0.11` (Docker's embedded DNS) and puts the name in a variable (`set $api_upstream http://api:8000;`). With a variable, Nginx looks the name up again every 10 seconds.

## 7. Seed only once

The first time the API runs it adds 4 starter cars, using `SET parking:seeded 1 NX` (set only if it does not exist). The flag lives in Redis, and Redis lives in the Volume, so on every later start the flag is already there and nothing is added. Without it a restart would add duplicates, and we could not prove that the data survived. After `down -v` the flag is gone too, so the lot is reset to the 4 starter cars.

## 8. "Release car" is a real DELETE

In version 1 the dashboard could only read, so "release" lived in the browser's `localStorage`. With an API the right solution is a `DELETE /api/cars/<plate>`: the car is removed from Redis, so every browser sees the same lot. The "Entered" counter on the dashboard comes from `parking:total`, which keeps growing and is not reduced by a release.

## 9. The dashboard: `fetch` + dynamic DOM

`app.js` calls `fetch("/api/cars")` every 3 seconds (polling) and updates the page without a refresh: it adds a card for a new plate (with a pop-up and a joke), removes cards of cars that left, and a 1-second timer updates the parking time and price. If the API does not answer, the status pill shows "API: OFFLINE" instead of silently showing stale data.

Trade-off: polling is simple and robust, but not instant. WebSockets or Server-Sent Events would push updates immediately, at the price of more code.

## 10. CI/CD design

- The workflow token is **read-only by default** (`permissions: contents: read` at the top). Only the publish job asks for `packages: write`.
- `concurrency` cancels an older run of the same branch when a newer push arrives, and every job has a `timeout-minutes`, so a stuck job cannot run for hours.
- The images are built for **amd64 and arm64** (QEMU + Buildx), so they also run natively on Apple Silicon and Windows-on-ARM laptops. A build cache (`type=gha`) makes repeat runs faster.
- Both of our Dockerfiles (`web`, `api`) are checked with **hadolint** (a Dockerfile linter) before building. Redis uses the official image, so there is nothing of ours to build or publish for it.
- The **build check** runs on every push. It does not just build: it starts the whole stack and calls it (smoke test), and then runs the persistence test (`down` + `up`).
- **Publishing** is a separate job that `needs` the build job. A broken build can never be published.
- Publishing runs only for `main` and version tags, not for every feature branch.
- Authentication uses the automatic `GITHUB_TOKEN` with `packages: write`. No personal password or token is stored in the repository.
- The image name is lower-cased because `ghcr.io` does not accept upper case.
- A **matrix** (`web`, `api`) builds both images with one job definition.
- Tags: semantic version from git tags (`2.0.0`, `2.0`), plus `sha-<commit>`, `build-<number>` and `latest` for `main`.

## 10b. Two test scripts, used by people and by CI

`scripts/smoke-test.sh` is the single place that says what "healthy" means: Nginx answers, the dashboard loads, `POST` / `GET` / `DELETE` work through the proxy, bad input is refused, a photo downloads, other HTTP methods are refused and the security headers are there. `scripts/persistence-test.sh` adds a car, runs `docker compose down` and `up`, and checks the car is still there. CI calls the same scripts that a student can run locally, so there is nothing to keep in sync.

## 11. Pinned base images

`nginx:1.27-alpine`, `python:3.12-alpine`, `redis:7-alpine` and pinned Python packages (`requirements.txt`) instead of `latest`. Builds are repeatable, and Alpine keeps the images small.

## 12. Basic hardening (kept small on purpose)

- `server_tokens off` hides the Nginx version.
- `/api/` accepts only `GET`, `POST` and `DELETE` (`limit_except`), everything else gets `403`.
- A `Content-Security-Policy` header tells the browser the page may only load its own files and photos (`default-src 'self'`). The dashboard has no inline scripts or inline styles, so this costs nothing.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- The API and Redis have no published port, and the API runs as a non-root user.

## 13. Small quality details

`prefers-reduced-motion` turns animations off for people who asked their system for that, a `<noscript>` message explains that the dashboard needs JavaScript, and a car whose plate has no photo gets a drawn plate picture instead of a broken image.

## 14. Line endings

`.gitattributes` forces LF for shell scripts, configs and Dockerfiles. Without it, Git on Windows could convert scripts to CRLF and the container or script would fail with `exec format error` / `no such file or directory`.
