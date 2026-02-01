param(
  [string]$ServiceName = "ACManagerBackend",
  [string]$NssmPath = "nssm.exe"
)

if (!(Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
  Write-Error "NSSM not found. Install NSSM and ensure nssm.exe is in PATH or pass -NssmPath."
  exit 1
}

& $NssmPath stop $ServiceName
& $NssmPath remove $ServiceName confirm
Write-Host "Service removed: $ServiceName"
