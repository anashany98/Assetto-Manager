param(
  [string]$EnvFile = "backend\.env",
  [string]$BackupDir = "backups",
  [int]$RetentionDays = 7,
  [string]$TaskName = "ACManagerBackup",
  [string]$StartTime = "03:00"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$script = Join-Path $root "scripts\backup_db.ps1"

if (!(Test-Path $script)) {
  Write-Error "backup_db.ps1 not found: $script"
  exit 1
}

$envPath = Join-Path $root $EnvFile
$backupPath = Join-Path $root $BackupDir

$cmd = "powershell.exe -ExecutionPolicy Bypass -File `"$script`" -EnvFile `"$envPath`" -BackupDir `"$backupPath`" -RetentionDays $RetentionDays"

$create = "schtasks /Create /TN `"$TaskName`" /TR `"$cmd`" /SC DAILY /ST $StartTime /RL HIGHEST /F"
cmd /c $create

Write-Host "Scheduled task created: $TaskName"
