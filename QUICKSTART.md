# AC Manager — Guía de inicio rápido

## Requisitos previos

Instala estas dos herramientas **antes** de ejecutar el instalador:

| Herramienta | Versión | Descarga |
|-------------|---------|----------|
| Python | 3.11 o superior | https://www.python.org/downloads/ |
| Node.js | LTS (20+) | https://nodejs.org/ |

> **Importante — Python**: durante la instalación marca la casilla **"Add Python to PATH"**.

---

## Instalación (primera vez)

1. Extrae el ZIP en `C:\AC-Manager\`
2. Haz clic derecho sobre `SETUP_CLIENTE.bat` → **Ejecutar como administrador**
3. Sigue las instrucciones en pantalla:
   - Elige base de datos (SQLite recomendado para ≤4 simuladores)
   - Crea tu usuario administrador
4. Al terminar abre el navegador en **http://localhost:8000**

El instalador solo se necesita **una vez**. A partir de ahí usa `INICIAR_SERVIDOR.bat`.

---

## Uso diario

| Tarea | Archivo |
|-------|---------|
| Arrancar el servidor | `INICIAR_SERVIDOR.bat` |
| Actualizar a nueva versión | `ACTUALIZAR_Y_ABRIR.bat` |
| Detener el servidor | Cierra la ventana `ACManager-Backend` |

## Actualizaciones

`ACTUALIZAR_Y_ABRIR.bat` gestiona el proceso automáticamente:

1. Consulta GitHub para ver si hay una versión más nueva
2. Si hay actualización, pregunta antes de descargar
3. Hace backup de `backend\.env` (tus claves y configuración)
4. Descarga e instala los nuevos archivos **sin tocar** tus datos (`storage/`, `.env`)
5. Actualiza dependencias y ejecuta migraciones de base de datos
6. Arranca el servidor

> Si no hay conexión a internet, arranca directamente la versión local sin actualizar.

---

## Configuración de simuladores (PCs de carrera)

Ejecuta en **cada PC simulador** (no en el servidor):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_simulator_pc.ps1 `
  -ServerIp "192.168.1.100" `
  -AgentToken "TU_AGENT_TOKEN" `
  -StationName "SIM 1"
```

> Los valores de `ServerIp` y `AgentToken` están en el archivo `backend\.env` del servidor.

---

## Accesos directos útiles

| URL | Descripción |
|-----|-------------|
| `http://[IP]:8000` | Panel de administración |
| `http://[IP]:8000/kiosk/[id]` | Kiosk para simulador |
| `http://[IP]:8000/tv/[id]` | Pantalla TV espectador |
| `http://[IP]:8000/docs` | Documentación API |

---

## Solución de problemas rápida

**El servidor no arranca**
→ Comprueba que `backend\.env` existe y tiene `SECRET_KEY` configurado.
→ Revisa el log: `logs\backend.log`

**"Python no encontrado"**
→ Reinstala Python y marca "Add to PATH". Reinicia el PC.

**El kiosk no conecta**
→ Verifica que el firewall permite el puerto 8000.
→ Usa la IP local del servidor, no `localhost`.

**Necesito más ayuda**
→ Consulta `docs\DEPLOYMENT_PROD.md` o contacta con soporte.

---

## Backup

Los datos están en `backend\storage\` y la base de datos (SQLite: `backend\ac_manager_local.db`).

Para backups automáticos: `scripts\schedule_backup.ps1`
