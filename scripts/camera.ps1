# Windows PowerShell version of scripts/camera.sh
# Pretend to be the IoT camera: a new car arrives and its photo is saved in the Apache storage Volume.
#
#   .\scripts\camera.ps1              a random car that is not already in the lot
#   .\scripts\camera.ps1 MUSTANG-65   a specific car (file name from camera-samples\, without .png)
#   .\scripts\camera.ps1 -List        show available cars
#
# The stack must be running first:  docker compose up -d --build
param(
    [string]$Plate = "",
    [switch]$List
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$samplesDir = "camera-samples"
$lotDir = "/usr/local/apache2/htdocs/plates"

if ($List) {
    Get-ChildItem "$samplesDir\*.png" | ForEach-Object { $_.BaseName }
    exit 0
}

if ($Plate -ne "") {
    if (-not (Test-Path "$samplesDir\$Plate.png")) {
        Write-Error "No such car: $Plate  (try: .\scripts\camera.ps1 -List)"
    }
} else {
    # cars already parked (strip the timestamp and extension from the file names)
    $parked = docker compose exec -T storage ls $lotDir |
        ForEach-Object { ($_ -replace '^\d{8}-\d{6}_', '') -replace '\.png\s*$', '' }
    $candidates = Get-ChildItem "$samplesDir\*.png" | ForEach-Object { $_.BaseName } |
        Where-Object { $parked -notcontains $_ }
    if (-not $candidates) {
        Write-Error "Every sample car is already in the lot. Reset with: docker compose down -v"
    }
    $Plate = $candidates | Get-Random
}

$name = "{0}_{1}.png" -f (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss"), $Plate
docker compose cp "$samplesDir\$Plate.png" "storage:$lotDir/$name"
Write-Host "Camera: spotted $Plate -> saved as $name"
