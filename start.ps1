
# SignMeet startup script (Django + React)
#
# Goals:
# - Reliable startup with clear, actionable errors
# - Do NOT override database configuration or inject USE_SQLITE
# - Add checks to help debug AI model + WebSocket/API + frontend issues

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ----------------------------
# Debug flag (REQUIRED)
# ----------------------------
$DEBUG = $true

function Write-Step([string]$Message) {
	Write-Host "`n==> $Message" -ForegroundColor Cyan
}
function Write-Ok([string]$Message) {
	Write-Host "[OK] $Message" -ForegroundColor Green
}
function Write-Warn([string]$Message) {
	Write-Host "[WARN] $Message" -ForegroundColor Yellow
}
function Write-Fail([string]$Message) {
	Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Invoke-Step([string]$Name, [scriptblock]$Action) {
	Write-Step $Name
	try {
		& $Action
		Write-Ok $Name
	} catch {
		Write-Fail "$Name failed."
		Write-Host $_.Exception.Message -ForegroundColor Red
		if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
			Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkRed
		}
		throw
	}
}

function Test-PortInUse([int]$Port) {
	try {
		$cmd = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
		if ($cmd) {
			return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
		}
	} catch {
		# ignore and fall back
	}

	try {
		$netstat = netstat -ano | Select-String -Pattern ":$Port\s+LISTENING\s+" -ErrorAction SilentlyContinue
		return [bool]$netstat
	} catch {
		return $false
	}
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds = 30) {
	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	while ((Get-Date) -lt $deadline) {
		if (Test-PortInUse -Port $Port) {
			return $true
		}
		Start-Sleep -Milliseconds 400
	}
	return $false
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds = 30) {
	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	while ((Get-Date) -lt $deadline) {
		try {
			$resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
			if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
				return $true
			}
		} catch {
			# keep retrying
		}
		Start-Sleep -Milliseconds 500
	}
	return $false
}

function Get-ActivateScriptPath([string]$ScriptRoot) {
	$candidates = @(
		(Join-Path $ScriptRoot "..\.venv\Scripts\Activate.ps1"),
		(Join-Path $ScriptRoot ".venv\Scripts\Activate.ps1"),
		(Join-Path $ScriptRoot "..\venv\Scripts\Activate.ps1"),
		(Join-Path $ScriptRoot "venv\Scripts\Activate.ps1")
	)

	foreach ($p in $candidates) {
		$full = (Resolve-Path -Path $p -ErrorAction SilentlyContinue)
		if ($full) { return $full.Path }
	}
	return $null
}

function Get-PythonExeFromVenv([string]$ActivateScriptPath) {
	$venvScripts = Split-Path -Parent $ActivateScriptPath
	$pythonExe = Join-Path $venvScripts "python.exe"
	if (Test-Path $pythonExe) { return $pythonExe }
	return $null
}

function Show-SafeEnv {
	Write-Step "Debug: selected environment variables"
	$names = @(
		"PATH",
		"VIRTUAL_ENV",
		"PYTHONPATH",
		"DJANGO_SETTINGS_MODULE",
		"DJANGO_DEBUG",
		"NODE_ENV"
	)
	foreach ($n in $names) {
		$v = [Environment]::GetEnvironmentVariable($n)
		if ([string]::IsNullOrWhiteSpace($v)) {
			Write-Host "$n = <not set>" -ForegroundColor DarkGray
		} else {
			$out = $v
			if ($out.Length -gt 240) { $out = $out.Substring(0, 240) + "…" }
			Write-Host "$n = $out" -ForegroundColor Gray
		}
	}

	# Print presence (not values) of potentially-sensitive config keys
	$sensitiveKeyPatterns = @("DATABASE_URL", "DB_NAME", "DB_USER", "DB_HOST", "DB_PORT")
	foreach ($n in $sensitiveKeyPatterns) {
		$v = [Environment]::GetEnvironmentVariable($n)
		if ([string]::IsNullOrWhiteSpace($v)) {
			Write-Host "$n = <not set>" -ForegroundColor DarkGray
		} else {
			Write-Host "$n = <set>" -ForegroundColor Gray
		}
	}
}

# ----------------------------
# Paths
# ----------------------------
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptRoot "backend"
$FrontendDir = Join-Path $ScriptRoot "frontend"

if (-not (Test-Path $BackendDir)) {
	throw "Backend folder not found at: $BackendDir"
}
if (-not (Test-Path $FrontendDir)) {
	throw "Frontend folder not found at: $FrontendDir"
}

# ----------------------------
# PostgreSQL path (keep existing behavior, but do not force anything)
# ----------------------------
Invoke-Step "Ensure PostgreSQL bin is on PATH (best-effort)" {
	# If the user already configured PATH, do nothing.
	# Otherwise, try common install locations and add them for this session.
	$commonRoots = @(
		"$env:ProgramFiles\PostgreSQL",
		"$env:ProgramFiles(x86)\PostgreSQL"
	)

	$added = $false
	foreach ($root in $commonRoots) {
		if (-not (Test-Path $root)) { continue }
		$versions = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue | Sort-Object -Property Name -Descending
		foreach ($v in $versions) {
			$bin = Join-Path $v.FullName "bin"
			if (Test-Path $bin) {
				if ($env:PATH -notlike "*$bin*") {
					$env:PATH = "$bin;$env:PATH"
					$added = $true
				}
				break
			}
		}
		if ($added) { break }
	}
	if ($added) {
		Write-Ok "Added PostgreSQL bin to PATH for this session."
	} else {
		Write-Warn "PostgreSQL bin not modified (either already on PATH or not found)."
	}
}

