<#
.SYNOPSIS
Unified deployment script for AC-MANAGER (server and station) with kiosk support.

.DESCRIPTION
This script simplifies the deployment of AC-MANAGER for a 4-simulator arcade/bar setup.
It handles both server and station deployment, including kiosk configuration.
.Describes the steps for a simple, guided deployment with validation.

.PARAMETER Mode
Specifies whether to deploy the server or a station. Values: 'Server' or 'Station'.

.EXAMPLE
.\Deploy-ACManager.ps1 -Mode Server
Deploys the server component.

.EXAMPLE
.\Deploy-ACManager.ps1 -Mode Station
Deploys a station component.

.NOTES
Author: AI Assistant
Created: 2026-03-25
#>

[CmdletBinding()]
param(
    [ValidateSet('Server', 'Station')]
    [string]$Mode = 'Server',
    
    [switch]$NoStart,
    [switch]$UseSqlite,
    [string]$DatabaseUrl = "",
    
    [string]$ServerUrl = "",
    [string]$AgentToken = "",
    [string]$UpdateSigningKey = "",
    [string]$StationName = "",
    [string]$ACPath = "",
    [switch]$HasKiosk
)

# Helper functions
function Write-Header($text) {
    Write-Host "`n=== $text ===`n" -ForegroundColor Cyan
}

function Write-Success($text) {
    Write-Host "✅ $text" -ForegroundColor Green
}

function Write-Warning($text) {
    Write-Host "⚠️  $text" -ForegroundColor Yellow
}

function Write-Error($text) {
    Write-Host "❌ $text" -ForegroundColor Red
}

function Get-VenvPython($root) {
    $candidate = Join-Path $root ".venv\Scripts\python.exe"
    if (Test-Path $candidate) { return $candidate }
    return "python"
}

function Get-RandomToken([int]$Length = 32) {
    $bytes = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Read-EnvFile([string]$Path) {
    $map = @{}
    if (!(Test-Path $Path)) { return $map }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^\s*#' -or $_.Trim() -eq '') { return }
        $parts = $_ -split '=', 2
        if ($parts.Count -eq 2) {
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"')
            $map[$key] = $val
        }
    }
    return $map
}

function Write-EnvFile([string]$Path, [hashtable]$Map) {
    $lines = @()
    foreach ($k in $Map.Keys) {
        $v = $Map[$k]
        $lines += "$k=$v"
    }
    $lines | Set-Content -Encoding ASCII $Path
}

# Main script
$scriptRoot = Resolve-Path (Join-Path $PSScriptRoot ".")
Set-Location $scriptRoot

