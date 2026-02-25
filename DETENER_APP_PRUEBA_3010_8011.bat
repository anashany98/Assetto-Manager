@echo off
setlocal
title AC Manager - Detener Prueba Local (3010/8011)

echo Cerrando procesos en puertos 3010 y 8011...
powershell -NoProfile -Command ^
  "$ports=@(3010,8011); $conns=Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }; $ids=$conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach($id in $ids){ try { Stop-Process -Id $id -Force -ErrorAction Stop; Write-Host ('Detenido PID ' + $id) } catch {} }"

echo.
echo Listo.
pause

