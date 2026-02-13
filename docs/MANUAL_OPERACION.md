# Manual de Operacion (Deploy en otras maquinas)

Este manual describe exactamente lo que debes hacer en las otras maquinas.

## 0) Datos que debes tener a mano
En el servidor (PC operador) genera o define estos valores y guardalos:
- SERVER_URL (ej: http://192.168.1.50:8000)
- DATABASE_URL (PostgreSQL/Supabase)
- SECRET_KEY
- SETUP_TOKEN
- AGENT_TOKEN
- UPDATE_SIGNING_KEY
- PUBLIC_API_TOKEN / PUBLIC_WS_TOKEN (si usas kiosk publico)

Puedes obtenerlos automaticamente con:
  scripts\deploy_prod.ps1 -DatabaseUrl "postgresql://..."

El script imprime AGENT_TOKEN y UPDATE_SIGNING_KEY.

qui## 1) Servidor (PC operador)
1. Copia el repositorio al servidor.
2. (Recomendado, 1 clic) Ejecuta:
   scripts\setup_master_pc.ps1 -ServerIp "<server-ip>" -DatabasePassword "<password-fuerte>" -AdminUsername "admin" -AdminPassword "<password-admin>"
3. Ejecuta:
   scripts\deploy_prod.ps1 -DatabaseUrl "postgresql://..."
   (o usa -UseSqlite si no hay Postgres).
4. Si usas licencias:
   scripts\setup_license_keys.ps1
5. (Opcional) Programa backups diarios:
   scripts\schedule_backup.ps1
6. Abre el panel:
   http://<server-ip>:8000
7. Crea el primer admin con SETUP_TOKEN.

## 2) Estaciones (cada simulador)
1. Copia el repo completo o solo /agent y /shared.
2. (Recomendado, 1 clic) Ejecuta en cada PC:
   scripts\setup_simulator_pc.ps1 -ServerIp "<server-ip>" -AgentToken "<AGENT_TOKEN>" -UpdateSigningKey "<UPDATE_SIGNING_KEY>" -StationName "SIM 1"
3. Ejecuta en cada estacion:
   scripts\deploy_station.ps1 -ServerUrl "http://<server-ip>:8000" -AgentToken "<AGENT_TOKEN>" -StationName "SIM 1" -ACPath "D:\\SteamLibrary\\steamapps\\common\\assettocorsa" -InstallTask -StartNow -UpdateSigningKey "<UPDATE_SIGNING_KEY>"
4. Verifica en el panel que la estacion aparece Online.

## 2.1) Links para tablets Kiosko
- Base recomendada:
  http://<server-ip>:8000/kiosk
- Generar links por estacion automaticamente:
  scripts\get_kiosk_links.ps1 -ServerUrl "http://<server-ip>:8000" -Username "<admin>" -Password "<password>"
- Formato por estacion:
  http://<server-ip>:8000/kiosk?kiosk=<CODIGO_ESTACION>

## 2.2) Transmision en vivo (OBS + Stream)
Requisitos:
- OBS Studio instalado en cada estacion
- obs-websocket activo (OBS 28+ ya lo trae)
- Un servidor de medios (RTMP/HLS/HTTP-FLV)

Configurar en cada agente (agent/config.json):
- obs_host (default: "localhost")
- obs_port (default: 4455)
- obs_password (si OBS tiene password)
- stream_url (URL publica del stream; para baja latencia LAN usa WebRTC/WHEP, ej: "http://media.local:8889/live/station1")

Notas:
- El backend controla OBS via WebSocket y el frontend reproduce stream_url.
- Si no pones stream_url, el backend calcula fallback usando STREAM_BASE_URL/STREAM_FALLBACK_MODE.
- Perfil recomendado para 4 estaciones en LAN cableada:
  - 720p60, CBR 4500-6000 kbps, keyframe 1s, preset low-latency.

## 3) Updates del agente
1. Empaqueta el agente en el servidor:
   scripts\package_agent.ps1
2. Sube el ZIP via /system/update (admin).
3. Los agentes descargan el update automaticamente.

## 4) Checklist rapido
Servidor:
- [ ] deploy_prod.ps1 ejecutado
- [ ] backend/.env creado
- [ ] /health OK
- [ ] Admin creado
- [ ] backups programados (opcional)

Estaciones:
- [ ] deploy_station.ps1 ejecutado
- [ ] agente Online en dashboard

## 5) Si falla algo
- Revisa logs en logs/backend.log
- Verifica tokens y URL
- Reintenta deploy_station.ps1

