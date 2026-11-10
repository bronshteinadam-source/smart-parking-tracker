# Code Review prep: talk it through

Read this out loud, or have a teammate read it to you. It is written the way you would explain the project to a friend, because that is the best way to be ready when the teacher asks a random question.

---

## The big picture, in one breath

"We built a parking lot for classic cars. A fake camera sends a POST with a license plate to our API. The API is a small Flask program, and it saves the car in Redis, which is our database. In front of everything there is Nginx, which shows the dashboard to the attendant and passes the API calls through. The dashboard uses JavaScript `fetch` every 3 seconds to ask the API 'who is in the lot?' and draws a card for every car. Redis saves its data in a Docker Volume, so even if we destroy every container, the cars are still there when we start again."

If you can say that without looking, you already passed half the Code Review.

---

## The Compose file

Open `docker-compose.yml` and walk through it top to bottom.

There are three **services**: `web`, `api` and `redis`. A service is just a recipe for a container. `build: ./web` means "don't download a ready-made image, build one from the Dockerfile in the web folder." Redis has `image: redis:7-alpine` instead of `build`, because the official image is exactly what we need.

`web` has `ports: "8080:80"`. Left side is the port on my laptop, right side is the port inside the container. So when I open localhost:8080, Docker passes it to port 80 inside Nginx. **`api` and `redis` have no ports at all, on purpose.** Nobody outside can reach them. Only containers on the same private network can.

If they ask *"how does Nginx find the API, and the API find Redis?"* the answer is: Compose puts all three on the network `parking-net`, and Docker has a little DNS inside it. The name `api` and the name `redis` are service names, and Docker turns them into the containers' IPs. That's why `nginx.conf` says `http://api:8000` and the API gets `REDIS_HOST=redis`, and no IP address is written anywhere.

`depends_on` with `condition: service_healthy` forms a chain: `web` waits for `api`, `api` waits for `redis`. Plain `depends_on` only waits for the container to *start*, not to be *ready*. The health check is what makes it real: it's a command Docker runs every 10 seconds. For Redis it is `redis-cli ping`, for the API it is a request to `/api/health` (which also pings Redis), for Nginx it is `wget` on `/healthz`. One detail: they call `127.0.0.1` and not `localhost`, because in Alpine `localhost` can turn into the IPv6 address and a server that only listens on IPv4 would look dead.

The `volumes:` line in the Redis service, `redis-data:/data`, says: take the Volume called `redis-data` and plug it in at `/data` inside the container. That is where Redis writes its data file.

---

## Redis and the Volume, which is the star of the demo

They will ask you to do `docker compose down` and then `up`, and show the data survived. Here's what to say while you do it.

"A container's filesystem dies with the container. `down` removes the containers and the network. But the Volume is a separate object that Docker manages. It is not part of any container. Redis keeps data in memory, but I start it with `--appendonly yes`, so it also writes every change into a file in `/data`, and that folder is the Volume. When I do `up` again, a new Redis container plugs into the same Volume, reads the file and has all the cars back."

Then the trick question: **"What would delete the data?"** Answer: `docker compose down -v`. The `-v` means "and remove the volumes too." Without `-v` the data stays.

Another trap: **"Why didn't you get 4 duplicate cars after restart?"** Because of the flag `parking:seeded` in Redis. The API adds the 4 starter cars with `SET ... NX`, which means "only if it does not exist yet". The flag is saved in the Volume too, so after a restart it is already there and nothing is added. That's also why the parking time keeps counting after the restart: the arrival time is stored in Redis.

**What if I turn `--appendonly` off?** Redis would then save only snapshots every few minutes (RDB). On a quick `down` and `up` the last changes could be lost. AOF writes every change.

**Named volume versus bind mount?** A bind mount points at a folder on my computer (`./data:/data`). A named volume is managed by Docker. I picked a named volume because it behaves the same on every OS and doesn't depend on my folder structure or Windows permissions.

---

## The API (`api/app.py`)

