param(
  [string]$EnvFile = "backend\.env",
  [string]$EnvExample = "backend\.env.production.example",
  [string]$DatabaseUrl = "",
  [switch]$UseSqlite,
  [switch]$InstallService,
  [string]$ServiceName = "ACManagerBackend",
  [string]$NssmPath = "nssm.exe"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Get-RandomToken([int]$Length = 32) {
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Read-EnvFile([string]$Path) {
  $map = @{}
  if (!(Test-Path $Path)) { return $map }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_.Trim() -eq '') { return }
    $parts = $_ -split '=', 2
    if ($parts.Count -eq 2) {
      $key = $parts[0].Trim()
      $val = $parts[1].Trim().Trim('"')
      $map[$key] = $val
    }
  }
  return $map
}

function Write-EnvFile([string]$Path, [hashtable]$Map) {
  $lines = @()
  foreach ($k in $Map.Keys) {
    $v = $Map[$k]
    $lines += "$k=$v"
  }
  $lines | Set-Content -Encoding ASCII $Path
}

# 1) Ensure venv + backend deps
if (!(Test-Path ".venv")) {
  Write-Host "Creating virtualenv..."
  python -m venv .venv
}
if (Test-Path ".venv\Scripts\activate.bat") {
  cmd /c "call .venv\Scripts\activate.bat && pip install -r backend\requirements.txt"
}

# 2) Frontend build
if (!(Test-Path "frontend\node_modules")) {
  Write-Host "Installing frontend deps..."
  cmd /c "cd frontend && npm install"
}
Write-Host "Building frontend..."
cmd /c "cd frontend && npm run build"

# 3) Prepare .env
$envMap = @{}
foreach ($kv in (Read-EnvFile $EnvExample).GetEnumerator()) {
  $envMap[$kv.Key] = $kv.Value
}
foreach ($kv in (Read-EnvFile $EnvFile).GetEnumerator()) {
  $envMap[$kv.Key] = $kv.Value
}

$envMap["ENVIRONMENT"] = "production"

if ($DatabaseUrl) {
  $envMap["DATABASE_URL"] = $DatabaseUrl
} elseif ($UseSqlite) {
  $envMap["DATABASE_URL"] = "sqlite:///./ac_manager_local.db"
}

if (-not $envMap.ContainsKey("DATABASE_URL") -or [string]::IsNullOrWhiteSpace($envMap["DATABASE_URL"])) {
  Write-Error "DATABASE_URL is missing. Pass -DatabaseUrl or -UseSqlite."
  exit 1
}

function Ensure-Value([string]$Key, [string]$DefaultValue) {
  if (-not $envMap.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace($envMap[$Key]) -or $envMap[$Key] -eq 'change-me') {
    $envMap[$Key] = $DefaultValue
  }
}

Ensure-Value "ALLOWED_ORIGINS" "http://localhost:8000"
Ensure-Value "SECRET_KEY" (Get-RandomToken 32)
Ensure-Value "SETUP_TOKEN" (Get-RandomToken 16)
Ensure-Value "AGENT_TOKEN" (Get-RandomToken 16)
Ensure-Value "UPDATE_SIGNING_KEY" (Get-RandomToken 32)
Ensure-Value "PUBLIC_API_TOKEN" (Get-RandomToken 16)
Ensure-Value "PUBLIC_WS_TOKEN" (Get-RandomToken 16)
Ensure-Value "AUTO_SCHEMA" "true"

Write-EnvFile $EnvFile $envMap
Write-Host "Wrote $EnvFile"
Write-Host "NOTE: AUTO_SCHEMA is set to true for the first run. Set it to false after the DB is initialized."
Write-Host ("AGENT_TOKEN: " + $envMap["AGENT_TOKEN"])
Write-Host ("UPDATE_SIGNING_KEY: " + $envMap["UPDATE_SIGNING_KEY"])

# 4) Optional service install
if ($InstallService) {
  & scripts\install_service.ps1 -ServiceName $ServiceName -NssmPath $NssmPath
}

# 5) Run backend
Write-Host "Starting backend..."
cmd /c "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 2"
