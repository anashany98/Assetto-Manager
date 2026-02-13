param(
  [Parameter(Mandatory = $true)]
  [string]$DatabasePassword,
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [string]$DatabaseName = "ac_manager",
  [string]$DatabaseUser = "ac_manager",
  [string]$PostgresHost = "127.0.0.1",
  [int]$PostgresPort = 5432,
  [string]$PostgresAdminUser = "postgres",
  [string]$BackupDir = "D:\AC-BACKUPS",
  [int]$RetentionDays = 30,
  [string]$BackupStartTime = "03:00",
  [switch]$InstallService,
  [string]$ServiceName = "ACManagerBackend",
  [string]$NssmPath = "nssm.exe",
  [switch]$MigrateFromSupabase,
  [string]$SupabaseUrl = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found in PATH: $Name"
  }
}

function Escape-SqlLiteral([string]$Input) {
  return $Input.Replace("'", "''")
}

function Escape-SqlIdentifier([string]$Input) {
  return $Input.Replace('"', '""')
}

function Wait-Health([string]$Url, [int]$Attempts = 30, [int]$DelaySeconds = 2) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 5
      if ($resp.status -eq "ok") {
        return $true
      }
    } catch {
      Start-Sleep -Seconds $DelaySeconds
    }
  }
  return $false
}

Write-Host "Checking prerequisites..."
Require-Command "psql"
Require-Command "pg_dump"
Require-Command "pg_restore"

if ($InstallService) {
  Require-Command $NssmPath
}

if ($MigrateFromSupabase -and [string]::IsNullOrWhiteSpace($SupabaseUrl)) {
  throw "You enabled -MigrateFromSupabase but did not pass -SupabaseUrl."
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$dbUserEsc = Escape-SqlIdentifier $DatabaseUser
$dbNameEsc = Escape-SqlIdentifier $DatabaseName
$dbPassEsc = Escape-SqlLiteral $DatabasePassword
$dbNameLit = Escape-SqlLiteral $DatabaseName

$adminConnArgs = @(
  "-h", $PostgresHost,
  "-p", $PostgresPort.ToString(),
  "-U", $PostgresAdminUser,
  "-d", "postgres",
  "-v", "ON_ERROR_STOP=1"
)

Write-Host "Ensuring PostgreSQL role/database exist..."
$roleSql = "DO `$$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$dbUserEsc') THEN CREATE ROLE `"$dbUserEsc`" LOGIN PASSWORD '$dbPassEsc'; ELSE ALTER ROLE `"$dbUserEsc`" WITH LOGIN PASSWORD '$dbPassEsc'; END IF; END `$$;"
& psql @adminConnArgs -c $roleSql

$dbExists = & psql @adminConnArgs -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$dbNameLit';"
if (-not $dbExists -or $dbExists.Trim() -ne "1") {
  & psql @adminConnArgs -c "CREATE DATABASE `"$dbNameEsc`" OWNER `"$dbUserEsc`";"
}
& psql @adminConnArgs -c "GRANT ALL PRIVILEGES ON DATABASE `"$dbNameEsc`" TO `"$dbUserEsc`";"

$dbUserUrl = [System.Uri]::EscapeDataString($DatabaseUser)
$dbPassUrl = [System.Uri]::EscapeDataString($DatabasePassword)
$dbNameUrl = [System.Uri]::EscapeDataString($DatabaseName)
$localDbUrl = "postgresql://{0}:{1}@{2}:{3}/{4}" -f $dbUserUrl, $dbPassUrl, $PostgresHost, $PostgresPort, $dbNameUrl

if ($MigrateFromSupabase) {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $migrationDump = Join-Path $BackupDir "supabase_migration_$ts.dump"
  Write-Host "Creating migration dump from Supabase..."
  & pg_dump $SupabaseUrl -Fc -f $migrationDump
  Write-Host "Restoring dump into local PostgreSQL..."
  & pg_restore --clean --if-exists --no-owner --no-privileges -d $localDbUrl $migrationDump
}

Write-Host "Running production deploy script (without blocking start)..."
$deployScript = Join-Path $root "scripts\deploy_prod.ps1"
if ($InstallService) {
  & $deployScript -DatabaseUrl $localDbUrl -NoStart -InstallService -ServiceName $ServiceName -NssmPath $NssmPath
} else {
  & $deployScript -DatabaseUrl $localDbUrl -NoStart
}

$envPath = Join-Path $root "backend\.env"
if (-not (Test-Path $envPath)) {
  throw "Expected env file not found: $envPath"
}

Write-Host "Updating ALLOWED_ORIGINS in backend/.env..."
$allowedOrigins = "http://$ServerIp:8000,http://localhost:8000"
$envLines = Get-Content $envPath
if ($envLines | Where-Object { $_ -match '^ALLOWED_ORIGINS=' }) {
  $envLines = $envLines | ForEach-Object {
    if ($_ -match '^ALLOWED_ORIGINS=') { "ALLOWED_ORIGINS=$allowedOrigins" } else { $_ }
  }
} else {
  $envLines += "ALLOWED_ORIGINS=$allowedOrigins"
}
$envLines | Set-Content -Encoding ASCII $envPath

Write-Host "Scheduling daily backups..."
$scheduleScript = Join-Path $root "scripts\schedule_backup.ps1"
& $scheduleScript -EnvFile "backend\.env" -BackupDir $BackupDir -RetentionDays $RetentionDays -TaskName "ACManagerBackup" -StartTime $BackupStartTime

Write-Host "Ensuring firewall rule for TCP 8000..."
$ruleName = "ACManager 8000"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow | Out-Null
}

if ($InstallService) {
  Write-Host "Starting Windows service..."
  Start-Service -Name $ServiceName
} else {
  Write-Host "Starting backend in background process..."
  $runScript = Join-Path $root "scripts\run_backend.bat"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$runScript`"" -WorkingDirectory $root | Out-Null
}

Write-Host "Waiting for health endpoint..."
$healthy = Wait-Health -Url "http://localhost:8000/health"
if (-not $healthy) {
  throw "Backend did not become healthy in time."
}

Write-Host ""
Write-Host "Production setup complete."
Write-Host "Dashboard: http://$ServerIp`:8000"
Write-Host "Local URL: http://localhost:8000"
Write-Host "Backups: $BackupDir"
Write-Host "Scheduled task: ACManagerBackup at $BackupStartTime"
