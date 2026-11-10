# What changed from Track 1 to Track 2

Our class should do **Track 2 - Full Stack DevOps**, so we upgraded the project (v2). Most of it stayed the same.

## The idea in one picture

```
Track 1:  camera -> file in Volume -> Apache (storage) <- Nginx (web) <- browser
Track 2:  camera -> POST -> API (Flask) -> Redis (database) -> Volume
                                 ^
          browser <- Nginx (web) -+  GET /api/cars every 3 s (fetch)
```

## What stayed the same

- Nginx `web` service, the dashboard look and all our own touches (jokes, price, full-lot alert, dark mode, honk, Easter egg)
- Docker Compose structure, private network, only port 8080 is open, health checks with `depends_on: service_healthy`
- Nginx reverse proxy with the `resolver 127.0.0.11` trick
- GitHub Actions: build check + GHCR publishing (now for `web` and `api`), AI_USAGE.md, ARCHITECTURE.md

## What is new

| New | Replaces | What it does |
|---|---|---|
| `api/` (Flask + gunicorn, Python) | `storage/` (Apache) | `POST /api/cars` (camera), `GET /api/cars` (dashboard), `DELETE /api/cars/<plate>` (release), `GET /api/health` |
| `redis` service (`redis:7-alpine`, `--appendonly yes`) | files in a folder | the database: which cars are in, when they came, how many entered in total |
| Volume `redis-data` mounted at `/data` | Volume `plates-data` | Redis writes its data file here, so it survives `down` + `up` |
| `scripts/camera.*` sends an HTTP POST | copied a file into the Volume | a real "camera" talking to the API |
| `web/html/app.js` uses `fetch` + JSON | parsed an Apache directory listing | dynamic DOM from API data |
| Release button = `DELETE` to the API | `localStorage` | the release is saved in Redis for everybody |
| `scripts/persistence-test.sh` (also in CI) | - | proves that data survives `down` + `up` |
| `web/html/cars/` | `storage/seed` + `camera-samples` | sample car photos, served by Nginx |

## Who should re-read what (for the Code Review)

| Person | Re-read |
|---|---|
| A | `docker-compose.yml` (3 services, `redis-data` Volume, health check chain) |
| B | `web/nginx.conf` (`/api/` proxy) and the three Dockerfiles: `web/`, `api/` and the official Redis image |
| C | `api/app.py` (the 4 endpoints, Redis commands) and `scripts/camera.ps1` |
| D | `.github/workflows/ci.yml` (matrix `web` + `api`, persistence test) and `web/html/app.js` (`fetch` polling) |
