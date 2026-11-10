# AI usage log

We used an AI assistant (Claude, Anthropic) to help build this project. This file lists what we asked it, what it got wrong, and how we handled it. We read and understand every file in the repository and can explain it in the Code Review.

## 1. Prompts we sent

| # | Prompt (summary) | What the AI produced |
|---|---|---|
| 1 | Attached the assignment (.docx) and wrote: *"Your job is to do the most amount of work in this project. Ask me anything you need. Tell me what I need to do and ask for permissions. ... finish the product in like an hour or two. Ask me for opinions, but don't ask me too much."* | Read the assignment, listed the decisions it needed from us (track, theme, language) |
| 2 | Answered the questions: *"What's easier"* for the track | AI first picked Track 1 by itself (see mistake A) |
| 3 | *"Wait, you didn't ask me those questions. It's not true, no preferences. ... Ask me again, but explain more so I can actually understand what I'm choosing."* | Asked again with clear explanations. We chose **Track 1 - Lite**, theme **Classic cars lot**, language **English** |
| 4 | (Build phase, AI worked on its own from our choices) Build the Track 1 system: Nginx dashboard + Apache storage, Docker Compose, Volume, GitHub Actions with the GHCR bonus, README, docs | `docker-compose.yml`, both Dockerfiles, `nginx.conf`, `plates.conf`, `entrypoint.sh`, dashboard (HTML/CSS/JS), camera scripts, workflow, documentation |
| 5 | *(add the prompts you sent after this point: questions about the code, changes you asked for, etc.)* | |

## 2. Mistakes and inaccuracies the AI made, and how they were fixed

### A. It treated "no preference" as a decision
The AI asked us four multiple-choice questions. The answers came back as "No preference" for three of them and "what's easier" for the track, which we had not actually chosen. The AI went ahead and started to build Track 1 anyway.
**How we caught it:** we noticed we had never been asked the questions, and interrupted.
**Fix:** we told the AI to ask again with more explanation. We then made the choices ourselves. Lesson: an AI can act on an answer nobody really gave, so check what it thinks you decided.

### B. A `.dockerignore` that did nothing
The AI created a `.dockerignore` in the repository root to keep docs and scripts out of the images. But our images are built from the sub-folders `./web` and `./storage` (see `build:` in `docker-compose.yml`). Docker reads `.dockerignore` from the **build context** folder, not from the repo root, so the file had no effect. It would have looked like a protection that wasn't there.
**Fix:** the file was deleted. The build contexts only contain what each image needs, so nothing else is needed.

### C. Wrong logic in the "Release car" button
The first version of `releaseCar()` in `web/html/app.js` re-rendered the lot from a mixed list: the cars that were currently visible plus the released file names parsed back into cars. That would have shown the car that was just released again and misreported the numbers.
**Fix:** the dashboard now keeps the last list received from Apache in `lastListing`. Releasing a car adds its name to the `released` set and re-renders from `lastListing`, which filters the released cars out.

### D. Problems the AI found when it reviewed its own configuration
The AI could not run the containers, so it re-read its own files looking for things that usually go wrong on a first real run, and found two real problems in what it had written:
- **Stale DNS in Nginx.** `proxy_pass http://storage/...` makes Nginx resolve the name `storage` only once, at startup. If the storage container is recreated it gets a new IP and Nginx would return 502. **Fix:** the name is stored in a variable and `resolver 127.0.0.11` (Docker's DNS) was added, so Nginx looks it up again every 10 seconds.
- **`localhost` in the health checks.** In Alpine `localhost` can resolve to IPv6 `::1`, and the servers listen on IPv4, so the container could be marked unhealthy while working. **Fix:** the health checks use `127.0.0.1`.

The AI also rewrote the CI smoke test to save the responses to files and `grep` those, instead of `curl ... | grep -q`, to avoid broken-pipe errors, and added a step that downloads a real photo through the proxy.

### E. Mistakes found when the AI researched and tested its own work
After we asked it to make the project better, the AI compared its work with current best practice (GitHub's publishing guide and recent open-source workflows) and tested its own scripts. It found:
- **Outdated GitHub Actions versions.** It had written `actions/checkout@v4`, `docker/login-action@v3` and `docker/build-push-action@v6` from memory. The current majors are checkout v6, login v4, build-push v7, metadata v6 and buildx/qemu v4 (they run on the newer Node 24 runtime). **Fix:** all versions updated.
- **A bug in its own smoke-test script.** The first version of `scripts/smoke-test.sh` returned the same photo name twice, because the file name appears twice in each row of Apache's listing (link and text), and `grep -m1` limits lines, not matches. The script failed when it was run for the first time. **Fix:** it now keeps only the first match with `sed -n 1p`. We also checked that the script really fails when the system is down.
- **Missing basics that real projects have.** No read-only protection on the public photo path, no security headers, no Dockerfile linting, an over-permissive default workflow token and no ARM images. **Fix:** all added (see `ARCHITECTURE.md`, sections 10 and 12).

### F. Things the AI could not check, and how we dealt with them
- In the AI's workspace, pulling images from Docker Hub was blocked by network policy, so the AI **could not run the real containers**. It tested the dashboard in a real browser against a mock that imitates Apache's directory listing and Nginx's routing, validated `docker-compose.yml` with `docker compose config`, and linted the workflow with `actionlint`. The real stack was verified by us with `docker compose up --build` and by the CI smoke test (_add the date you ran it_).
- The AI was not sure that the BusyBox `date -d "@<epoch>"` command (used in Alpine) behaves like the normal `date`. It added a fallback form in `storage/entrypoint.sh` instead of assuming.
- The AI assumed Windows line endings could break the shell script inside the Linux container, and added `.gitattributes` to force LF. We keep this on purpose.

## 3. What we changed or checked ourselves

- Ran `docker compose up --build` and `./scripts/smoke-test.sh`, opened the dashboard, sent cars with `scripts/camera.sh`, and did `docker compose down` / `up` to confirm the Volume keeps the cars.
- Read through the Dockerfiles, `docker-compose.yml`, `nginx.conf` and the workflow so we can answer Code Review questions (see `ARCHITECTURE.md` for the reasons behind each choice).

## 4. Our rule for using AI

AI writes a first version. We run it, read it, and we do not keep anything we cannot explain.
