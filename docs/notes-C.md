# Notes C - entrypoint.sh and camera.ps1

`storage/entrypoint.sh` runs every time the Apache storage container starts, before Apache itself.
It checks if the plates folder inside the Volume already has .png photos.
If it is empty (first start), it "parks" 4 classic cars: it copies their photos from /seed and names each file with a time in the past (YYYYMMDD-HHMMSS_PLATE.png, UTC), so the dashboard shows how long each car has been parked.
If photos already exist, it does not seed again, which proves the Volume kept the data after `docker compose down` and `up`.
At the end, `exec "$@"` hands control to Apache.
`scripts/camera.ps1` pretends to be the IoT camera at the gate: it picks a random car from camera-samples that is not already parked (or a plate I give it) and uses `docker compose cp` to copy the photo into the storage container with the current UTC time in its name.
That is how a car "enters" the lot: a new file appears in the Volume, and the dashboard reads Apache's file list through Nginx and shows it as a new parked car.
