# Manual Operativo - 4 Simuladores + 4 Tablets (Produccion)

## 1. Objetivo
Este manual define el proceso completo para dejar **AC-MANAGER** operativo en:
1. 1 PC servidor (operador).
2. 4 PCs simulador (agente + Assetto Corsa).
3. 4 tablets (kiosko).

El flujo final es: **tablet lanza sesion -> servidor coordina -> agente ejecuta en el simulador correcto**.

## 2. Arquitectura recomendada
1. `PC Servidor`: backend + frontend en `http://<IP_SERVIDOR>:8000`.
2. `PC Simulador`: solo `agent` y Assetto Corsa.
3. `Tablet`: solo interfaz kiosko (`/kiosk`), no instala agente.
4. `Red`: LAN por cable para servidor/simuladores. Tablets por WiFi del mismo segmento.

## 3. Requisitos previos
1. Windows en todos los equipos.
2. Python instalado en servidor y simuladores (con `python` en PATH).
3. Node.js en servidor.
4. PostgreSQL 15/16 en servidor.
5. Assetto Corsa instalado en cada simulador.
6. Firewall abierto en puerto `8000` del servidor.

## 4. Datos que debes preparar antes de empezar
1. IP fija del servidor. Ejemplo: `192.168.1.50`.
2. Password fuerte para BD PostgreSQL.
3. Password del admin del panel.
4. Nombres de estaciones. Ejemplo: `SIM 1`, `SIM 2`, `SIM 3`, `SIM 4`.

## 5. Instalacion del servidor (PC operador)
### 5.1. Abrir PowerShell como Administrador
Ejecuta:

```powershell
cd C:\Users\PC\Desktop\AC-MANAGER
powershell -ExecutionPolicy Bypass -File .\scripts\setup_master_pc.ps1 `
  -ServerIp "192.168.1.50" `
  -DatabasePassword "PASSWORD_FUERTE_DB" `
  -PostgresAdminUser "postgres" `
  -AdminUsername "admin" `
  -AdminPassword "PASSWORD_ADMIN"
```

### 5.2. Arrancar sistema en produccion
Ejecuta:

```bat
start_server_prod.bat
```

### 5.3. Verificacion rapida de servidor
1. Abre `http://192.168.1.50:8000`.
2. Verifica salud en `http://192.168.1.50:8000/health`.
3. Debe responder estado `ok`.

## 6. Instalacion de cada simulador (repetir 4 veces)
En cada PC simulador, PowerShell:

```powershell
cd C:\Users\PC\Desktop\AC-MANAGER
powershell -ExecutionPolicy Bypass -File .\scripts\setup_simulator_pc.ps1 `
  -ServerIp "192.168.1.50" `
  -AgentToken "AGENT_TOKEN_DEL_SERVIDOR" `
  -UpdateSigningKey "UPDATE_SIGNING_KEY_DEL_SERVIDOR" `
  -StationName "SIM 1"
```

Cambia `StationName` en cada puesto:
1. `SIM 1`
2. `SIM 2`
3. `SIM 3`
4. `SIM 4`

Verifica en el panel que las 4 estaciones aparecen `Online`.

## 7. Enlace tablet <-> simulador (fijo por codigo)
### 7.1. Generar links de kiosko
En servidor:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\get_kiosk_links.ps1 `
  -ServerUrl "http://192.168.1.50:8000" `
  -Username "admin" `
  -Password "PASSWORD_ADMIN"
```

El archivo de salida queda en `output/onboarding/`.

### 7.2. Asignacion recomendada
1. Tablet 1 -> link de `SIM 1`.
2. Tablet 2 -> link de `SIM 2`.
3. Tablet 3 -> link de `SIM 3`.
4. Tablet 4 -> link de `SIM 4`.

Cada link lleva `?kiosk=<CODIGO>`, por eso la asociacion queda fija para esa estacion.

## 8. Modo inactivo profesional en PCs simulador
Configura en cada `agent/config.json`:

