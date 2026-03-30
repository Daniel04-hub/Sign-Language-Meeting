$env:PATH += ";C:\Program Files\PostgreSQL\18\bin"
$backendPython = "S:\project 2\Sign Language\signmeet\backend\venv\Scripts\python.exe"
$backendPip = "S:\project 2\Sign Language\signmeet\backend\venv\Scripts\pip.exe"
$backendDir = "S:\project 2\Sign Language\signmeet\backend"
$frontendDir = "S:\project 2\Sign Language\signmeet\frontend"

Write-Host "Starting Sign Language Meeting..." -ForegroundColor Cyan

Set-Location $backendDir

if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "Creating venv..." -ForegroundColor Yellow
    python -m venv venv
    & $backendPip install -r requirements.txt --quiet
    & $backendPip install python-decouple --quiet
}

Write-Host "Running migrations..." -ForegroundColor Yellow
& $backendPython manage.py migrate

Write-Host "Starting Django..." -ForegroundColor Yellow
Start-Process "cmd" -ArgumentList "/k", "title Django Backend && cd /d `"$backendDir`" && venv\Scripts\activate && python manage.py runserver"

Start-Sleep -Seconds 5

Write-Host "Starting React..." -ForegroundColor Yellow
Start-Process "cmd" -ArgumentList "/k", "title React Frontend && cd /d `"$frontendDir`" && npm run dev"

Start-Sleep -Seconds 5

Start-Process "chrome" "http://localhost:5173" -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Start-Process "msedge" "http://localhost:5173" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Sign Language Meeting is LIVE" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  App:    http://localhost:5173" -ForegroundColor Green
Write-Host "  API:    http://localhost:8000" -ForegroundColor Green
Write-Host "  Admin:  http://localhost:8000/admin" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  TO STOP: Close Django and React windows" -ForegroundColor Red