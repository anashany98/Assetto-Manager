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

## 1) Servidor (PC operador)
1. Copia el repositorio al servidor.
2. Ejecuta:
   scripts\deploy_prod.ps1 -DatabaseUrl "postgresql://..."
   (o usa -UseSqlite si no hay Postgres).
3. Si usas licencias:
   scripts\setup_license_keys.ps1
4. (Opcional) Programa backups diarios:
   scripts\schedule_backup.ps1
5. Abre el panel:
   http://<server-ip>:8000
6. Crea el primer admin con SETUP_TOKEN.

## 2) Estaciones (cada simulador)
1. Copia el repo completo o solo /agent y /shared.
2. Ejecuta en cada estacion:
   scripts\deploy_station.ps1 -ServerUrl "http://<server-ip>:8000" -AgentToken "<AGENT_TOKEN>" -StationName "SIM 1" -ACPath "D:\\SteamLibrary\\steamapps\\common\\assettocorsa" -InstallTask -StartNow -UpdateSigningKey "<UPDATE_SIGNING_KEY>"
3. Verifica en el panel que la estacion aparece Online.

## 2.1) Transmision en vivo (OBS + Stream)
Requisitos:
- OBS Studio instalado en cada estacion
- obs-websocket activo (OBS 28+ ya lo trae)
- Un servidor de medios (RTMP/HLS/HTTP-FLV)

Configurar en cada agente (agent/config.json):
- obs_host (default: "localhost")
- obs_port (default: 4455)
- obs_password (si OBS tiene password)
- stream_url (URL publica del stream, ej: "http://media.local/live/estacion1.m3u8" o ".flv")

Notas:
- El backend controla OBS via WebSocket y el frontend reproduce stream_url.
- Si no pones stream_url, el frontend intenta http://<ip_estacion>:8080/stream.

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

