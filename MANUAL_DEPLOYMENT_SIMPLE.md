# Manual Simple de Despliegue para AC-MANAGER (4 Simuladores + Kiosk)

Este manual le guiará paso a paso para desplegar AC-MANAGER en un entorno de **4 simuladores** con **funcionalidad kiosk** en cada estación, usando el script unificado `Deploy-ACManager.ps1`.

## Requisitos Previos
1. **Windows 10/11 (64-bit)** en todas las máquinas (servidor y estaciones).
2. **Assetto Corsa instalado** en cada estación (ruta conocida, ej: `D:\SteamLibrary\steamapps\common\assettocorsa`).
3. **Conexión de red local** (LAN) entre el servidor y las 4 estaciones (se recomienda cable Ethernet o WiFi estable).
4. **Privilegios de administrador** en el servidor para instalar servicios y abrir puertos.
5. (Opcional) **Tablet o dispositivo** para cada kiosk (puede ser la misma pantalla del simulador o una tablet externa).

## Paso 1: Preparar el Servidor (PC del Operador)
1. Copie todo el repositorio AC-MANAGER al servidor.
2. Abra **PowerShell como Administrador** y navegue a la carpeta del repositorio:
   ```powershell
   cd C:\ruta\al\repositorio\AC-MANAGER
   ```
3. Ejecute el script de despliegue del servidor:
   ```powershell
   .\Deploy-ACManager.ps1 -Mode Server -UseSqlite
   ```
   - El parámetro `-UseSqlite` usa una base de datos SQLite local (más simple para pruebas). Si tiene PostgreSQL, omita `-UseSqlite` y proporcione `-DatabaseUrl "postgresql://..."`.
   - El script creará el entorno virtual, instalará dependencias, construirá el frontend y generará los tokens necesarios.
   - **Importante**: Al final, el script mostrará en pantalla:
     ```
     AGENT_TOKEN: xxxxxx
     UPDATE_SIGNING_KEY: yyyyyy
     PUBLIC_API_TOKEN: zzzzzz
     PUBLIC_WS_TOKEN: wwwwww
     ```
   - **Copie estos cuatro valores** (AGENT_TOKEN, UPDATE_SIGNING_KEY, PUBLIC_API_TOKEN, PUBLIC_WS_TOKEN) en un bloc de notas; los necesitará para cada estación.
   - El servidor comenzará a ejecutarse en `http://<IP-del-servidor>:8000`. Deje esta ventana de PowerShell abierta (o mejor, ejecute `start_prod.bat` en otra terminal para dejarlo como servicio).

## Paso 2: Preparar Cada Estación (hacerlo 4 veces, una por simulador)
Repita los siguientes pasos en **cada una de las 4 máquinas** que actuarán como simulador.

1. Copie todo el repositorio AC-MANAGER a la estación (o al menos las carpetas `agent/` y `shared/`).
2. Abra **PowerShell como Administrador** y navegue a la carpeta del repositorio:
   ```powershell
   cd C:\ruta\al\repositorio\AC-MANAGER
   ```
3. Ejecute el script de despliegue de la estación, proporcionando los valores obtenidos en el Paso 1:
   ```powershell
   .\Deploy-ACManager.ps1 -Mode Station `
       -ServerUrl "http://<IP-del-servidor>:8000" `
       -AgentToken "<AGENT_TOKEN-del-Paso-1>" `
       -UpdateSigningKey "<UPDATE_SIGNING_KEY-del-Paso-1>" `
       -StationName "SIM 1" `
       -ACPath "D:\SteamLibrary\steamapps\common\assettocorsa" `
       -HasKiosk
   ```
   - Reemplace `<IP-del-servidor>` por la dirección IP real del servidor (ej: `192.168.1.50`).
   - Reemplace `<AGENT_TOKEN-del-Paso-1>` y `<UPDATE_SIGNING_KEY-del-Paso-1>` con los valores copiados.
   - Cambie `StationName` a `SIM 1`, `SIM 2`, `SIM 3` y `SIM 4` respectivamente para cada estación.
   - Ajuste `-ACPath` si su instalación de Assetto Corsa está en otra ruta.
   - El parámetro `-HasKiosk` indica que esta estación tendrá un kiosk (tablet o pantalla para selección pública). **Déjelo activado** para todas las estaciones.
   - El script configurará el agente, creará el archivo `config.json`, instalará dependencias y mostrará algo como:
     ```
     Kiosk configurado para estación:
       Station Name: SIM 1
       Kiosk Code:   sim1-abc123
       Kiosk URL:    http://192.168.1.50:8000/kiosk?kiosk=sim1-abc123
     ```
   - **Copie la URL del kiosk** (ej: `http://192.168.1.50:8000/kiosk?kiosk=sim1-abc123`) y el código (ej: `sim1-abc123`) para cada estación; los necesitará en el siguiente paso.
   - Si no agregó `-NoStart`, el agente se iniciará automáticamente. Verá una ventana de consola mostrando logs; debería ver mensajes como "Connected to server" y "Station online".
   - Si usó `-NoStart`, inicie el agente manualmente ejecutando `agent\start_agent.bat`.

## Paso 3: Configurar los Kiosks (Tablets o Pantallas Públicas)
En cada estación, configure el dispositivo que servirá como kiosk (puede ser la misma pantalla del simulador o una tablet externa):

