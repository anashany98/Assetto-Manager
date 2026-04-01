# Changelog

Todos los cambios notables en este proyecto se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/) y el versionado sigue [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Añadido
- Dashboard: datos reales de API en SummaryCards (sesiones, ingresos, ocupación)
- Dashboard: filtro de fecha funcional en pestaña de analíticas (hoy/semana/mes/año)
- Dashboard: atajos de teclado (1, 2, L, Ctrl+R, ?, Esc)
- Dashboard: modal de ayuda de atajos de teclado
- Dashboard: skeleton loading states para sesiones
- AnalyticsPage: reescritura completa con TypeScript estricto
- AnalyticsPage: per-chart loading states y error handling con retry
- AnalyticsPage: empty states para gráficos sin datos
- AnalyticsPage: indicador de hora pico y total procesado
- Skeleton component reutilizable (text, card, session, chart, row)
- useKeyboardShortcuts hook para navegación por teclado
- 33 tests backend para módulo de loyalty
- 16 tests backend para endpoints de analytics
- 7 tests frontend para AnalyticsPage
- 6 tests frontend para Dashboard
- 10 specs E2E Playwright (auth, booking, dashboard, elo, events, history, leaderboard, responsive, session)
- README.md completo con arquitectura, setup, features, atajos
- CONTRIBUTING.md con estándares de código y proceso de contribución
- Tipos TypeScript para kiosk (KioskCar, KioskTrack, KioskScenario, etc.)

### Corregido
- **CRÍTICO**: `.env` eliminado del tracking de git
- **CRÍTICO**: `peak_hours` en analytics retornaba Row objects no serializables
- **CRÍTICO**: `most_used_station_name` corregido para retornar string
- **CRÍTICO**: KPI stats endpoint corregido (acceso a Row attributes)
- Filtro de fecha en Dashboard ahora era ignorado por AnalyticsPanel
- `sessions_today` mostraba datos incorrectos según filtro seleccionado
- useKeyboardShortcuts: ref access durante render (violación React 19)
- Dashboard test: quick action buttons con múltiples coincidencias

### Mejorado
- Validación de inputs: `range_days` limitado a 1-365 en todos los endpoints analytics
- Validación de inputs: `minutes` limitado a 1-480 en sessions add-time
- Validación de inputs: `PointsAward.points` debe ser >= 1
- Validación de inputs: `RewardCreate.points_cost` debe ser >= 1
- WebSocket: warning visible cuando auth está desactivada
- Queries de analytics optimizadas con GROUP BY en vez de iteración Python
- Refetch intervals optimizados de 5s a 15s en Dashboard
- SessionCard memoizado con React.memo
- Error handling consistente en Dashboard y AnalyticsPage

### Seguridad
- `.env` eliminado de git tracking
- Warning prominente cuando `WS_DEV_REQUIRE_AUTH=false`
- Tokens de API usan `os.getenv()` en vez de hardcodeados

---

## Historial Anterior

### Características Principales
- Sistema de gestión de estaciones Assetto Corsa
- Dashboard en tiempo real con WebSocket
- Modo Kiosk con interfaz táctil
- Sistema de sesiones con timer y alertas
- Programa de fidelidad con puntos y tiers
- Torneos y competiciones con brackets
- Sistema de reservas online
- Analíticas de negocio con gráficos
- Leaderboards y Hall of Fame
- Gestión de mods con despliegue automático
- Monitor de hardware por estación
- Perfiles de volante con FFB
- Integración de pagos (Stripe, Bizum, TPV)
- TV Mode y Spectator Mode
- Modo Battle
- Live Map
- Lap Analysis y Comparación
- Championship system
- Elimination mode
- Agent de sincronización por estación

---

[Unreleased]: https://github.com/anashany98/Assetto-Manager/compare/v1.0.0...HEAD
