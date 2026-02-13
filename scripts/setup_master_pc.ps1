param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [Parameter(Mandatory = $true)]
  [string]$DatabasePassword,
  [string]$DatabaseName = "ac_manager",
  [string]$DatabaseUser = "ac_manager",
  [string]$PostgresHost = "127.0.0.1",
  [int]$PostgresPort = 5432,
  [string]$PostgresAdminUser = "postgres",
  [string]$BackupDir = "D:\\AC-BACKUPS",
  [int]$RetentionDays = 30,
  [string]$BackupStartTime = "03:00",
  [switch]$NoService,
  [string]$ServiceName = "ACManagerBackend",
  [string]$NssmPath = "nssm.exe",
  [switch]$MigrateFromSupabase,
  [string]$SupabaseUrl = "",
  [switch]$SkipAdminSetup,
  [string]$AdminUsername = "admin",
  [string]$AdminPassword = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Read-EnvMap([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }
  foreach ($line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith("#")) { continue }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $map[$parts[0].Trim()] = $parts[1].Trim().Trim('"')
    }
  }
  return $map
}

function Try-SetupAdmin([string]$ServerUrl, [string]$SetupToken, [string]$Username, [string]$Password) {
  if ([string]::IsNullOrWhiteSpace($SetupToken)) {
    Write-Host "Skipping /auth/users/setup (SETUP_TOKEN not found)."
    return
  }
  try {
    Invoke-RestMethod `
      -Uri "$ServerUrl/auth/users/setup" `
      -Method Post `
      -Headers @{ "X-Setup-Token" = $SetupToken } `
      -ContentType "application/json" `
      -Body (@{ username = $Username; password = $Password } | ConvertTo-Json) | Out-Null
    Write-Host "Admin user created via setup endpoint."
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match "Users already exist|400") {
      Write-Host "Admin setup already completed. Continuing."
    } else {
      Write-Host "Admin setup skipped: $msg"
    }
  }
}

function Login-Admin([string]$ServerUrl, [string]$Username, [string]$Password) {
  $login = Invoke-RestMethod `
    -Uri "$ServerUrl/auth/token" `
    -Method Post `
    -ContentType "application/x-www-form-urlencoded" `
    -Body @{ username = $Username; password = $Password }

  if (-not $login.access_token) {
    throw "Admin login failed: no access_token returned."
  }
  return [string]$login.access_token
}

function Save-StationTemplate(
  [string]$Path,
  [string]$ServerIpValue,
  [string]$AgentToken,
  [string]$UpdateSigningKey
) {
  $template = @()
  $template += "powershell -ExecutionPolicy Bypass -File .\scripts\setup_simulator_pc.ps1 -ServerIp `"$ServerIpValue`" -AgentToken `"$AgentToken`" -UpdateSigningKey `"$UpdateSigningKey`" -StationName `"SIM 1`""
  $template += ""
  $template += "Repeat on each simulator PC changing -StationName (SIM 2, SIM 3, ...)."
  $template | Set-Content -Encoding ASCII $Path
}

$serverUrl = "http://$($ServerIp.TrimEnd('/')):8000"
$kioskBaseUrl = "$serverUrl/kiosk"

$setupScript = Join-Path $root "scripts\setup_local_postgres_prod.ps1"
if (-not (Test-Path $setupScript)) {
  throw "setup_local_postgres_prod.ps1 not found: $setupScript"
}

$setupArgs = @{
  DatabasePassword = $DatabasePassword
  ServerIp = $ServerIp
  DatabaseName = $DatabaseName
  DatabaseUser = $DatabaseUser
  PostgresHost = $PostgresHost
  PostgresPort = $PostgresPort
  PostgresAdminUser = $PostgresAdminUser
  BackupDir = $BackupDir
  RetentionDays = $RetentionDays
  BackupStartTime = $BackupStartTime
  ServiceName = $ServiceName
  NssmPath = $NssmPath
}
if (-not $NoService) {
  $setupArgs.InstallService = $true
}
if ($MigrateFromSupabase) {
  $setupArgs.MigrateFromSupabase = $true
  $setupArgs.SupabaseUrl = $SupabaseUrl
}

& $setupScript @setupArgs
if ($LASTEXITCODE -ne 0) {
  throw "setup_local_postgres_prod.ps1 failed with exit code $LASTEXITCODE"
}

$envPath = Join-Path $root "backend\.env"
$envMap = Read-EnvMap -Path $envPath
$setupToken = if ($envMap.ContainsKey("SETUP_TOKEN")) { [string]$envMap["SETUP_TOKEN"] } else { "" }
$agentToken = if ($envMap.ContainsKey("AGENT_TOKEN")) { [string]$envMap["AGENT_TOKEN"] } else { "" }
$updateSigningKey = if ($envMap.ContainsKey("UPDATE_SIGNING_KEY")) { [string]$envMap["UPDATE_SIGNING_KEY"] } else { "" }
$publicApiToken = if ($envMap.ContainsKey("PUBLIC_API_TOKEN")) { [string]$envMap["PUBLIC_API_TOKEN"] } else { "" }

$onboardingDir = Join-Path $root "output\onboarding"
if (-not (Test-Path $onboardingDir)) {
  New-Item -ItemType Directory -Path $onboardingDir | Out-Null
}

$stationTemplatePath = Join-Path $onboardingDir "simulator_setup_command.txt"
Save-StationTemplate -Path $stationTemplatePath -ServerIpValue $ServerIp -AgentToken $agentToken -UpdateSigningKey $updateSigningKey

$kioskLinksPath = Join-Path $onboardingDir "kiosk_links_latest.txt"
$kioskScript = Join-Path $root "scripts\get_kiosk_links.ps1"

$canUseAdmin = (-not $SkipAdminSetup) -and (-not [string]::IsNullOrWhiteSpace($AdminPassword))
$accessToken = ""

if ($canUseAdmin) {
  Try-SetupAdmin -ServerUrl $serverUrl -SetupToken $setupToken -Username $AdminUsername -Password $AdminPassword
  $accessToken = Login-Admin -ServerUrl $serverUrl -Username $AdminUsername -Password $AdminPassword

  $authHeaders = @{ Authorization = "Bearer $accessToken" }
  $settingsBody = @{ key = "payment_public_kiosk_url"; value = $kioskBaseUrl } | ConvertTo-Json
  Invoke-RestMethod -Uri "$serverUrl/settings/" -Method Post -Headers $authHeaders -ContentType "application/json" -Body $settingsBody | Out-Null

  & $kioskScript -ServerUrl $serverUrl -Username $AdminUsername -Password $AdminPassword -KioskBaseUrl $kioskBaseUrl -OutputFile $kioskLinksPath
} elseif (-not [string]::IsNullOrWhiteSpace($publicApiToken)) {
  & $kioskScript -ServerUrl $serverUrl -ClientToken $publicApiToken -KioskBaseUrl $kioskBaseUrl -OutputFile $kioskLinksPath
} else {
  Write-Host "Skipped kiosk link export: provide admin credentials or configure PUBLIC_API_TOKEN."
}

Write-Host ""
Write-Host "Master PC setup complete."
Write-Host "Dashboard: $serverUrl"
Write-Host "Kiosk base URL: $kioskBaseUrl"
Write-Host "Simulator setup template: $stationTemplatePath"
if (Test-Path $kioskLinksPath) {
  Write-Host "Kiosk links file: $kioskLinksPath"
}