1. Abra el navegador web recomendado (Chrome, Edge o Safari).
2. Navegue a la **URL del kiosk** que obtuvo en el Paso 2 para esa estación (ej: `http://192.168.1.50:8000/kiosk?kiosk=sim1-abc123`).
3. **Ponga el navegador en modo pantalla completa/kiosk**:
   - **Chrome/Edge**: Presione `F11` para pantalla completa, o use el menú → Más herramientas → Abrir como ventana de aplicación.
   - **Safari (iPad)**: Compartir → Pantalla completa.
   - (Opcional) Para bloquear el navegador en una sola URL, use extensiones de modo kiosk o configuración de dispositivo administrado si está disponible.
4. Verifique que la interfaz kiosk muestre categorías de contenido (coches, pistas, etc.) y que pueda seleccionar un elemento.
5. Repita este proceso para las 4 estaciones, usando la URL kiosk única de cada una.

## Paso 4: Verificar que Todo Funcione
1. En el servidor, abra un navegador y vaya a `http://<IP-del-servidor>:8000`. Debería ver el panel de administración de AC-MANAGER.
2. Inicie sesión como admin usando el token `SETUP_TOKEN` que se mostró durante el despliegue del servidor (o cree un usuario admin vía el botón de creación inicial).
3. En el panel de administración, vaya a la sección de **Estaciones** (o Dashboard). Debería ver las 4 estaciones listadas con estado **Online** (verde) y sus nombres (SIM 1, SIM 2, SIM 3, SIM 4).
4. Desde el kiosk de cualquier estación, seleccione un coche o pista sencilla.
5. En el panel de administración, verifique que la selección aparezca como una solicitud pendiente o que el estado de la estación muestre que está sincronizando ese contenido.
6. Espere unos segundos y confirme que el contenido se descargue y esté disponible en el simulador (puede verificar en el agente o en el juego).
7. Repita la prueba de selección desde cada kiosk para asegurar que las 4 estaciones respondan correctamente.

## Paso 5: Puesta en Marcha Diaria (Después de la Primera Configuración)
Una vez completado el despliegue inicial, para poner en marcha el sistema cada día:

### En el Servidor:
- Ejecute `start_prod.bat` (o asegúrese de que el servicio de Windows del backend esté corriendo).

### En Cada Estación:
- Asegúrese de que el agente se inicia automáticamente (se creó una tarea programada durante el despliegue si se optó por ella) o ejecute manualmente `agent\start_agent.bat`.
- Verifique en el panel de administración que todas las estaciones muestren **Online**.

### En los Kiosks:
- Simplemente abra el navegador en la URL del kiosk guardada (o deje la tablet en modo kiosk permanente).

## Solución de Problemas Rápida
| Síntoma | Acción Sugerida |
|---------|-----------------|
| Estación muestra **Offline** en el panel | 1. Verifique que el agente esté ejecutándose en la estación (consola de `start_agent.bat`). 2. Confirme conectividad de red (puede hacer `ping <IP-del-servidor>` desde la estación). 3. Revise los logs del agente en busca de errores de token o conexión. |
| Kiosk muestra pantalla blanca o error de carga | 1. Verifique que la URL del kiosk sea exactamente la que se generó (incluyendo `?kiosk=...`). 2. Asegúrese de que el tablet tenga acceso a `http://<IP-del-servidor>:8000`. 3. Confirme que el servidor tenga los tokens públicos configurados (revisar `backend\.env` para `PUBLIC_API_TOKEN` y `PUBLIC_WS_TOKEN`). |
| El contenido no se sincroniza al seleccionar en el kiosk | 1. En el panel de administración, revise la sección de **Logs** o **Sincronización** para ver si llega la solicitud. 2. En la consola del agente de la estación, busque líneas como "Kiosk selection received". 3. Verifique que la ruta de Assetto Corsa en `agent\config.json` tenga permisos de escritura para el usuario que ejecuta el agente. |
| El agente se cierra inesperadamente | 1. Revise la consola del agente para ver el error. 2. Asegúrese de que las dependencias del agente estén instaladas (ejecute manualmente `pip install -r agent\requirements.txt` dentro del entorno virtual `.venv` de la carpeta agent). 3. Verifique que no falte algún archivo crítico en la instalación de Assetto Corsa. |

## Notas Importantes
- **Seguridad**: Los tokens mostrados en la consola durante el despliegue son sensibles. No los comparta públicamente y guárdelos en un lugar seguro.
- **Actualizaciones Futuras**: Para actualizar el agente en todas las estaciones, simplemente empaquete una nueva versión con `scripts\package_agent.ps1`, súbela vía el panel de admin (/system/update) y los agentes se actualizarán automáticamente.
- **Escalabilidad**: Este proceso funciona igual para 2, 4 o más estaciones; simplemente repita el Paso 2 para cada nueva estación, cambiando el `StationName` y el kiosk correspondiente.
- **Base de Datos**: Si eligió `-UseSqlite`, la base de datos se almacena en `ac_manager_local.db` dentro de la carpeta del repositorio. Haga copias de seguridad periódicas de este archivo si decide usarla en producción.

¡Listo! Con estos pasos, su sistema AC-MANAGER con 4 simuladores y kiosks debería estar funcionando de manera simple y confiable.