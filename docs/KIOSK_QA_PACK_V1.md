# QA Pack Kiosko v1 (Objetivo 100% Funcional)

## 1) Objetivo
Este pack define que hay que validar para considerar el modulo de kiosko listo para operacion real en tablet (iPad 10" como dispositivo principal), sin scroll en pantallas clave y con lobby multijugador estable.

## 2) Alcance
- Rutas: `/kiosk`, `/kiosk-modern`, `/kiosk-racing`.
- Flujos: enlace tablet, seleccion de experiencia, contenido (marca/circuito), configuracion, lobby, espera, carrera, cierre.
- Reglas de UX: botones grandes tactiles, legibilidad a distancia, sin scroll vertical en pasos criticos.

## 3) Precondiciones de prueba
- Backend activo en `http://127.0.0.1:8011`.
- Frontend activo en `http://localhost:3010`.
- Minimo 2 estaciones online para pruebas de lobby.
- Datos ficticios disponibles (marca/circuito/sala demo) para entorno QA.

Comandos base recomendados:

```powershell
# Backend
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8011

# Frontend
cd frontend
npm run dev -- --host 0.0.0.0 --port 3010
```

Verificacion tecnica minima:

```powershell
pytest backend/tests -q
pytest backend/tests/test_lobby_flow.py -q -vv
cd frontend
npm run build
```

## 4) Criterio de salida (Go / No-Go)
Para marcar "100% funcional":

- 100% de casos `P0` en verde.
- 100% de casos `P1` en verde.
- 0 bugs abiertos de severidad critica/alta en kiosko.
- 0 bloqueos de flujo (enlace, lanzar sesion, crear lobby, unirse, start lobby).
- Sin scroll en pantallas criticas en viewport iPad 10" (1024x1366 y 768x1024).

## 5) Matriz QA ejecutable

Leyenda prioridad:
- `P0`: Bloqueante de negocio.
- `P1`: Alta prioridad operativa.
- `P2`: Mejora no bloqueante.

| ID | Pri | Modulo | Pasos | Resultado esperado |
|---|---|---|---|---|
| KSK-001 | P0 | Arranque | Abrir `/kiosk` con backend y frontend activos | Carga sin error blanco, sin crash JS |
| KSK-002 | P0 | Arranque | Abrir `/kiosk-modern` | Carga completa, componentes visibles |
| KSK-003 | P0 | Arranque | Abrir `/kiosk-racing` | Carga completa, sin bucles de error |
| KSK-004 | P0 | Pairing | Enlazar tablet por codigo valido | Tablet queda vinculada a estacion correcta |
| KSK-005 | P0 | Pairing | Probar codigo invalido | Mensaje claro de error, sin bloqueo de pantalla |
| KSK-006 | P1 | Pairing | Reintentar enlace tras error | Recupera flujo sin recargar app |
| KSK-007 | P1 | Pairing | Estacion inactiva | Pantalla de servidor inactivo clara y accionable |
| KSK-008 | P0 | API/Auth | Acciones de kiosko con token publico | Endpoints responden sin 401 inesperado |
| KSK-009 | P0 | UX Tablet | Vista iPad 1024x1366, paso experiencia | Sin scroll vertical, sin cortes de CTA |
| KSK-010 | P0 | UX Tablet | Vista iPad 768x1024, paso configuracion | Sin scroll vertical, controles tocables |
| KSK-011 | P1 | UX Tablet | Botones primarios | Alto minimo util tactil (>=44px aprox) |
| KSK-012 | P1 | UX Tablet | Contraste general | Texto legible (sin zonas "blancas quemadas") |
| KSK-013 | P0 | Contenido | Seleccionar marca ficticia | Seleccion se guarda y avanza |
| KSK-014 | P0 | Contenido | Seleccionar circuito ficticio | Seleccion se guarda y avanza |
| KSK-015 | P1 | Contenido | Cambiar marca/circuito varias veces | No pierde estado ni rompe navegacion |
| KSK-016 | P0 | Configuracion | Elegir transmision `Automatico` | Valor se refleja en resumen y sesion |
| KSK-017 | P0 | Configuracion | Elegir transmision `Manual` | Valor se refleja en resumen y sesion |
| KSK-018 | P1 | Configuracion | Dificultad y clima | Cambios aplican sin refresco |
| KSK-019 | P0 | Lanzamiento | Lanzar sesion individual | Crea sesion y entra en estado de carrera |
| KSK-020 | P0 | Carrera | Pantalla en carrera (tiempo, vueltas) | Datos se actualizan sin bloqueos |
| KSK-021 | P1 | Carrera | Cancelar sesion desde kiosko | Flujo termina limpio, sin estado colgado |
| KSK-022 | P0 | Lobby | Crear lobby como host | Lobby se crea y aparece en sala |
| KSK-023 | P0 | Lobby | Join de segundo jugador | Join correcto con slot valido |
| KSK-024 | P0 | Lobby | Ready host + ready jugador | Estado ready visible y consistente |
| KSK-025 | P0 | Lobby | Intentar start con <2 ready | Error correcto: no inicia |
| KSK-026 | P0 | Lobby | Start con 2 ready | Inicia lobby y pasa a running |
| KSK-027 | P0 | Lobby | Rejoin jugador ya dentro en running | Mantiene slot original, no falla por lobby lleno |
| KSK-028 | P1 | Lobby | Cancelar lobby por host | Lobby pasa a cancelled, UI consistente |
| KSK-029 | P1 | Lobby | Intentar start por no-host | Rechazo controlado (403/mensaje claro) |
| KSK-030 | P1 | Lobby | Error real de backend en lobby | Se muestra error real, sin fallback silencioso a demo |
| KSK-031 | P1 | Pagos | Flujo pago pendiente > pagado | Reintento de acceso a sala funciona |
| KSK-032 | P1 | Pagos | Error de checkout | Mensaje claro, boton reintento funcional |
| KSK-033 | P1 | Paginacion | Multiples sesiones/eventos | Navegacion por botones `Anterior/Siguiente` sin scroll |
| KSK-034 | P1 | Paginacion | Limites primera/ultima pagina | Botones deshabilitan correctamente |
| KSK-035 | P1 | Catalogo | Modo sorpresa | Verificar desactivado/no visible en kiosko |
| KSK-036 | P1 | Estado agente | Agente desconectado | Banner visible, app usable sin crash |
| KSK-037 | P1 | Resiliencia | Cortar backend 20s y volver | UI muestra error y recupera al volver backend |
| KSK-038 | P2 | Rendimiento | 8-12 tablets simultaneas | Flujo usable, sin degradacion critica |
| KSK-039 | P2 | Logging | Revisar logs tras bateria QA | Sin excepciones criticas repetidas |
| KSK-040 | P0 | Regresion final | Repetir flujo completo 3 veces | 3/3 pasadas sin bloqueo |

## 6) Prueba de carga minima recomendada
- Escenario A: 4 tablets en paralelo, sesiones individuales.
- Escenario B: 2 lobbies simultaneos con 2-4 jugadores cada uno.
- Escenario C: alternar entradas/salidas de lobby y reconexion de 1 tablet.

Objetivo:
- Sin errores bloqueantes.
- Sin perdida de sesion.
- Sin pantalla congelada.

## 7) Plantilla de ejecucion (rellenable)
Copiar y completar durante QA real:

| ID Caso | Resultado (PASS/FAIL) | Evidencia (captura/video/log) | Bug ID | Notas |
|---|---|---|---|---|
| KSK-001 |  |  |  |  |
| KSK-002 |  |  |  |  |
| KSK-003 |  |  |  |  |
| KSK-004 |  |  |  |  |
| KSK-005 |  |  |  |  |
| ... |  |  |  |  |

## 8) Checklist final de release kiosko
- [ ] Todos los `P0` y `P1` en PASS.
- [ ] Sin scroll en iPad 10" en pasos criticos.
- [ ] Lobby create/join/ready/start verificado con 2+ estaciones.
- [ ] Mensajes de error claros (sin fallback oculto).
- [ ] Build frontend y tests backend en verde.
- [ ] Evidencias guardadas en carpeta de QA de la release.

