# Architectural decisions

Each decision: what we chose, why, and what the alternative would have been.

## 1. Two containers, one job each

`web` (Nginx) only serves the dashboard. `storage` (Apache) only keeps and serves photos. This is the micro-services idea from the assignment: each service can be rebuilt, restarted or replaced without touching the other. Because they are separate, we could swap Apache for an object store later without changing the dashboard code.

## 2. Nginx is a reverse proxy for the photos

`location /plates/ { proxy_pass http://storage/plates/; }`

- The browser talks to **one** address (`localhost:8080`). No CORS configuration is needed because everything is the same origin.
- The `storage` service has **no published port**. It is reachable only from inside the Docker network. Smaller attack surface.
- `storage` is a hostname that Docker's built-in DNS resolves on the Compose network. We never hard-code an IP address.

Alternative: publish Apache on port 8081 and let the browser call it directly. That needs CORS headers and exposes a second port.

## 3. A named Volume for the photos

`plates-data:/usr/local/apache2/htdocs/plates`

A named Volume is managed by Docker and survives `docker compose down`. Only `down -v` removes it. That is exactly what the demo needs to prove.

Alternative: a bind mount (`./photos:/...`). It is easy to browse on the host, but it depends on the host's folder layout and permissions (and behaves differently on Windows). A named Volume works the same on every machine.

## 4. Apache directory listing instead of a backend

Track 1 asks for no backend code. Apache can show a folder as a web page; the dashboard downloads it and reads the links. It means "new photo in the Volume = new car on the screen" with zero server code.

Trade-off: we poll every 3 seconds instead of getting push updates, and we depend on Apache's listing format. That is why the parser looks only at links whose name matches the naming convention, and ignores everything else (Parent Directory, sort links).

## 5. The arrival time is in the file name

`20261109-203015_MUSTANG-65.png`

File modification times change when files are copied (`docker cp`, backups), but the name travels with the file. UTC avoids time-zone confusion between the camera and the browser.

## 6. `depends_on` with a health check

Start order: `web` uses `depends_on: storage: condition: service_healthy`, and `storage` has a health check that requests `/plates/`. Plain `depends_on` only waits for the container to *start*; the health check makes it wait until Apache really answers.

The health checks call `127.0.0.1`, not `localhost`. In Alpine, `localhost` can resolve to the IPv6 address `::1` first, and a server that listens only on IPv4 then looks "unhealthy" even though it works.

## 6b. Nginx re-resolves the name `storage`

`proxy_pass` with a hostname normally resolves the name once, when Nginx starts. If the `storage` container is later recreated (for example `docker compose up -d --build storage`) it gets a new IP, and Nginx would keep calling the old one and answer 502. So `nginx.conf` uses `resolver 127.0.0.11` (Docker's embedded DNS) and puts the name in a variable (`set $storage_upstream http://storage;`). With a variable, Nginx looks the name up again every 10 seconds.

## 7. Seed only when the Volume is empty

`storage/entrypoint.sh` parks 4 starting cars the **first** time. On every later start it sees photos in the Volume and does nothing. Without this, a restart would add duplicates, and we could not prove that the data survived.

## 8. "Release car" lives in the browser

The dashboard only reads from storage (it has no write access). So "release" is stored in `localStorage`. This keeps the storage server simple and read-only for the web tier. Real removal would need an API (Track 2) or WebDAV.

## 9. Safe handling of file names

File names come from outside, so they must not be trusted. The parser accepts only `[A-Za-z0-9-]` for the plate part, and the dashboard writes plate text with `textContent` (never `innerHTML`), so a strange file name cannot inject HTML or script.

## 10. CI/CD design

- The workflow token is **read-only by default** (`permissions: contents: read` at the top). Only the publish job asks for `packages: write`.
- `concurrency` cancels an older run of the same branch when a newer push arrives, and every job has a `timeout-minutes`, so a stuck job cannot run for hours.
- The images are built for **amd64 and arm64** (QEMU + Buildx), so they also run natively on Apple Silicon and Windows-on-ARM laptops. A build cache (`type=gha`) makes repeat runs faster.
- Both Dockerfiles are checked with **hadolint** (a Dockerfile linter) before building.
- The **build check** runs on every push. It does not just build: it starts the stack and calls it (`/healthz`, the dashboard, `/plates/`, and it downloads one photo through the proxy), so a broken proxy or config is caught.
- **Publishing** is a separate job that `needs` the build job. A broken build can never be published.
- Publishing runs only for `main` and version tags, not for every feature branch.
- Authentication uses the automatic `GITHUB_TOKEN` with `packages: write`. No personal password or token is stored in the repository.
- The image name is lower-cased because `ghcr.io` does not accept upper case.
- A **matrix** (`web`, `storage`) builds both images with one job definition.
- Tags: semantic version from git tags (`1.2.0`, `1.2`), plus `sha-<commit>`, `build-<number>` and `latest` for `main`.

## 10b. One smoke test, used by people and by CI

`scripts/smoke-test.sh` is the single place that says what "healthy" means: Nginx answers, the dashboard loads, the proxy reaches Apache, a photo downloads, the public side is read-only, and the security headers are there. CI calls the same script that a student can run locally, so there is nothing to keep in sync.

## 11. Pinned base images

`nginx:1.27-alpine` and `httpd:2.4-alpine` instead of `latest`. Builds are repeatable, and Alpine keeps the images small.

## 12. Basic hardening (kept small on purpose)

- `server_tokens off` hides the Nginx version.
- `/plates/` accepts only `GET` and `HEAD` (`limit_except`), so nobody can upload or delete through the public port.
- A `Content-Security-Policy` header tells the browser the page may only load its own files and photos (`default-src 'self'`). The dashboard has no inline scripts or inline styles, so this costs nothing.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Storage has no published port, and Apache shows no version (`ServerTokens Prod`).

## 13. Small quality details

`prefers-reduced-motion` turns animations off for people who asked their system for that, a `<noscript>` message explains that the dashboard needs JavaScript, and the dashboard shows "Camera storage: OFFLINE" instead of silently showing stale data when Apache is unreachable.

## 14. Line endings

`.gitattributes` forces LF for shell scripts, configs and Dockerfiles. Without it, Git on Windows could convert `entrypoint.sh` to CRLF and the container would fail with `exec format error` / `no such file or directory`.
