param(
  [string]$EnvFile = "backend\.env",
  [string]$EnvExample = "backend\.env.production.example",
  [string]$DatabaseUrl = "",
  [switch]$UseSqlite,
  [switch]$NoStart,
  [switch]$InstallService,
  [string]$ServiceName = "ACManagerBackend",
  [string]$NssmPath = "nssm.exe"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Get-VenvPython() {
  $candidate = Join-Path $root ".venv\\Scripts\\python.exe"
  if (Test-Path $candidate) { return $candidate }
  return "python"
}

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
$py = Get-VenvPython
Write-Host ("Using Python: " + $py)
& $py -m pip install -r backend\\requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2) Prepare backend/.env
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
if (-not $envMap.ContainsKey("CLIENT_TOKENS") -or [string]::IsNullOrWhiteSpace($envMap["CLIENT_TOKENS"]) -or $envMap["CLIENT_TOKENS"] -eq 'change-me') {
  $clientTokens = @()
  $publicApiToken = $envMap["PUBLIC_API_TOKEN"]
  $publicWsToken = $envMap["PUBLIC_WS_TOKEN"]
  if ($publicApiToken -and $publicApiToken -eq $publicWsToken) {
    $clientTokens += "$publicApiToken:public:read,ws:public"
  } else {
    if ($publicApiToken) { $clientTokens += "$publicApiToken:public:read" }
    if ($publicWsToken) { $clientTokens += "$publicWsToken:ws:public" }
  }
  if ($clientTokens.Count -gt 0) {
    $envMap["CLIENT_TOKENS"] = ($clientTokens -join ";")
  }
}
$envMap["AUTO_SCHEMA"] = "false"
$envMap["ALLOW_PUBLIC_TOKEN_QUERY"] = "false"
$envMap["REQUIRE_SECRETS"] = "true"
Ensure-Value "UVICORN_WORKERS" "1"
Ensure-Value "ENABLE_SCHEDULER" "true"

Write-EnvFile $EnvFile $envMap
Write-Host "Wrote $EnvFile"
Write-Host ("AGENT_TOKEN: " + $envMap["AGENT_TOKEN"])
Write-Host ("UPDATE_SIGNING_KEY: " + $envMap["UPDATE_SIGNING_KEY"])

# 3) Write frontend/.env.production so kiosk/public flows work in production builds
$feEnvPath = Join-Path $root "frontend\\.env.production"
$feApiToken = $envMap["PUBLIC_API_TOKEN"]
$feWsToken = $envMap["PUBLIC_WS_TOKEN"]
@(
  "VITE_PUBLIC_API_TOKEN=$feApiToken"
  "VITE_PUBLIC_WS_TOKEN=$feWsToken"
  "VITE_USE_WS_QUERY_TOKEN=false"
) | Set-Content -Encoding ASCII $feEnvPath
Write-Host "Wrote $feEnvPath"

# 4) Frontend build
if (!(Test-Path "frontend\\node_modules")) {
  Write-Host "Installing frontend deps..."
  cmd /c "cd frontend && npm install"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host "Building frontend..."
cmd /c "cd frontend && npm run build"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5) Validate critical config early
Write-Host "Validating production environment..."
$env:ENVIRONMENT = "production"
$env:REQUIRE_SECRETS = "true"
& $py -c "from backend.app.main import _validate_runtime_config; _validate_runtime_config()"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 6) Optional service install
if ($InstallService) {
  & scripts\install_service.ps1 -ServiceName $ServiceName -NssmPath $NssmPath
}

# 7) Run backend
if ($NoStart) {
  Write-Host "Deployment completed. Backend start skipped (-NoStart)."
  exit 0
}

Write-Host "Bootstrapping DB schema (create_all) if needed..."
& $py bootstrap_db.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$workers = $envMap["UVICORN_WORKERS"]
if (-not $workers) { $workers = "1" }
Write-Host ("Starting backend... (workers=" + $workers + ")")
& $py -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers $workers
