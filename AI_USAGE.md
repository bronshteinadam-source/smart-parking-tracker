# AI usage log

We used an AI assistant (Claude, Anthropic) to build this project. The AI wrote most of the code and documentation. Our part was to direct it, run and check the result, and understand it well enough to explain it in the Code Review. This file lists what we asked it, what it got wrong, and how we handled it.

## 1. Prompts we sent

| # | Request (summarized from our chat with the AI) | What the AI produced |
|---|---|---|
| 1 | Provided the assignment document. Asked the AI to do as much of the implementation as possible, to ask us for any decision it needed, and to tell us which steps only we could do. | Read the assignment and listed the decisions it needed from us (track, theme, language) |
| 2 | Answered its questions (for the track we said only "what's easier"). | The AI picked Track 1 by itself (see mistake A) |
| 3 | Pointed out that we had not actually been asked the questions, and asked it to ask again with clearer explanations. | Asked again with explanations. We chose **Track 1 - Lite**, theme **Classic cars lot**, language **English** |
| 4 | Asked it to build the Track 1 system from our choices: Nginx dashboard + Apache storage, Docker Compose, Volume, GitHub Actions with the GHCR bonus, README, docs. | `docker-compose.yml`, both Dockerfiles, `nginx.conf`, `plates.conf`, `entrypoint.sh`, dashboard (HTML/CSS/JS), camera scripts, workflow, documentation |
| 5 | Asked it to complete the work on its own and take the time it needed. | The AI built and tested the whole system without further input (see row 4) |
| 6 | Asked it to consolidate everything and write a short Hebrew summary so our teammates understand the work. | `docs/TEAM_SUMMARY_HE.md`, `docs/TEAM_CHECKLIST.md`, `docs/DEMO_SCRIPT.md`, `docs/CODE_REVIEW_PREP.md`, the presentation |
| 7 | Asked it to review the code for quality, compare it with similar projects and improve it. | Improvements based on current best practice (see mistakes D and E) |
| 8 | Asked for simple, minimal-effort steps to run and publish the project. | A short step-by-step list |
| 9 | Shared a screenshot of Docker Desktop stuck on starting the engine, and later of it running. | Troubleshooting steps for Docker Desktop on our Windows ARM laptop |
| 10 | Asked the AI to run the project on our laptop itself. | The AI tried through the desktop app but could not get access to a folder, so it gave us the exact commands instead (see mistake G) |
| 11 | Shared the PowerShell errors we got (script blocked, `git` not found). | The fixes (see mistake G) |

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

### G. Windows problems the AI did not foresee when we ran it
The AI wrote and tested everything on Linux, so its instructions failed on our Windows laptop in two ways.

**camera.ps1 was blocked by PowerShell.** Windows refuses to run downloaded, unsigned scripts (error: is not digitally signed). Fix: run `Set-ExecutionPolicy -Scope Process Bypass` in the same window first. This only affects that window. The README now says so.

**git was not installed**, and after installing it with winget the already-open PowerShell window still did not find it, because that window had an old PATH. The AI first told us to open a new terminal, but the window we were using was still the old one. Fix: refresh PATH in the same window, or open a new window.

Lesson: instructions written for one operating system need to be tried on the real one.

### F. Things the AI could not check, and how we dealt with them
- In the AI's workspace, pulling images from Docker Hub was blocked by network policy, so the AI **could not run the real containers**. It tested the dashboard in a real browser against a mock that imitates Apache's directory listing and Nginx's routing, validated `docker-compose.yml` with `docker compose config`, and linted the workflow with `actionlint`. The real stack was verified by us with `docker compose up --build` and by the CI smoke test on 2026-11-10 (both containers healthy, GitHub Actions run green on main, including publishing to GHCR).
- The AI was not sure that the BusyBox `date -d "@<epoch>"` command (used in Alpine) behaves like the normal `date`. It added a fallback form in `storage/entrypoint.sh` instead of assuming.
- The AI assumed Windows line endings could break the shell script inside the Linux container, and added `.gitattributes` to force LF. We keep this on purpose.

## 3. What we changed or checked ourselves

- Ran `docker compose up --build` on a Windows ARM laptop, opened the dashboard, sent cars with `scripts/camera.ps1`, and did `docker compose down` / `up` to confirm the Volume keeps the cars.
- Created the GitHub repository and pushed the project. GitHub Actions runs `scripts/smoke-test.sh` on every push and publishes the images to GHCR.
- Each team member writes notes in their own words on the part they present in the Code Review (`docs/notes-*.md`). `ARCHITECTURE.md` explains the reasons behind each choice.

## 4. Our rule for using AI

AI writes a first version. We run it, read it, and we do not keep anything we cannot explain.
