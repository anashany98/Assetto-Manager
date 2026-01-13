$WScriptShell = New-Object -ComObject WScript.Shell

# Paths
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$StartupPath = $WScriptShell.SpecialFolders.Item("Startup")
$ProjectDir = "$PSScriptRoot\.."
$IconPath = Join-Path $ProjectDir "frontend\public\icon.ico"
$BatPath = Join-Path $ProjectDir "scripts\start_prod.bat"

# 1. Create Desktop Shortcut
$ShortcutPath = Join-Path $DesktopPath "Assetto Manager.lnk"
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $BatPath
$Shortcut.WorkingDirectory = Join-Path $ProjectDir "scripts"
$Shortcut.WindowStyle = 7 # Minimized (7) or Normal (1)? Let's use Normal (1) for now to see the console
$Shortcut.Description = "Assetto Corsa Manager - Productions"
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = $IconPath
}
$Shortcut.Save()

Write-Host "Acceso directo creado en el Escritorio: $ShortcutPath" -ForegroundColor Green

# 2. Add to Startup
$StartupShortcutPath = Join-Path $StartupPath "Assetto Manager AutoStart.lnk"
$StartupShortcut = $WScriptShell.CreateShortcut($StartupShortcutPath)
$StartupShortcut.TargetPath = $BatPath
$StartupShortcut.WorkingDirectory = Join-Path $ProjectDir "scripts"
$StartupShortcut.WindowStyle = 7 # Minimized
$StartupShortcut.Description = "Assetto Corsa Manager - AutoStart"
if (Test-Path $IconPath) {
    $StartupShortcut.IconLocation = $IconPath
}
$StartupShortcut.Save()

Write-Host "Acceso directo añadido al Inicio: $StartupShortcutPath" -ForegroundColor Green

Write-Host "`nInstalacion completada."
Start-Sleep -Seconds 3