Four endpoints. `POST /api/cars` is for the camera: it reads the plate from the JSON body, upper-cases it, checks it against a pattern (letters, digits and a dash, 2 to 12 characters) and returns `400` if it is wrong. Then it calls `HSETNX`, which adds the car only if it is not already in the hash: it returns `201` if the car was added and `409` if it was already there. `GET /api/cars` is for the dashboard: it returns the capacity, how many are parked, how many entered in total, and the list of cars, newest first. `DELETE /api/cars/<plate>` removes the car (`204`, or `404` if it was not there). `GET /api/health` is for Docker.

**Why a hash in Redis?** A hash is like a small dictionary: plate to arrival time. Adding, removing and listing are single commands, and `HSETNX` is atomic, so two cameras sending the same plate at the same moment cannot create a duplicate.

**Why gunicorn and not `flask run`?** Flask's built-in server is for development. gunicorn is a real production server that can handle several requests at once (we run 2 workers).

**Where do you validate?** On the server (the API checks the plate) and also in the browser (it checks again what it receives). The server is the one that matters, because anyone can call the API without our dashboard.

---

## The Dockerfiles

**Web Dockerfile**, three real lines. `FROM nginx:1.27-alpine`: start from the official Nginx image, a pinned version on Alpine Linux, which is tiny. `COPY nginx.conf /etc/nginx/conf.d/default.conf`: replace the default site with mine. `COPY html/ /usr/share/nginx/html/`: put the dashboard files (and the car photos) where Nginx serves from. The base image already knows how to start Nginx, so I don't need a `CMD`.

**API Dockerfile.** Start from `python:3.12-alpine`. Copy `requirements.txt` first and run `pip install`, and only then copy `app.py`. That order is on purpose: Docker caches each step, so when I change only `app.py` it does not install the packages again. `adduser` and `USER apiuser` make the program run as a normal user and not as root. `CMD ["gunicorn", ...]` starts the server on port 8000.

If they ask **image versus container**: an image is the frozen recipe plus files, a container is a running instance of it. One image, many containers.

If they ask **EXPOSE versus ports**: `EXPOSE 8000` is only documentation inside the image. `ports:` in Compose is what actually opens the door to the outside. The API has `EXPOSE` but no `ports`, so it stays private.

**Why alpine?** Smaller image, faster build and pull, fewer packages to attack. **Why not `latest`?** Because "latest" changes under your feet. A pinned version gives a repeatable build.

---

## Nginx config

Two ideas. First, `location /` serves the static files: the dashboard and the car photos. Second, `location /api/` has `proxy_pass` to the API. That makes Nginx a **reverse proxy**: the browser thinks it's talking to one server, Nginx quietly passes the request to Flask and hands the answer back. Two benefits to say out loud: no CORS problems because everything comes from the same address, and the API doesn't have to be exposed.

One clever bit: the name `api` is stored in a variable and there's a `resolver 127.0.0.11` line. That's Docker's built-in DNS. Without it, Nginx looks up `api` once at startup and remembers the IP forever. If I rebuild only the API container, it gets a new IP and Nginx would answer 502 Bad Gateway. With the variable and the resolver, Nginx asks again every 10 seconds.

Small security touches you can mention: `limit_except GET POST DELETE` means other methods (like PUT) get 403, `server_tokens off` hides the Nginx version, and a `Content-Security-Policy` header tells the browser the page may only load its own files.

There's also `/healthz`, which just returns "ok". It exists only so Docker's health check has something cheap to call.

---

## How does the dashboard know a new car arrived?

It asks. The JavaScript in `app.js` calls `fetch("/api/cars")` every 3 seconds (this is called polling) and gets JSON back. For each plate it does not know yet it builds a card, with a pop-up and a joke. For a plate that is no longer in the answer it removes the card. Every second a timer recalculates the parked time (now minus the arrival time from the API) and the price, which is a small function: free for 10 minutes, then 12 shekels per started hour. All of this changes the page (the DOM) without a refresh.

Why is the time stored on the server and not in the browser? Because then every browser and every restart sees the same arrival time.

