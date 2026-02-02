param(
  [string]$OutDir = "certs",
  [string]$EnvFile = "backend\.env",
  [switch]$InlineEnv,
  [switch]$Force
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$certDir = Join-Path $root $OutDir
$privPath = Join-Path $certDir "private_key.pem"
$pubPath = Join-Path $certDir "public_key.pem"

if (!(Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir | Out-Null
}

if ((Test-Path $privPath -or Test-Path $pubPath) -and -not $Force) {
  Write-Error "Key files already exist. Use -Force to overwrite."
  exit 1
}

# Try OpenSSL first
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if ($openssl) {
  & $openssl.Path genrsa -out $privPath 2048
  & $openssl.Path rsa -in $privPath -pubout -out $pubPath
} else {
  # Fallback to Python + cryptography
  $py = @"
try:
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    print(priv.decode('utf-8'))
    print('---SPLIT---')
    print(pub.decode('utf-8'))
except Exception as e:
    print('ERROR:', e)
"@
  $result = python -c $py
  if ($result -like 'ERROR:*') {
    Write-Error "Failed to generate keys. Install OpenSSL or 'pip install cryptography'."
    exit 1
  }
  $parts = $result -split '---SPLIT---'
  if ($parts.Count -lt 2) {
    Write-Error "Unexpected output generating keys."
    exit 1
  }
  $priv = $parts[0].Trim()
  $pub = $parts[1].Trim()
  Set-Content -Encoding ASCII -Path $privPath -Value $priv
  Set-Content -Encoding ASCII -Path $pubPath -Value $pub
}

Write-Host "Generated keys: $privPath and $pubPath"
Write-Host "IMPORTANT: Store private_key.pem securely and do not commit it."

# Update backend/.env
$envPath = Join-Path $root $EnvFile
if (!(Test-Path $envPath)) {
  New-Item -ItemType File -Path $envPath | Out-Null
}

$envLines = Get-Content $envPath -ErrorAction SilentlyContinue
$envLines = @() + $envLines

function Upsert-Env([string]$Key, [string]$Value) {
  $pattern = "^$Key="
  $found = $false
  for ($i = 0; $i -lt $envLines.Count; $i++) {
    if ($envLines[$i] -match $pattern) {
      $envLines[$i] = "$Key=$Value"
      $found = $true
      break
    }
  }
  if (-not $found) { $envLines += "$Key=$Value" }
}

if ($InlineEnv) {
  $pub = Get-Content $pubPath -Raw
  $pubInline = $pub -replace "`r`n", "\n"
  Upsert-Env "LICENSE_PUBLIC_KEY" $pubInline
} else {
  Upsert-Env "LICENSE_PUBLIC_KEY_PATH" $pubPath
}

$envLines | Set-Content -Encoding ASCII $envPath
Write-Host "Updated $envPath"
