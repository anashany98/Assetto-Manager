# Reverse Proxy (Caddy) Example

A reverse proxy lets you expose HTTPS and hide the internal port.
Caddy is simple and works on Windows.

## 1) Install Caddy
- Download from https://caddyserver.com/download
- Put caddy.exe in a folder on PATH

## 2) Example Caddyfile
Save this as Caddyfile and replace your domain:

  example.com {
    encode gzip
    reverse_proxy localhost:8000
  }

## 3) Run Caddy
  caddy run --config Caddyfile

## 4) Notes
- Use a real domain for automatic HTTPS.
- If you are on LAN only, you can skip the proxy and access http://server-ip:8000.
