param(
  [string]$EnvFile = "backend\.env",
  [string]$BackupDir = "backups"
)

if (!(Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

$line = Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
  Write-Error "DATABASE_URL not found in $EnvFile"
  exit 1
}

# Strip DATABASE_URL= and optional quotes
$dbUrl = $line -replace '^DATABASE_URL=','' -replace '"',''
$dbUrl = $dbUrl.Trim()

if (!(Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if ($dbUrl -match '^sqlite') {
  if ($dbUrl -match 'sqlite:///(.+)$') {
    $dbPath = $Matches[1]
  } else {
    Write-Error "Unsupported sqlite URL format: $dbUrl"
    exit 1
  }

  if (!(Test-Path $dbPath)) {
    Write-Error "SQLite DB file not found: $dbPath"
    exit 1
  }

  $dest = Join-Path $BackupDir "ac_manager_$timestamp.db"
  Copy-Item -Path $dbPath -Destination $dest -Force
  Write-Host "SQLite backup created: $dest"
  exit 0
}

# PostgreSQL / Supabase
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  Write-Error "pg_dump not found in PATH. Install PostgreSQL client tools."
  exit 1
}

$outFile = Join-Path $BackupDir "ac_manager_$timestamp.dump"
& $pgDump $dbUrl -Fc -f $outFile
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Backup created: $outFile"