```json
{
  "idle_display_enabled": true,
  "idle_display_url": "http://192.168.1.50:8000/station-display"
}
```

Comportamiento:
1. Cuando no hay sesion, se muestra pantalla/video inactivo.
2. Al lanzar sesion desde tablet/panel, el idle se cierra automaticamente.
3. Al terminar sesion, vuelve a abrirse.

## 9. Operacion diaria (rutina)
1. Arranca servidor con `start_server_prod.bat`.
2. Enciende simuladores y confirma `Online` en panel.
3. Abre las tablets en su link asignado.
4. Lanza sesiones desde cada tablet.
5. Comprueba fin de sesion y retorno a estado inactivo.

## 10. Prueba de aceptacion (Go/No-Go)
Marca `OK` solo si cumple:
1. Servidor responde en `/health`.
2. 4/4 simuladores `Online`.
3. 4/4 tablets muestran su estacion correcta.
4. Lanzar sesion en Tablet 1 arranca solo en `SIM 1`.
5. Lanzar sesion en Tablet 2 arranca solo en `SIM 2`.
6. No hay scroll critico ni botones fuera de pantalla en iPad 10".
7. Finalizar sesion devuelve estado idle correctamente.
8. Repetir 2 sesiones seguidas por cada simulador sin fallo.

## 11. Si se cae la red (o el servidor temporalmente)
### 11.1. Comportamiento esperado
1. Si se corta red o backend, la tablet no puede enviar nuevos comandos.
2. Una sesion ya arrancada en un simulador puede seguir localmente.
3. Panel y tablets pueden mostrar estado desactualizado (ultimo estado conocido).
4. Mientras vuelve la comunicacion, se usa el ultimo estado local disponible.
5. Si el operador pulso `Lanzar sesion` justo en el corte, el resultado puede quedar incierto hasta reconexion.

### 11.2. Operacion segura durante la incidencia
1. No pulses varias veces `Lanzar sesion` en la misma tablet.
2. No cambies la asignacion de links/tablet durante la incidencia.
3. Deja terminar sesiones ya iniciadas y evita nuevos arranques hasta recuperar estado.
4. Registra hora y estacion afectada para validacion posterior.

### 11.3. Recuperacion
1. Restaurar conectividad LAN/WiFi o backend.
2. Verificar `http://<IP_SERVIDOR>:8000/health` devuelve `ok`.
3. Confirmar que los agentes vuelven a `Online` en el panel.
4. Refrescar cada tablet en su link fijo (`?kiosk=<CODIGO>`).
5. Validar que estado de estacion en panel coincide con lo mostrado en tablet.
6. Lanzar una sesion de prueba en 1 tablet y confirmar que arranca solo en su SIM.
7. Finalizar sesion de prueba y confirmar retorno a idle.

### 11.4. Criterio de cierre de incidencia
1. `health` en `ok`.
2. 4/4 estaciones `Online`.
3. 4/4 tablets mostrando su estacion correcta.
4. 1 ciclo completo `lanzar -> correr -> finalizar` sin desincronizacion.

## 12. Problemas comunes y solucion
### 12.1. Error `Server is not reachable` / timeout SSH
1. Este despliegue no usa SSH para operar kiosko/agente.
2. Trabaja en LAN con scripts locales de PowerShell.
3. Verifica IP, firewall y puerto `8000`.

### 12.2. `psql` no se reconoce
1. Instala PostgreSQL completo.
2. Agrega `...\PostgreSQL\16\bin` al PATH.
3. Cierra y abre PowerShell de nuevo.

### 12.3. Tablet no entra a sala
1. Revisar que el link sea el de su estacion (`kiosk=<CODIGO>` correcto).
2. Comprobar que esa estacion esta activa y `Online`.
3. Revisar hora del servidor y conectividad LAN.

## 13. Recomendacion de salida a produccion
1. Ejecuta la prueba de aceptacion completa.
2. Si todo queda en `OK`, congela version para el evento.
3. No cambies diseno/logica el mismo dia de operacion real.
4. Deja un plan de rollback simple: volver al ultimo commit estable.
