# AI usage log

We used an AI assistant (Claude, Anthropic) to assist in building this project. The AI generated initial code structures, configurations, and documentation drafts based on our directives. Our role was to design the setup, integrate and refine the code, test the system, resolve platform-specific issues, and thoroughly understand all components for the Code Review. This file lists what we asked it, what it got wrong, and how we handled it.

## 1. Prompts we sent

| # | Request (summarized from our chat with the AI) | What the AI produced |
|---|---|---|
| 1 | Provided the assignment document. Asked the AI to outline implementation steps and highlight key architectural decisions needed. | Summarized requirements and listed decision points needed from us (track, theme, language). |
| 2 | Answered initial setup questions and requested a breakdown of technical requirements for each track. | Summarized track features and suggested Track 1 (see mistake A). |
| 3 | Evaluated track complexity options and selected our architecture. | Confirmed setup parameters: Track 1 - Lite, theme Classic cars lot, language English. |
| 4 | Asked it to draft the core Track 1 files based on our selections: Nginx dashboard + Apache storage, Docker Compose, Volume, GitHub Actions with GHCR, README, and docs. | Drafted `docker-compose.yml`, Dockerfiles, `nginx.conf`, `plates.conf`, `entrypoint.sh`, dashboard (HTML/CSS/JS), camera scripts, workflow, and documentation structure. |
| 5 | Worked with the AI to refine container configurations and proxy routing rules. | Suggested initial Nginx dynamic proxy configurations and health check definitions. |
| 6 | Asked it to draft project documentation templates and a Hebrew summary for team review. | Initial drafts for `docs/TEAM_SUMMARY_HE.md`, `docs/TEAM_CHECKLIST.md`, `docs/DEMO_SCRIPT.md`, `docs/CODE_REVIEW_PREP.md`, and presentation structure. |
| 7 | Asked it to review the code against current best practices and suggest security/quality improvements. | Proposed updates based on modern standards (see mistakes D and E). |
| 8 | Asked for steps to run and test the project locally. | Step-by-step local execution list. |
| 9 | Shared a screenshot of Docker Desktop stuck on starting the engine on Windows ARM. | Troubleshooting guidance for Docker Desktop on Windows ARM laptops. |
| 10 | Consulted on running the stack directly via CLI due to desktop permissions issues. | Provided direct command-line execution steps (see mistake G). |
| 11 | Shared PowerShell errors encountered during execution (script execution policy, missing `git`). | Fixes for environment and script execution policy blocks (see mistake G). |

## 2. Mistakes and inaccuracies the AI made, and how they were fixed

### A. Premature assumption of track selection
The AI asked four initial configuration questions. During our discussion of setup requirements, it assumed a choice and began drafting Track 1 templates before we officially confirmed our preference.
How we caught it: We noticed the track selection had been presumed without explicit confirmation and paused the output.
Fix: We asked the AI to present the technical trade-offs clearly, after which we made the final architecture choices ourselves.

### B. A `.dockerignore` that did nothing
The AI generated a `.dockerignore` file in the repository root to exclude docs and scripts from images. However, since our build contexts are sub-folders (`./web` and `./storage`), Docker ignores root-level `.dockerignore` files during build context transfer.
How we caught it: We reviewed the Docker build context setup.
Fix: Deleted the root `.dockerignore` file and verified sub-folder build contexts only contain necessary files.

### C. Wrong logic in the "Release car" button
The initial version of `releaseCar()` in `web/html/app.js` re-rendered the lot from a combined list of active cars and parsed released filenames, causing released vehicles to reappear on UI refreshes and miscalculate vehicle counts.
How we caught it: Dashboard functionality testing.
Fix: Refactored dashboard state tracking: the frontend now maintains `lastListing`, adds released car IDs to a `released` set, and filters them out cleanly before re-rendering.

### D. Configuration issues identified during container review
Reviewing the generated configurations revealed two runtime issues:
- Stale DNS in Nginx: `proxy_pass http://storage/...` causes Nginx to resolve `storage` once at startup. If the container recreates, Nginx returns 502 errors. Fix: Stored hostname in a variable and added `resolver 127.0.0.11` (Docker DNS) for dynamic re-resolution.
- `localhost` in health checks: In Alpine Linux, `localhost` can resolve to IPv6 (`::1`), whereas services listened on IPv4. Fix: Updated health check endpoints to `127.0.0.1`.

### E. CI/CD workflow and script refinements
During workflow testing and script analysis:
- Outdated GitHub Actions versions: Updated generated action versions (`actions/checkout`, `docker/login-action`, `docker/build-push-action`) to modern majors running on Node 24 runtimes.
- Smoke-test script bug: The initial `scripts/smoke-test.sh` returned duplicate filename entries due to Apache HTML listing formatting. Fix: Updated stream filtering (`sed -n 1p`) to ensure single-match extraction.
- Security baseline: Added read-only photo pathing, security headers, restricted workflow token permissions, and multi-arch build options.

### G. Windows environment compatibility
- PowerShell script execution policy: Executing `camera.ps1` failed due to default execution policies. Fix: Added `Set-ExecutionPolicy -Scope Process Bypass` step to setup documentation.
- Environment PATH refresh: Installing Git required updating environment variables within active terminal sessions. Fix: Added PATH refresh instructions for existing PowerShell sessions.

### F. Verification and edge cases handled by the team
- Container setup and persistent volume storage were manually verified using `docker compose up --build` and integration tests.
- Handled Alpine BusyBox date formatting fallbacks in `storage/entrypoint.sh`.
- Maintained `.gitattributes` LF line-ending enforcement to prevent cross-platform execution issues inside Linux containers.

## 3. What we changed or checked ourselves

- Deployed and tested `docker compose up --build` on Windows ARM, verified dynamic dashboard updates via `scripts/camera.ps1`, and confirmed volume persistence across container restarts.
- Configured GitHub repository, CI/CD pipeline, and validated automated smoke tests on push/PR with GHCR publishing.
- Team members reviewed specific codebase components to write documentation and code review preparation notes (`docs/notes-*.md`).
- Gal (part C): Reviewed and verified `storage/entrypoint.sh` and `scripts/camera.ps1`.
- Itai (part B): Reviewed Dockerfiles and `web/nginx.conf`, verified health checks, and validated passing CI workflow runs.

## 4. Our rule for using AI

AI provides initial code drafts and scaffolding. We test, refine, debug, and ensure we can fully explain every component before keeping it in the project.
