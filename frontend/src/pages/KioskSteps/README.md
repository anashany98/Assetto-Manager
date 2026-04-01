# KioskSteps - Estructura Refactorizada

## Problema Original

`KioskSteps.tsx` era un archivo monolítico de **117 KB** con:
- Múltiples componentes inline (AttractMode, ScenarioStep, etc.)
- Lógica de paginación mezclada con UI
- Queries de lobby y scenarios inline
- Gestión de estado compleja para selección de coches, pistas, etc.

## Nueva Estructura

```
KioskSteps/
├── hooks/
│   ├── index.ts                    # Re-exports de hooks
│   └── useLobbyData.ts             # Hook para datos de lobby y paginación
└── README.md                       # Este archivo
```

## Hooks Creados

### `useLobbyData()`
Extrae query y paginación de lobbies:
- `displayLobbies` - lista completa de lobbies
- `visibleLobbies` - lobbies de la página actual
- `lobbyPage`, `lobbyPages` - estado de paginación
- `setLobbyPage` - setter de página
- `LOBBIES_PER_PAGE` - constante de items por página

### `useScenarioPagination(scenarios)`
Extrae paginación de escenarios:
- `quickScenarios` - escenarios de la página actual
- `scenarioPage`, `scenarioPages` - estado de paginación
- `setScenarioPage` - setter de página
- `SCENARIOS_PER_PAGE` - constante de items por página

## Próximos Pasos

1. Extraer más componentes (AttractMode, ScenarioStep, CarSelection, etc.)
2. Actualizar KioskSteps.tsx para usar los hooks y componentes extraídos
3. Verificar que la funcionalidad se mantiene intacta