Why `textContent` for the plate and not `innerHTML`? Plates come from outside. If someone sent HTML as a plate, `innerHTML` would run it. `textContent` treats it as plain text. And the API only accepts letters, digits and a dash anyway.

---

## The GitHub Actions workflow

Read it as two jobs.

**Job 1, `build`.** Triggered on every push, because the trigger says `branches: ["**"]`, any branch. Steps: check out the code, validate the compose file, lint both of our Dockerfiles (`web`, `api`) with hadolint, build the images, then start the stack with `up -d --wait`, which waits until the health checks pass. Then it runs `scripts/smoke-test.sh`, a small script of `curl` checks: the health endpoint, the dashboard page, `GET /api/cars` expecting to see `BELAIR-55` (that proves Nginx, API, Redis and the seeding all work), a POST of a new car (201), a duplicate (409), a bad plate (400), a DELETE (204), a photo download, and a PUT that must be refused with 403. After that `scripts/persistence-test.sh` adds a car, runs `docker compose down` and `up`, and checks the car survived. The same scripts run on your laptop. If anything fails, the job goes red. There's also a step that prints the logs if something failed, and a cleanup step with `if: always()`.

**Job 2, `publish`, the bonus.** `needs: build` means it only runs if job 1 passed. The `if:` line limits it to pushes on main or version tags, so a random feature branch doesn't publish anything. Three bonus requirements:

1. **Secure login.** `docker/login-action` with the username `github.actor` and the password `secrets.GITHUB_TOKEN`. That token is created automatically for every run, expires when the run ends, and we never typed or stored it. For it to be allowed to push, the job declares `permissions: packages: write`.
2. **Automatic tagging.** `docker/metadata-action` creates the tags. If I push a git tag `v1.2.0`, I get image tags `1.2.0` and `1.2`. Every run also gets `sha-<commit>` and `build-<number>`, and main gets `latest`.
3. **Push.** `docker/build-push-action` with `push: true`.

The `matrix` with `web` and `api` just means "run this job twice, once per image." Redis is the official image, so there is nothing of ours to build for it. We also build for two CPU types, amd64 and arm64, using QEMU and Buildx, so the image runs on a normal PC and on an ARM laptop. Two more habits worth naming: the token is read-only by default and only the publish job gets `packages: write` (least privilege), and `concurrency` cancels an older run when a newer push arrives.

A detail they love: the image name is lower-cased, `${GITHUB_REPOSITORY,,}`, because `ghcr.io` rejects capital letters and GitHub usernames can have them.

---

## Short answers to likely questions

- **What happens if the API crashes?** `restart: unless-stopped` brings it back. The data is in Redis, so nothing is lost.
- **What happens if Redis crashes?** It restarts and reads its file from the Volume. Meanwhile the API answers `503` and the dashboard shows "API: OFFLINE".
- **Can I scale the API?** Yes, more API containers can use the same Redis, because the API keeps no data of its own. Nginx would need to balance between them.
- **Where is the API's port exposed?** Nowhere. It is only reachable from the Compose network, through Nginx.
- **Why three services and not one?** One job per container. Easier to update, scale and debug.
- **What does `docker compose up` do versus `up --build`?** `--build` rebuilds the images first. Without it, it reuses the existing image even if the code changed.
- **Where do the logs go?** `docker compose logs -f api`.
- **What is the Release button really doing?** It sends `DELETE /api/cars/<plate>`. The API removes the car from Redis, so every browser sees it gone.
- **Why did you change from Track 1 to Track 2?** Track 1 is meant for the Yud-Gimel classes, and ours is Yud. Track 2 adds a real API and a database. Most of the project stayed the same.

---

## Be ready to demo

Change something small live if asked: for example, in `app.js` change `capacity: 6` to `capacity: 4`, run `docker compose up -d --build`, refresh, and the "Lot full" alert shows. Then explain: I changed a file, rebuilt only the web image, and Compose recreated only the web container. Or ask the API by hand: `curl http://localhost:8080/api/cars`.
