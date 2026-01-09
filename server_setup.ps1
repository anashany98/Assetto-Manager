# Assetto Manager - Server Setup Script
# Run as Administrator

Write-Host "Configuring Firewall for AC Manager..." -ForegroundColor Cyan

# 1. Open Port 8000 (Backend API)
$RuleName = "AC Manager API"
$Port = 8000

if (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue) {
    Write-Host "Firewall rule '$RuleName' already exists." -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow
    Write-Host "Firewall rule '$RuleName' created successfully." -ForegroundColor Green
}

# 2. Open Port 5173 (Frontend - Optional if hosting production build via Nginx/etc, but for dev launch useful)
# Note: In production, Frontend should be built and served via Backend static files or Nginx.
# For simplicity in this 'Arcade' setup with 'start_server.bat', we might serve frontend separately.
# Let's assume we want to access the Web Panel from the Central PC main screen, but maybe from a tablet too?
# Let's open 5173 just in case.
New-NetFirewallRule -DisplayName "AC Manager Frontend" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

Write-Host "------------------------------------------------"
Write-Host "Setup Complete."
Write-Host "You can now run 'start_server.bat' to launch the system."
Write-Host "Your Local IP Address is:"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"} | Select-Object IPAddress
Write-Host "------------------------------------------------"
Pause
