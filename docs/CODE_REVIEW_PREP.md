# Code Review prep: talk it through

Read this out loud, or have a teammate read it to you. It is written the way you would explain the project to a friend, because that is the best way to be ready when the teacher asks a random question.

---

## The big picture, in one breath

"We built a parking lot for classic cars. A fake camera drops a photo of a license plate into a storage server. The storage server is Apache. In front of it there is Nginx, which shows the dashboard to the attendant. The dashboard keeps asking Apache, 'any new photos?', and draws a card for every car. The photos live in a Docker Volume, so even if we destroy every container, the cars are still there when we start again."

If you can say that without looking, you already passed half the Code Review.

---

## The Compose file

Open `docker-compose.yml` and walk through it top to bottom.

There are two **services**: `web` and `storage`. A service is just a recipe for a container. `build: ./web` means "don't download a ready-made image, build one from the Dockerfile in the web folder."

`web` has `ports: "8080:80"`. Left side is the port on my laptop, right side is the port inside the container. So when I open localhost:8080, Docker passes it to port 80 inside Nginx. **`storage` has no ports at all, on purpose.** Nobody outside can reach Apache. Only Nginx can, because they sit on the same private network.

If they ask *"how does Nginx find Apache?"* the answer is: Compose puts both on the network `parking-net`, and Docker has a little DNS inside it. The name `storage` is the service name, and Docker turns it into the container's IP. That's why `nginx.conf` says `http://storage/plates/` and not an IP address.

`depends_on` with `condition: service_healthy` means "don't start Nginx until Apache says it's healthy". Plain `depends_on` only waits for the container to *start*, not to be *ready*. The health check is what makes it real: it's a command Docker runs every 10 seconds, here `wget --spider`, which just asks "do you answer?" One detail: it calls `127.0.0.1` and not `localhost`, because in Alpine `localhost` can turn into the IPv6 address and a server that only listens on IPv4 would look dead.

The `volumes:` line, `plates-data:/usr/local/apache2/htdocs/plates`, says: take the Volume called `plates-data` and plug it in at that folder inside the container. Everything Apache writes or reads in that folder really lives in the Volume.

---

## The Volume, which is the star of the demo

They will ask you to do `docker compose down` and then `up`, and show the data survived. Here's what to say while you do it.

"A container's filesystem dies with the container. `down` removes the containers and the network. But the Volume is a separate object that Docker manages. It is not part of any container. So when I do `up` again, a new container plugs into the same Volume and sees the same photos."

Then the trick question: **"What would delete the data?"** Answer: `docker compose down -v`. The `-v` means "and remove the volumes too." Without `-v` the data stays.

Another trap: **"Why didn't you get 4 duplicate cars after restart?"** Because of `entrypoint.sh`. On start it checks whether the folder already has `.png` files. Empty folder means first start, so it adds the 4 starter cars. Not empty means do nothing. That's also why the parking time keeps counting after the restart: the arrival time is in the file name, and the file is still there.

**Named volume versus bind mount?** A bind mount points at a folder on my computer (`./photos:/...`). A named volume is managed by Docker. I picked a named volume because it behaves the same on every OS and doesn't depend on my folder structure or Windows permissions.

---

## The Dockerfiles

**Web Dockerfile**, three real lines. `FROM nginx:1.27-alpine`: start from the official Nginx image, a pinned version on Alpine Linux, which is tiny. `COPY nginx.conf /etc/nginx/conf.d/default.conf`: replace the default site with mine. `COPY html/ /usr/share/nginx/html/`: put the dashboard files where Nginx serves from. The base image already knows how to start Nginx, so I don't need a `CMD`.

**Storage Dockerfile.** Start from `httpd:2.4-alpine`. Copy my config `plates.conf` in, and add one line to the end of `httpd.conf`, `Include conf/extra/plates.conf`, so Apache loads it. Copy the seed photos into `/seed`. Copy the entry script and make it executable with `chmod +x`. `ENTRYPOINT` runs my script first. At the end of the script is `exec "$@"`, which means "now run the real command", which is `CMD ["httpd-foreground"]`. `exec` matters: it replaces the shell with Apache so Apache becomes the main process and receives Docker's stop signal properly.

If they ask **image versus container**: an image is the frozen recipe plus files, a container is a running instance of it. One image, many containers.

If they ask **EXPOSE versus ports**: `EXPOSE 80` is only documentation inside the image. `ports:` in Compose is what actually opens the door to the outside. Storage has `EXPOSE` but no `ports`, so it stays private.

**Why alpine?** Smaller image, faster build and pull, fewer packages to attack. **Why not `latest`?** Because "latest" changes under your feet. A pinned version gives a repeatable build.

---

## Nginx config

Two ideas. First, `location /` serves the static files: the dashboard. Second, `location /plates/` has `proxy_pass http://storage/plates/`. That makes Nginx a **reverse proxy**: the browser thinks it's talking to one server, Nginx quietly fetches the photo from Apache and hands it back. Two benefits to say out loud: no CORS problems because everything comes from the same address, and Apache doesn't have to be exposed.

