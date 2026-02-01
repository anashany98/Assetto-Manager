# Windows Service Setup (NSSM)

This project can run as a Windows service using NSSM.

## 1) Install NSSM
- Download NSSM from https://nssm.cc/download
- Add the folder containing nssm.exe to PATH

## 2) Install the service
Run in PowerShell from repo root:

  scripts\install_service.ps1

Optional parameters:
  scripts\install_service.ps1 -ServiceName "ACManagerBackend" -NssmPath "C:\tools\nssm.exe"

This uses scripts\run_backend.bat and writes logs to logs\backend.out.log and logs\backend.err.log.

## 3) Remove the service
  scripts\uninstall_service.ps1

## 4) Start/Stop using Services UI
Open services.msc and find ACManagerBackend.