try {
    if ($Mode -eq 'Server') {
        Write-Header "AC-MANAGER SERVER DEPLOYMENT"
        
        # 1) Ensure venv + backend deps
        if (!(Test-Path ".venv")) {
            Write-Host "Creating virtual environment..."
            python -m venv .venv
        }
        $py = Get-VenvPython $scriptRoot
        Write-Host ("Using Python: $py")
        & $py -m pip install -r backend\requirements.txt
        if ($LASTEXITCODE -ne 0) { throw "Backend dependencies installation failed" }
        
        # 2) Prepare backend/.env
        $envExample = Join-Path $scriptRoot "backend\.env.production.example"
        $envFile = Join-Path $scriptRoot "backend\.env"
        $envMap = @{}
        
        foreach ($kv in (Read-EnvFile $envExample).GetEnumerator()) {
            $envMap[$kv.Key] = $kv.Value
        }
        foreach ($kv in (Read-EnvFile $envFile).GetEnumerator()) {
            $envMap[$kv.Key] = $kv.Value
        }
        
        $envMap["ENVIRONMENT"] = "production"
        
        if ($DatabaseUrl) {
            $envMap["DATABASE_URL"] = $DatabaseUrl
        } elseif ($UseSqlite) {
            $envMap["DATABASE_URL"] = "sqlite:///./ac_manager_local.db"
            Write-Host "Using SQLite database (file: ac_manager_local.db)"
        }
        
        if (-not $envMap.ContainsKey("DATABASE_URL") -or [string]::IsNullOrWhiteSpace($envMap["DATABASE_URL"])) {
            throw "DATABASE_URL is required. Use -DatabaseUrl or -UseSqlite."
        }
        
        function Ensure-Value([string]$Key, [string]$DefaultValue) {
            if (-not $envMap.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace($envMap[$Key]) -or $envMap[$Key] -eq 'change-me') {
                $envMap[$Key] = $DefaultValue
            }
        }
        
        # Ensure critical values
        Ensure-Value "ALLOWED_ORIGINS" "*"
        Ensure-Value "SECRET_KEY" (Get-RandomToken 32)
        Ensure-Value "SETUP_TOKEN" (Get-RandomToken 16)
        Ensure-Value "AGENT_TOKEN" (Get-RandomToken 16)
        Ensure-Value "UPDATE_SIGNING_KEY" (Get-RandomToken 32)
        Ensure-Value "PUBLIC_API_TOKEN" (Get-RandomToken 16)
        Ensure-Value "PUBLIC_WS_TOKEN" (Get-RandomToken 16)
        
        # Handle CLIENT_TOKENS for kiosk/public access
        if (-not $envMap.ContainsKey("CLIENT_TOKENS") -or [string]::IsNullOrWhiteSpace($envMap["CLIENT_TOKENS"]) -or $envMap["CLIENT_TOKENS"] -eq 'change-me') {
            $clientTokens = @()
            $publicApiToken = $envMap["PUBLIC_API_TOKEN"]
            $publicWsToken = $envMap["PUBLIC_WS_TOKEN"]
            
            if ($publicApiToken -and $publicApiToken -eq $publicWsToken) {
                $clientTokens += "$publicApiToken:public:read,ws:public"
            } else {
                if ($publicApiToken) { $clientTokens += "$publicApiToken:public:read" }
                if ($publicWsToken) { $clientTokens += "$publicWsToken:ws:public" }
            }
            
            if ($clientTokens.Count -gt 0) {
                $envMap["CLIENT_TOKENS"] = ($clientTokens -join ";")
            }
        }
        
        $envMap["AUTO_SCHEMA"] = "false"
        $envMap["ALLOW_PUBLIC_TOKEN_QUERY"] = "false"
        $envMap["REQUIRE_SECRETS"] = "true"
        Ensure-Value "UVICORN_WORKERS" "1"
        Ensure-Value "ENABLE_SCHEDULER" "true"
        
        Write-EnvFile $envFile $envMap
        Write-Success "Wrote $envFile"
        Write-Host ("AGENT_TOKEN: " + $envMap["AGENT_TOKEN"])
        Write-Host ("UPDATE_SIGNING_KEY: " + $envMap["UPDATE_SIGNING_KEY"])
        Write-Host ("PUBLIC_API_TOKEN: " + $envMap["PUBLIC_API_TOKEN"])
        Write-Host ("PUBLIC_WS_TOKEN: " + $envMap["PUBLIC_WS_TOKEN"])
        
        # 3) Write frontend/.env.production for kiosk/public flows
        $feEnvPath = Join-Path $scriptRoot "frontend\.env.production"
        $feApiToken = $envMap["PUBLIC_API_TOKEN"]
        $feWsToken = $envMap["PUBLIC_WS_TOKEN"]
        @(
            "VITE_PUBLIC_API_TOKEN=$feApiToken"
            "VITE_PUBLIC_WS_TOKEN=$feWsToken"
            "VITE_USE_WS_QUERY_TOKEN=false"
        ) | Set-Content -Encoding ASCII $feEnvPath
        Write-Success "Wrote $feEnvPath"
        
        # 4) Frontend build
        if (!(Test-Path "frontend\node_modules")) {
            Write-Host "Installing frontend dependencies..."
            cmd /c "cd frontend && npm install"
            if ($LASTEXITCODE -ne 0) { throw "Frontend dependencies installation failed" }
        }
        Write-Host "Building frontend..."
        cmd /c "cd frontend && npm run build"
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
        
        # 5) Validate configuration
        Write-Host "Validating production environment..."
        $env:ENVIRONMENT = "production"
        $env:REQUIRE_SECRETS = "true"
        & $py -c "from backend.app.main import _validate_runtime_config; _validate_runtime_config()"
        if ($LASTEXITCODE -ne 0) { throw "Environment validation failed" }
        
        # 6) Bootstrap database
        Write-Host "Bootstrapping database schema..."
        & $py bootstrap_db.py
        if ($LASTEXITCODE -ne 0) { throw "Database bootstrap failed" }
        
        # 7) Start backend
        if ($NoStart) {
            Write-Success "Deployment completed. Backend start skipped (-NoStart)."
            Write-Host "To start the backend later, run: start_prod.bat"
            exit 0
        }
        
        $workers = $envMap["UVICORN_WORKERS"]
        if (-not $workers) { $workers = "1" }
        Write-Host ("Starting backend... (workers=$workers)")
        & $py -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers $workers
    }
    elseif ($Mode -eq 'Station') {
        Write-Header "AC-MANAGER STATION DEPLOYMENT"
        
        # 1) Validate required parameters
        if (-not $ServerUrl) { $ServerUrl = Read-Host "Enter server URL (e.g., http://192.168.1.100:8000)" }
        if (-not $AgentToken) { $AgentToken = Read-Host "Enter agent token (from server deployment)" }
        if (-not $UpdateSigningKey) { $UpdateSigningKey = Read-Host "Enter update signing key (from server deployment)" }
        if (-not $StationName) { $StationName = Read-Host "Enter station name (e.g., SIM 1)" }
        if (-not $ACPath) { $ACPath = Read-Host "Enter Assetto Corsa installation path (e.g., D:\SteamLibrary\steamapps\common\assettocorsa)" }
        
        if (-not (Test-Path $ACPath)) {
            throw "Assetto Corsa path not found: $ACPath"
        }
        
        # 2) Setup agent
        $root = Resolve-Path (Join-Path $PSScriptRoot ".")
        $agentDir = Join-Path $root "agent"
        $venvDir = Join-Path $agentDir ".venv"
        $configPath = Join-Path $agentDir "config.json"
        $reqPath = Join-Path $agentDir "requirements.txt"
        $startBat = Join-Path $agentDir "start_agent.bat"
        
        if (!(Test-Path $agentDir)) {
            throw "Agent folder not found: $agentDir"
        }
        
        # 2a) Create venv
        if (!(Test-Path $venvDir)) {
            Write-Host "Creating agent virtual environment..."
            python -m venv $venvDir
        }
        
        # 2b) Install dependencies
        if (!(Test-Path $reqPath)) {
            throw "Agent requirements not found: $reqPath"
        }
        
        Write-Host "Installing agent dependencies..."
        cmd /c "call `"$venvDir\Scripts\activate.bat`" && pip install -r `"$reqPath`""
        if ($LASTEXITCODE -ne 0) { throw "Agent dependencies installation failed" }
        
        # 2c) Build config.json
        $config = @{}
        if (Test-Path $configPath) {
            try {
                $config = Get-Content $configPath | ConvertFrom-Json
            } catch {
                $config = @{}
            }
        }
        
        $config.server_url = $ServerUrl
        $config.agent_token = $AgentToken
        $config.station_name = $StationName
        $config.ac_path = $ACPath
        
        if ($UpdateSigningKey) { $config.update_signing_key = $UpdateSigningKey }
        
        # Set content directory if not already set
        if (-not $config.ac_content_dir) {
            $config.ac_content_dir = Join-Path $ACPath "content"
        }
        
        # Set defaults for other values if missing
        if (-not $config.steam_exe) { $config.steam_exe = "C:/Program Files (x86)/Steam/Steam.exe" }
        if (-not $config.steam_app_id) { $config.steam_app_id = "244210" }
        if ($null -eq $config.launch_via_steam) { $config.launch_via_steam = $false }
        
        $config | ConvertTo-Json -Depth 5 | Set-Content -Encoding ASCII $configPath
        Write-Success "Wrote $configPath"
        
        # 2d) Create start_agent.bat
        @"
@echo off
cd /d "%~dp0"
if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat
python main.py
"@ | Set-Content -Encoding ASCII $startBat
        Write-Success "Wrote $startBat"
        
        # 2e) Kiosk configuration (if requested)
        if ($HasKiosk) {
            Write-Host "`n=== KIOSK CONFIGURATION ===`n" -ForegroundColor Cyan
            
            # Generate a unique kiosk code for this station
            # We'll use a hash of station name + a random component to ensure uniqueness
            $randomPart = Get-RandomToken 8
            $kioskCode = "$StationName-$randomPart".ToLower()
            
            Write-Host "Kiosk configured for station:`n"
            Write-Host "  Station Name: $StationName"
            Write-Host "  Kiosk Code:   $kioskCode"
            Write-Host "  Kiosk URL:    $ServerUrl/kiosk?kiosk=$kioskCode"
            Write-Host ""
            Write-Host "To use this kiosk:"
            Write-Host "  1. Open a browser on the tablet for this station"
            Write-Host "  2. Navigate to: $ServerUrl/kiosk?kiosk=$kioskCode"
            Write-Host "  3. Set the browser to full-screen/kiosk mode"
            Write-Host ""
            Write-Host "Note: The kiosk uses the public tokens configured on the server."
            Write-Host "      Ensure the server deployment included PUBLIC_API_TOKEN and PUBLIC_WS_TOKEN."
        }
        
        # 3) Optional: Install as scheduled task (commented out for simplicity, can be added if needed)
        # Write-Host "Creating scheduled task for auto-start at logon..."
        # $taskCmd = "schtasks /Create /TN `"ACManagerAgent`" /TR `"$startBat`" /SC ONLOGON /RL HIGHEST /F"
        # cmd /c $taskCmd
        
        # 4) Start agent now
        if (-not $NoStart) {
            Write-Host "Starting agent..."
            Start-Process -FilePath $startBat -WorkingDirectory $agentDir
            Write-Success "Agent started. Check the console for connection status."
        } else {
            Write-Success "Station configuration completed. To start the agent later, run: $startBat"
        }
    }
    
    Write-Host "`nDeployment completed successfully!`n" -ForegroundColor Green
}
catch {
    Write-Error "Deployment failed: $_"
    exit 1
}