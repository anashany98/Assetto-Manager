param(
  [string]$ServerUrl = "http://localhost:8000",
  [string]$AgentToken = "",
  [string]$StationName = "",
  [string]$ACPath = "",
  [string]$ContentDir = "",
  [string]$StreamUrl = "",
  [string]$UpdateSigningKey = "",
  [string]$LobbyAdminPassword = "",
  [switch]$InstallTask,
  [switch]$StartNow,
  [string]$TaskName = "ACManagerAgent"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$agentDir = Join-Path $root "agent"
$venvDir = Join-Path $agentDir ".venv"
$configPath = Join-Path $agentDir "config.json"
$reqPath = Join-Path $agentDir "requirements.txt"
$startBat = Join-Path $agentDir "start_agent.bat"

if (!(Test-Path $agentDir)) {
  Write-Error "Agent folder not found: $agentDir"
  exit 1
}

# 1) Create venv
if (!(Test-Path $venvDir)) {
  Write-Host "Creating agent venv..."
  python -m venv $venvDir
}

# 2) Install deps
if (!(Test-Path $reqPath)) {
  Write-Error "Agent requirements not found: $reqPath"
  exit 1
}

Write-Host "Installing agent dependencies..."
cmd /c "call \"$venvDir\\Scripts\\activate.bat\" && pip install -r \"$reqPath\""

# 3) Build config.json
$config = @{}
if (Test-Path $configPath) {
  try {
    $config = Get-Content $configPath | ConvertFrom-Json
  } catch {
    $config = @{}
  }
}

if ($ServerUrl) { $config.server_url = $ServerUrl }
if ($AgentToken) { $config.agent_token = $AgentToken }
if ($StationName) { $config.station_name = $StationName }
if ($ACPath) { $config.ac_path = $ACPath }

if ($ContentDir) {
  $config.ac_content_dir = $ContentDir
} elseif ($ACPath -and -not $config.ac_content_dir) {
  $config.ac_content_dir = (Join-Path $ACPath "content")
}

if ($UpdateSigningKey) { $config.update_signing_key = $UpdateSigningKey }
if ($LobbyAdminPassword) { $config.lobby_admin_password = $LobbyAdminPassword }
if ($StreamUrl) { $config.stream_url = $StreamUrl }

if (-not $UpdateSigningKey) {
  Write-Host "WARNING: update_signing_key not set. Signed updates will be rejected."
}

# Defaults if still missing
if (-not $config.steam_exe) { $config.steam_exe = "C:/Program Files (x86)/Steam/Steam.exe" }
if (-not $config.steam_app_id) { $config.steam_app_id = "244210" }
if ($null -eq $config.launch_via_steam) { $config.launch_via_steam = $false }

$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding ASCII $configPath
Write-Host "Wrote $configPath"

# 4) Create start_agent.bat
@"
@echo off
cd /d "%~dp0"
if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat
python main.py
"@ | Set-Content -Encoding ASCII $startBat
Write-Host "Wrote $startBat"

# 5) Optional scheduled task
if ($InstallTask) {
  Write-Host "Creating scheduled task '$TaskName' (on logon)..."
  $taskCmd = "schtasks /Create /TN \"$TaskName\" /TR \"$startBat\" /SC ONLOGON /RL HIGHEST /F"
  cmd /c $taskCmd
}

# 6) Start now
if ($StartNow) {
  Write-Host "Starting agent..."
  Start-Process -FilePath $startBat -WorkingDirectory $agentDir
}
