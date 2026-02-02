param(
  [string]$OutputDir = "dist"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$agentDir = Join-Path $root "agent"
$sharedDir = Join-Path $root "shared"
$distDir = Join-Path $root $OutputDir

if (!(Test-Path $agentDir)) {
  Write-Error "Agent folder not found: $agentDir"
  exit 1
}
if (!(Test-Path $sharedDir)) {
  Write-Error "Shared folder not found: $sharedDir"
  exit 1
}

if (!(Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

$version = "0.0.0"
$verLine = Get-Content (Join-Path $agentDir "config.py") | Where-Object { $_ -match "AGENT_VERSION" } | Select-Object -First 1
if ($verLine -match "AGENT_VERSION\\s*=\\s*\"([^\"]+)\"") {
  $version = $Matches[1]
}

$tempDir = Join-Path $distDir "agent_pkg"
if (Test-Path $tempDir) {
  Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Copy-Item $agentDir (Join-Path $tempDir "agent") -Recurse -Force
Copy-Item $sharedDir (Join-Path $tempDir "shared") -Recurse -Force

# Remove unwanted files
Remove-Item -Recurse -Force (Join-Path $tempDir "agent\\.venv") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $tempDir "agent\\__pycache__") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $tempDir "agent\\config.json") -ErrorAction SilentlyContinue
Get-ChildItem $tempDir -Recurse -Include *.log, *.tmp | Remove-Item -Force -ErrorAction SilentlyContinue

$zipPath = Join-Path $distDir ("agent_v{0}.zip" -f $version)
Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -Force

Remove-Item -Recurse -Force $tempDir

Write-Host "Created: $zipPath"
