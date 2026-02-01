# Agent Deployment (Stations)

This script prepares and starts the Agent on each simulator station.

## One-click
```
scripts\deploy_station.ps1 -ServerUrl "http://<server-ip>:8000" -AgentToken "<AGENT_TOKEN>" -StationName "SIM 1" -ACPath "D:\\SteamLibrary\\steamapps\\common\\assettocorsa" -InstallTask -StartNow
```

## Parameters
- `-ServerUrl` Backend URL
- `-AgentToken` must match backend AGENT_TOKEN
- `-StationName` visible name in dashboard
- `-ACPath` Assetto Corsa install path
- `-ContentDir` optional content path (defaults to `<ACPath>\content`)
- `-UpdateSigningKey` must match backend UPDATE_SIGNING_KEY
- `-LobbyAdminPassword` optional admin password for lobby server
- `-InstallTask` creates Windows scheduled task (on logon)
- `-StartNow` starts the agent immediately

## Notes
- Requires Python 3.10+ in PATH
- Uses agent\.venv and agent\requirements.txt
- Writes agent\config.json