# ----------------------------
# DO NOT OVERRIDE DATABASE CONFIG
# ----------------------------
Invoke-Step "Validate .env presence (do not auto-inject USE_SQLITE)" {
	$envCandidates = @(
		(Join-Path $BackendDir ".env"),
		(Join-Path $ScriptRoot ".env")
	)

	$found = $false
	foreach ($p in $envCandidates) {
		if (Test-Path $p) {
			$found = $true
			Write-Ok "Found .env at: $p"
			break
		}
	}

	if (-not $found) {
		Write-Warn ".env not found. This script will NOT force SQLite. Ensure your environment variables are set before starting."
	}
}

if ($DEBUG) {
	Show-SafeEnv
}

# ----------------------------
# Port checks (warn only)
# ----------------------------
Invoke-Step "Check ports (warn if already in use)" {
	foreach ($p in @(8000, 5173)) {
		if (Test-PortInUse -Port $p) {
			Write-Warn "Port $p is already in use. Startup may fail or attach to an existing service."
		} else {
			Write-Ok "Port $p is free."
		}
	}
}

# ----------------------------
# Activate venv + backend deps/migrations
# ----------------------------
$ActivateScript = Get-ActivateScriptPath -ScriptRoot $ScriptRoot
if (-not $ActivateScript) {
	throw "Could not find venv activation script. Expected .venv or venv near: $ScriptRoot"
}
$PythonExe = Get-PythonExeFromVenv -ActivateScriptPath $ActivateScript
if (-not $PythonExe) {
	throw "Could not find python.exe next to: $ActivateScript"
}

Invoke-Step "Activate backend venv (current session)" {
	# Keep behavior: activate in current shell for subsequent python/pip calls.
	. $ActivateScript
	Write-Ok "Activated venv: $env:VIRTUAL_ENV"
}

Invoke-Step "Install backend dependencies (pip)" {
	Push-Location $BackendDir
	try {
		& $PythonExe -m pip install -r requirements.txt
		if ($LASTEXITCODE -ne 0) { throw "pip install failed with exit code $LASTEXITCODE" }
	} finally {
		Pop-Location
	}
}

Invoke-Step "Run Django migrations" {
	Push-Location $BackendDir
	try {
		& $PythonExe manage.py migrate
		if ($LASTEXITCODE -ne 0) { throw "manage.py migrate failed with exit code $LASTEXITCODE" }
	} finally {
		Pop-Location
	}
}

# ----------------------------
# AI Model file checks (CRITICAL)
# ----------------------------
Invoke-Step "Verify sign-detection model files exist" {
	$modelDir = Join-Path $FrontendDir "public\model"
	$modelJson = Join-Path $modelDir "model.json"
	$weightsBin = Join-Path $modelDir "weights.bin"

	if (-not (Test-Path $modelJson)) {
		Write-Fail "Model file missing: $modelJson"
		throw "Model files missing → Sign detection will fail"
	}
	if (-not (Test-Path $weightsBin)) {
		Write-Fail "Model weights missing: $weightsBin"
		$bins = Get-ChildItem -Path $modelDir -Filter "*.bin" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
		if ($bins) {
			Write-Warn ("Found other .bin files: " + ($bins -join ", ") + ". If your model.json references shards, update this check accordingly.")
		}
		throw "Model files missing → Sign detection will fail"
	}
	Write-Ok "Model files present."
}

# ----------------------------
# Start backend + health check
# ----------------------------
Invoke-Step "Start Django backend (separate window, logs visible)" {
	$backendCmd = @(
		"Set-Location -LiteralPath '$BackendDir'",
		". '$ActivateScript'",
		"& '$PythonExe' manage.py runserver 8000"
	) -join "; "

	$backendProc = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCmd -PassThru
	Write-Ok "Backend process started (PID: $($backendProc.Id))."
}

Invoke-Step "Wait for backend port + API health" {
	if (-not (Wait-ForPort -Port 8000 -TimeoutSeconds 30)) {
		Write-Fail "Backend did not start listening on port 8000."
		throw "Backend server failed to start"
	}

	$healthUrl = "http://localhost:8000/api/health/"
	if (-not (Wait-HttpOk -Url $healthUrl -TimeoutSeconds 30)) {
		Write-Warn "Backend not responding at $healthUrl"
		Write-Warn "Backend not responding"
	} else {
		Write-Ok "Backend health check OK: $healthUrl"
	}
}

# ----------------------------
# Frontend deps + start (logs visible)
# ----------------------------
Invoke-Step "Start React frontend (separate window, logs visible)" {
	$npm = Get-Command npm -ErrorAction SilentlyContinue
	if (-not $npm) {
		throw "npm not found on PATH. Install Node.js and ensure npm is available."
	}

	$frontendCmd = @(
		"Set-Location -LiteralPath '$FrontendDir'",
		"npm install",
		"if (`$LASTEXITCODE -ne 0) { throw 'npm install failed' }",
		"npm run dev"
	) -join "; "

	$frontendProc = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $frontendCmd -PassThru
	Write-Ok "Frontend process started (PID: $($frontendProc.Id))."
}

# ----------------------------
# Open browser
# ----------------------------
Invoke-Step "Open browser" {
	Start-Process "http://localhost:5173"
}

Write-Host "`nAll done. Backend: http://localhost:8000 | Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "If WebSockets fail: confirm backend console shows Channels/ASGI startup and check browser DevTools → Network → WS." -ForegroundColor DarkGray