One clever bit: the name `storage` is stored in a variable and there's a `resolver 127.0.0.11` line. That's Docker's built-in DNS. Without it, Nginx looks up `storage` once at startup and remembers the IP forever. If I rebuild only the storage container, it gets a new IP and Nginx would answer 502 Bad Gateway. With the variable and the resolver, Nginx asks again every 10 seconds.

Three small security touches you can mention: `limit_except GET HEAD` means the public port can only read photos (a POST gets 403), `server_tokens off` hides the Nginx version, and a `Content-Security-Policy` header tells the browser the page may only load its own files.

There's also `/healthz`, which just returns "ok". It exists only so Docker's health check has something cheap to call.

---

## How does the dashboard know a new car arrived?

No backend, no database. The camera saves a file called `20261109-203015_MUSTANG-65.png`. That's date, time in UTC, then the plate. Apache is set to show the folder as a web page (`Options +Indexes` in `plates.conf`). The JavaScript in `app.js` fetches that page every 3 seconds, uses `DOMParser` to read the links, and keeps only the ones that match the pattern. For each file it builds a card. Time parked is now minus the time in the file name. Price is a small function: free for 10 minutes, then 12 shekels per started hour.

Why is the time in the file name and not the file's modified date? Because modified dates change when files get copied around. The name travels with the file.

Why `textContent` for the plate and not `innerHTML`? File names come from outside. If someone named a file with HTML in it, `innerHTML` would run it. `textContent` treats it as plain text. And the pattern only allows letters, digits and a dash anyway.

---

## The GitHub Actions workflow

Read it as two jobs.

**Job 1, `build`.** Triggered on every push, because the trigger says `branches: ["**"]`, any branch. Steps: check out the code, validate the compose file, lint both Dockerfiles with hadolint, build both images, then start the stack with `up -d --wait`, which waits until the health checks pass. Then it runs `scripts/smoke-test.sh`, a small script of `curl` checks: the health endpoint, the dashboard page, `/plates/` expecting to see `BELAIR-55` (that proves the Nginx to Apache proxy and the seeding both work), a real photo download, and a POST that must be refused with 403. The same script runs on your laptop. If anything fails, the job goes red. There's also a step that prints the logs if something failed, and a cleanup step with `if: always()`.

**Job 2, `publish`, the bonus.** `needs: build` means it only runs if job 1 passed. The `if:` line limits it to pushes on main or version tags, so a random feature branch doesn't publish anything. Three bonus requirements:

1. **Secure login.** `docker/login-action` with the username `github.actor` and the password `secrets.GITHUB_TOKEN`. That token is created automatically for every run, expires when the run ends, and we never typed or stored it. For it to be allowed to push, the job declares `permissions: packages: write`.
2. **Automatic tagging.** `docker/metadata-action` creates the tags. If I push a git tag `v1.2.0`, I get image tags `1.2.0` and `1.2`. Every run also gets `sha-<commit>` and `build-<number>`, and main gets `latest`.
3. **Push.** `docker/build-push-action` with `push: true`.

The `matrix` with `web` and `storage` just means "run this job twice, once per image." We also build for two CPU types, amd64 and arm64, using QEMU and Buildx, so the image runs on a normal PC and on an ARM laptop. Two more habits worth naming: the token is read-only by default and only the publish job gets `packages: write` (least privilege), and `concurrency` cancels an older run when a newer push arrives.

A detail they love: the image name is lower-cased, `${GITHUB_REPOSITORY,,}`, because `ghcr.io` rejects capital letters and GitHub usernames can have them.

---

## Short answers to likely questions

- **What happens if Apache crashes?** `restart: unless-stopped` brings it back. The photos are in the Volume, so nothing is lost.
- **Can I scale the web service?** Yes with `--scale web=2` but I'd need to remove the fixed `8080:80` port mapping or put a load balancer in front.
- **Where is Apache's port exposed?** Nowhere. It is only reachable from the Compose network.
- **Why two Dockerfiles and not one?** One job per container. Easier to update, scale and debug.
- **How would you add a database in Track 2?** A third service, Redis, with its own Volume and `--appendonly yes` so it persists.
- **What does `docker compose up` do versus `up --build`?** `--build` rebuilds the images first. Without it, it reuses the existing image even if the code changed.
- **Where do the logs go?** `docker compose logs -f storage`.
- **What is the Release button really doing?** It saves the file name in the browser's `localStorage` and hides that car. The photo stays in the Volume. Honest limitation: a different browser would still show the car.

---

## Be ready to demo

Change something small live if asked: for example, in `app.js` change `capacity: 6` to `capacity: 4`, run `docker compose up -d --build`, refresh, and the "Lot full" alert shows. Then explain: I changed a file, rebuilt only the web image, and Compose recreated only the web container.
