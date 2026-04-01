# SettingsPage - Estructura Refactorizada

## Problema Original

`SettingsPage.tsx` era un archivo monolítico de **222 KB** con:
- 40+ mutations de React Query
- 50+ estados locales (useState)
- 10+ queries de datos
- Múltiples secciones JSX inline (branding, stations, kiosk, pricing, deploy, etc.)
- Lógica de negocio mezclada con UI

## Nueva Estructura

```
SettingsPage/
├── hooks/
│   ├── index.ts                    # Re-exports de hooks
│   ├── useStationMutations.ts      # Mutations de estación (power, content, kiosk, etc.)
│   ├── useBrandingSettings.ts      # Settings de marca + pricing + kiosk config
│   ├── useStationFilters.ts        # Filtros de estaciones (ghost, inactive)
│   └── useDeployConfig.ts          # Config de perfiles AC + deploy mutations
├── components/
│   ├── index.ts                    # Re-exports de componentes
│   └── BrandingTab.tsx             # Tab de branding/identidad (extraído)
└── README.md                       # Este archivo
```

## Hooks Creados

### `useStationMutations(queryClient)`
Extrae 12 mutations relacionadas con estaciones:
- `powerMutation` - shutdown, power-on, panic, restart
- `scanContentMutation` - escaneo de contenido
- `syncContentMutation` - sincronización
- `restartAgentMutation` - reinicio de agente
- `kioskToggleMutation` - toggle modo kiosko
- `kioskCodeMutation` - regenerar código kiosko
- `lockMutation` / `unlockMutation` - bloqueo/desbloqueo
- `testConnectionMutation` - test de conexión
- `deleteStationMutation` - eliminación
- `reactivateStationMutation` - reactivación
- `archiveGhostsMutation` - archivado de estaciones fantasma

### `useBrandingSettings()`
Extrae queries y mutations de configuración de marca:
- `branding` - settings públicos
- `secureSettings` - settings seguros (Stripe, etc.)
- `updateBranding` - mutation para actualizar settings
- `fileInputRef` - ref para upload de logo
- `handleLogoUpload` - handler para upload
- `barName`, `barLogo` - valores derivados
- `pricingConfig` - configuración de precios
- `getSettingValue()`, `getSecureValue()` - helpers
- `buildKioskLink()` - helper para links de kiosko

### `usePricingState(pricingConfig)`
Estado local para pricing:
- `durationRates`, `discountRules`
- `basePerMin`, `vrPerMin`, `allowManualOverride`

### `useKioskConfig(getSettingValue, getSecureValue, secureSettings)`
Estado local para configuración de kiosko:
- `modsEnabled`, `kioskRainEnabled`, `paymentEnabled`
- `paymentCurrency`, `paymentPublicKioskUrl`
- `stripeSecretKey`, `stripeWebhookSecret`, etc.

### `useStationFilters(stations, healthById)`
Filtros y utilidades para lista de estaciones:
- `showInactiveStations`, `showGhostStations`
- `ghostThresholdHours`, `ghostCutoff`
- `isStationOnline()`, `isGhostStation()`
- `visibleStations`, `ghostStations`, `filteredStations`

### `useDeployConfig(activeTab)`
Configuración de perfiles AC y despliegue:
- `selectedCategory`, `isEditorOpen`, `newProfileName`
- `selectedProfiles`, `selectedStationIds`, `editorDirty`
- `strictDeploy`, `selectedGroupName`, `activeDeployJobId`
- `hardwarePresetDrafts`, `safeModeEnabled`
- `profiles`, `wheelProfiles`, `stationGroups`
- `deployJobs`, `deployJobDetail`, `deployAudit`
- `applyGroupSelection()`, `handleEditProfile()`

### `useDeployMutations(queryClient, selectedProfiles, selectedStationIds, strictDeploy, setActiveDeployJobId)`
Mutations para despliegue:
- `saveGroupMutation`, `deleteGroupMutation`
- `saveHardwarePresetsMutation`
- `safeModeMutation`
- `deployMutation`, `retryDeployMutation`

## Componentes Creados

### `BrandingTab`
Tab de branding/identidad extraído del componente principal.

## Próximos Pasos

1. Extraer más tabs en componentes (StationsTab, KioskTab, PricingTab, DeployTab, etc.)
2. Actualizar SettingsPage.tsx para usar los hooks y componentes extraídos
3. Verificar que la funcionalidad se mantiene intacta
