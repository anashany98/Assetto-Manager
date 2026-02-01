param(
  [string]$OutputDir = "dist"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$agentDir = Join-Path $root "agent"
$distDir = Join-Path $root $OutputDir
$venvDir = Join-Path $agentDir ".venv"

if (!(Test-Path $agentDir)) {
  Write-Error "Agent folder not found: $agentDir"
  exit 1
}

if (!(Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

if (!(Test-Path $venvDir)) {
  Write-Host "Creating agent venv..."
  python -m venv $venvDir
}

Write-Host "Installing agent dependencies + pyinstaller..."
cmd /c "call `"$venvDir\\Scripts\\activate.bat`" && pip install -r `"$agentDir\\requirements.txt`" && pip install pyinstaller"

Push-Location $agentDir
try {
  Write-Host "Building EXE..."
  cmd /c "call `"$venvDir\\Scripts\\activate.bat`" && pyinstaller --onefile --clean --name AC_Manager_Agent --add-data `"..\\shared;shared`" main.py"
} finally {
  Pop-Location
}

$exePath = Join-Path $agentDir "dist\\AC_Manager_Agent.exe"
if (!(Test-Path $exePath)) {
  Write-Error "EXE not found: $exePath"
  exit 1
}

$dest = Join-Path $distDir "AC_Manager_Agent.exe"
Copy-Item $exePath $dest -Force
Write-Host "Built: $dest"
