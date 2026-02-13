param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [Parameter(Mandatory = $true)]
  [string]$AgentToken,
  [Parameter(Mandatory = $true)]
  [string]$UpdateSigningKey,
  [string]$StationName = "",
  [string]$ACPath = "",
  [string]$ContentDir = "",
  [string]$StreamUrl = "",
  [string]$LobbyAdminPassword = "",
  [string]$TaskName = "ACManagerAgent",
  [switch]$NoTask,
  [switch]$NoStart,
  [switch]$OpenStationDisplay
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Resolve-AcPath([string]$InputPath) {
  if (-not [string]::IsNullOrWhiteSpace($InputPath) -and (Test-Path $InputPath)) {
    return $InputPath
  }

  $candidates = @(
    "D:\SteamLibrary\steamapps\common\assettocorsa",
    "C:\SteamLibrary\steamapps\common\assettocorsa",
    "C:\Program Files (x86)\Steam\steamapps\common\assettocorsa"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return ""
}

$serverUrl = if ($ServerIp -match '^https?://') { $ServerIp.TrimEnd('/') } else { "http://$($ServerIp.TrimEnd('/')):8000" }
$resolvedStationName = if ([string]::IsNullOrWhiteSpace($StationName)) { $env:COMPUTERNAME } else { $StationName }
$resolvedAcPath = Resolve-AcPath -InputPath $ACPath

if ([string]::IsNullOrWhiteSpace($resolvedAcPath)) {
  throw "Assetto Corsa path not found. Pass -ACPath explicitly."
}

$deployScript = Join-Path $root "scripts\deploy_station.ps1"
if (-not (Test-Path $deployScript)) {
  throw "deploy_station.ps1 not found: $deployScript"
}

$deployArgs = @{
  ServerUrl = $serverUrl
  AgentToken = $AgentToken
  StationName = $resolvedStationName
  ACPath = $resolvedAcPath
  UpdateSigningKey = $UpdateSigningKey
  TaskName = $TaskName
}

if (-not [string]::IsNullOrWhiteSpace($ContentDir)) {
  $deployArgs.ContentDir = $ContentDir
}
if (-not [string]::IsNullOrWhiteSpace($StreamUrl)) {
  $deployArgs.StreamUrl = $StreamUrl
}
if (-not [string]::IsNullOrWhiteSpace($LobbyAdminPassword)) {
  $deployArgs.LobbyAdminPassword = $LobbyAdminPassword
}
if (-not $NoTask) {
  $deployArgs.InstallTask = $true
}
if (-not $NoStart) {
  $deployArgs.StartNow = $true
}

& $deployScript @deployArgs

if ($LASTEXITCODE -ne 0) {
  throw "deploy_station.ps1 failed with exit code $LASTEXITCODE"
}

if ($OpenStationDisplay) {
  Start-Process "$serverUrl/station-display" | Out-Null
}

Write-Host ""
Write-Host "Simulator PC setup complete."
Write-Host "Server: $serverUrl"
Write-Host "Station: $resolvedStationName"
Write-Host "AC path: $resolvedAcPath"
Write-Host ""
Write-Host "Next on master PC (to get tablet links):"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\get_kiosk_links.ps1 -ServerUrl $serverUrl -Username <admin> -Password <password>"
