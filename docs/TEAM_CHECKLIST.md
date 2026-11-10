# Team checklist: what the people still have to do

Everything technical is built. These are the steps only you can do (they need your GitHub account, your teammates, and your computer). About 30-40 minutes.

Send your teammates [TEAM_SUMMARY_HE.md](TEAM_SUMMARY_HE.md) first: it is a short Hebrew explanation of the whole project, with a ready-to-send message for the group chat.

## 1. Run it once on your own computer (10 min)

```bash
docker compose up --build
```

Open http://localhost:8080. In Git Bash run `./scripts/smoke-test.sh`: it should print 6 PASS lines. Then run `.\scripts\camera.ps1` in a second terminal. Then do `docker compose down` and `docker compose up -d` and check the cars are still there. (The AI that built this could not run the real containers in its workspace, so this is the first real run. If anything fails, copy the error and send it back.)

## 2. Create the GitHub repository (5 min)

1. GitHub -> New repository (for example `smart-parking-tracker`). Do **not** add a README (we already have one).
2. Add your teammate(s) as collaborators: Settings -> Collaborators.
3. Edit the team line at the top of `README.md`.

## 3. Commits from EVERY team member (required by the assignment)

The assignment requires more than one commit from each person, and the commits must be real work by each person. Suggested split for a pair (swap the roles however you like):

| Person | Commit 1 | Commit 2 |
|---|---|---|
| A | `storage/` (Dockerfile, plates.conf, entrypoint.sh, seed photos) | `.github/workflows/ci.yml` |
| B | `web/` (Dockerfile, nginx.conf, html) | `docker-compose.yml` + `scripts/` + `camera-samples/` |
| both | | `README.md`, `ARCHITECTURE.md`, `AI_USAGE.md`, `docs/` |

Each person clones the repository, adds their files, and commits and pushes with **their own** Git identity:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
git add storage/
git commit -m "Add Apache storage server with first-run seeding"
git push
```

Tip: small commits are better than one big one (for example one for the Dockerfile, one for the config).

## 4. Make the pipeline run (10 min)

1. Push to `main`. Open the **Actions** tab. The **Docker build check** job should turn green.
2. If the publish job fails with a permission error: Settings -> Actions -> General -> Workflow permissions -> choose **Read and write permissions**, then re-run.
3. For a version tag (bonus tagging demo):
   ```bash
   git tag v1.0.0
   git push --tags
   ```
4. Check your profile or repository -> **Packages**: you should see `...-web` and `...-storage` with the tags.
5. If you want others (or the teacher) to pull the images without logging in: Package -> Package settings -> Change visibility -> Public.

## 5. Make the AI_USAGE.md honest and complete (5 min)

- Add the prompts you really sent after the ones that are listed (row 5 in the table).
- Fill in the date you ran the stack and the CI (section 2F, "Things the AI could not check").
- Section 3 says you ran the stack and read the files. Make sure that is true by then, or edit it.
- The assignment says to attach "two documentation files" but lists only `AI_USAGE.md`. We added `ARCHITECTURE.md` (architectural decisions) as the second. If your teacher meant another file, ask him.

## 6. Prepare the demo and the Code Review (rest of the time)

- Read [CODE_REVIEW_PREP.md](CODE_REVIEW_PREP.md) out loud once, ideally to your teammate.
- Practice [DEMO_SCRIPT.md](DEMO_SCRIPT.md) once with a timer.
- Each person should be able to explain every file, not only the ones they committed.

## Decisions I made for you (change them if you want)

- Track 1 - Lite, theme: Classic cars lot, English everywhere.
- Prices in NIS (12 per started hour, first 10 minutes free), 6 parking spots.
- Plate photos are generated images (`scripts/generate_plates.py`), no real photos, so there are no copyright or privacy issues.
