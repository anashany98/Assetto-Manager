param(
  [string]$ServiceName = "ACManagerBackend",
  [string]$NssmPath = "nssm.exe"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$bat = Join-Path $root "scripts\run_backend.bat"
$logs = Join-Path $root "logs"

if (!(Test-Path $bat)) {
  Write-Error "Backend run script not found: $bat"
  exit 1
}

if (!(Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
  Write-Error "NSSM not found. Install NSSM and ensure nssm.exe is in PATH or pass -NssmPath."
  exit 1
}

if (!(Test-Path $logs)) {
  New-Item -ItemType Directory -Path $logs | Out-Null
}

& $NssmPath install $ServiceName $bat
& $NssmPath set $ServiceName AppDirectory $root
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout (Join-Path $logs "backend.out.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $logs "backend.err.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateSeconds 86400

Write-Host "Service installed: $ServiceName"
