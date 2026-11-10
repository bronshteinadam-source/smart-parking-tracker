# Live demo script (about 7 minutes)

Do a full run-through once before the day. Have two terminals open in the project folder and the browser ready.

## Before you go on stage (2 minutes earlier)

```bash
docker compose down -v            # clean start
docker compose up -d --build      # build + start in the background
```

Run `./scripts/smoke-test.sh` (Git Bash): 6 PASS lines means everything is wired correctly. Open http://localhost:8080 and check that 4 cars are on the dashboard. Keep the browser on the dashboard and put the terminal beside it so the class sees both.

## 1. Introduce the system (1 minute)

Say: "Retro Rides, a smart parking lot for classic cars. A camera photographs every plate, and the attendant sees them live."

Show the architecture diagram from the README (or the slide). Two containers, one Volume, one open port.

## 2. Show the app and our own touch (2 minutes)

1. Point out the live parking time and price on each card.
2. In the second terminal: `./scripts/camera.sh` (or `.\scripts\camera.ps1` on Windows). The new car appears with a pop-up and a joke. **Turn Sound on first** so the class hears the honk.
3. Send two or three more cars until the red **LOT FULL** banner flashes.
4. Click **Release car** on one: the spot frees up and the banner can disappear.
5. Click **Dark mode**.
6. Type `vroom` on the page: a car drives across the screen. "There's a hidden Easter egg. The other one is the Konami code."

## 3. The Volume proof (2 minutes) - this is mandatory

```bash
docker compose ps                  # two healthy services
docker compose down                # containers gone
docker compose ps                  # empty list - prove it
docker compose up -d               # new containers
```

Refresh the dashboard: all the cars are still there, and the parked time kept counting.

Say: "The containers were destroyed. The data survived because the photos live in a Volume, which is managed separately from the containers."

Optional, if there is time: `docker volume ls` and `docker compose exec storage ls /usr/local/apache2/htdocs/plates`.

## 4. Show the pipeline (1 minute)

Open the repository on GitHub: Actions tab, a green run with the **build check**, then the **publish** job. Open the Packages section to show the two images with their tags (`latest`, `sha-...`, version).

## 5. Questions

Use [CODE_REVIEW_PREP.md](CODE_REVIEW_PREP.md).

## If something goes wrong

| Problem | Quick fix |
|---|---|
| Port 8080 already used | `docker compose down`, or change `8080:80` to `8081:80` and open :8081 |
| Dashboard says "Camera storage: OFFLINE" | `docker compose ps`, then `docker compose logs storage` |
| New car does not show | Wait 3 seconds. Check the file name format with `docker compose exec storage ls /usr/local/apache2/htdocs/plates` |
| `camera.ps1` is blocked | `powershell -ExecutionPolicy Bypass -File .\scripts\camera.ps1` |
| Want a full reset | `docker compose down -v && docker compose up -d --build` |
