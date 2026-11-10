# Windows PowerShell version of scripts/camera.sh
# Pretend to be the IoT camera: a new car arrives and the camera tells the API (POST /api/cars).
#
#   .\scripts\camera.ps1              a random car that is not already in the lot
#   .\scripts\camera.ps1 MUSTANG-65   a specific car
#   .\scripts\camera.ps1 -List        show the cars that have a photo
#
# The stack must be running first:  docker compose up -d --build
param(
    [string]$Plate = "",
    [switch]$List,
    [string]$Base = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$photosDir = "web\html\cars"

if ($List) {
    Get-ChildItem "$photosDir\*.png" | ForEach-Object { $_.BaseName }
    exit 0
}

if ($Plate -ne "") {
    $Plate = $Plate.ToUpper()
} else {
    # cars already parked, asked from the API
    try { $parked = (Invoke-RestMethod "$Base/api/cars").cars | ForEach-Object { $_.plate } }
    catch { Write-Error "Cannot reach the API at $Base. Is the stack running?" }
    $candidates = Get-ChildItem "$photosDir\*.png" | ForEach-Object { $_.BaseName } |
        Where-Object { $parked -notcontains $_ }
    if (-not $candidates) {
        Write-Error "Every sample car is already in the lot. Release one on the dashboard first."
    }
    $Plate = $candidates | Get-Random
}

$body = @{ plate = $Plate } | ConvertTo-Json -Compress
try {
    Invoke-RestMethod -Method Post -Uri "$Base/api/cars" -ContentType "application/json" -Body $body | Out-Null
    Write-Host "Camera: spotted $Plate -> sent to the API (201 Created)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 409) { Write-Error "Camera: $Plate is already in the lot (409)" }
    elseif ($code -eq 400) { Write-Error "Camera: the API rejected the plate '$Plate' (400)" }
    else { Write-Error "Camera: cannot reach the API at $Base. Is the stack running?" }
}
