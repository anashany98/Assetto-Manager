param(
  [string]$ServerUrl = "http://localhost:8000",
  [string]$Username = "",
  [string]$Password = "",
  [string]$ClientToken = "",
  [string]$KioskBaseUrl = "",
  [string]$OutputFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$ServerUrl = ($ServerUrl.TrimEnd('/'))
if ([string]::IsNullOrWhiteSpace($KioskBaseUrl)) {
  $KioskBaseUrl = "$ServerUrl/kiosk"
} else {
  $KioskBaseUrl = $KioskBaseUrl.TrimEnd('/')
}

$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($Username) -and -not [string]::IsNullOrWhiteSpace($Password)) {
  $login = Invoke-RestMethod `
    -Uri "$ServerUrl/auth/token" `
    -Method Post `
    -ContentType "application/x-www-form-urlencoded" `
    -Body @{ username = $Username; password = $Password }

  if (-not $login.access_token) {
    throw "Login failed. No access_token returned."
  }

  $headers["Authorization"] = "Bearer $($login.access_token)"
} elseif (-not [string]::IsNullOrWhiteSpace($ClientToken)) {
  $headers["X-Client-Token"] = $ClientToken
} else {
  throw "Provide either -Username/-Password or -ClientToken."
}

$stations = Invoke-RestMethod -Uri "$ServerUrl/stations/" -Method Get -Headers $headers
if ($null -eq $stations) {
  $stations = @()
}
if ($stations -isnot [System.Array]) {
  $stations = @($stations)
}

$rows = $stations |
  Where-Object { $_.is_active -ne $false } |
  Sort-Object -Property name |
  ForEach-Object {
    $code = [string]($_.kiosk_code)
    $link = ""
    if (-not [string]::IsNullOrWhiteSpace($code)) {
      $encodedCode = [System.Uri]::EscapeDataString($code)
      $link = "$KioskBaseUrl?kiosk=$encodedCode"
    }

    [PSCustomObject]@{
      station_id = $_.id
      station_name = $_.name
      kiosk_code = $code
      kiosk_link = $link
      ip_address = $_.ip_address
    }
  }

if ($rows.Count -eq 0) {
  Write-Host "No active stations found yet."
}

if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  $outDir = Join-Path $root "output\onboarding"
  if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
  }
  $OutputFile = Join-Path $outDir ("kiosk_links_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".txt")
}

$lines = @()
$lines += "KIOSK LINKS"
$lines += "Generated: $(Get-Date -Format s)"
$lines += "Server: $ServerUrl"
$lines += "Base kiosk URL: $KioskBaseUrl"
$lines += ""

foreach ($r in $rows) {
  $lines += "[$($r.station_id)] $($r.station_name)"
  $lines += "  Code : $($r.kiosk_code)"
  $lines += "  Link : $($r.kiosk_link)"
  $lines += "  IP   : $($r.ip_address)"
  $lines += ""
}

$lines | Set-Content -Encoding ASCII $OutputFile

if ($rows.Count -gt 0) {
  $rows | Format-Table -AutoSize | Out-Host
}
Write-Host "Saved: $OutputFile"
