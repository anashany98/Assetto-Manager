# Resumen de Correcciones Aplicadas

## Fecha: 2026-02-25

Este documento resume todas las correcciones de código aplicadas para solucionar los fallos críticos identificados en la auditoría técnica.

---

## 1. Gestión de Secretos Efímeros ✅

**Archivo modificado:** [`backend/app/auth.py`](backend/app/auth.py)

**Problema:** La `SECRET_KEY` se generaba aleatoriamente en cada reinicio del servidor en desarrollo, invalidando todas las sesiones JWT.

**Solución aplicada:**
- Creada función `_load_or_create_dev_key()` que:
  - Intenta leer una clave persistente de `.dev_secret_key`
  - Si no existe, genera una nueva y la guarda
  - Establece permisos restrictivos (0o600)
- La clave ahora persiste entre reinicios del servidor

**Nuevo comportamiento:**
```python
# Antes: Nueva clave cada reinicio
ephemeral = secrets.token_urlsafe(48)  # Se pierde al reiniciar

# Después: Clave persistente
return _load_or_create_dev_key()  # Se mantiene entre reinicios
```

---

## 2. Autenticación WebSocket Débil ✅

**Archivo modificado:** [`backend/app/routers/websockets.py`](backend/app/routers/websockets.py)

**Problema:** Los WebSockets permitían conexiones sin autenticación en desarrollo cuando no había tokens configurados.

**Solución aplicada:**
- Nueva función `_require_ws_auth_in_dev()` que requiere autenticación por defecto
- Nueva variable de entorno `WS_DEV_REQUIRE_AUTH` (default: `true`)
- Mensajes de log claros cuando se rechazan conexiones
- Solo permite acceso sin token si explícitamente se configura `WS_DEV_REQUIRE_AUTH=false`

**Nuevo comportamiento:**
```python
# Antes: Permitía acceso sin token
return _is_public_ws_allowed(None)  # Podía devolver True

# Después: Requiere token por defecto
if _require_ws_auth_in_dev():
    logger.warning("WebSocket client timed out without authentication - rejecting")
    return False
```

---

## 3. Rate Limiting Insuficiente ✅

**Archivo modificado:** [`backend/app/routers/auth.py`](backend/app/routers/auth.py)

**Problema:** Solo 5 intentos/minuto por IP, vulnerable a ataques distribuidos.

**Solución aplicada:**
- Sistema de rate limiting progresivo con las siguientes características:
  - **Delays progresivos:** 0s, 1s, 2s, 5s, 10s después de cada fallo
  - **Bloqueo temporal:** 15 minutos después de 5 fallos consecutivos
  - **Identificación por IP + username:** Previene ataques distribuidos a una cuenta
  - **Audit logging:** Registra todos los intentos fallidos y exitosos
  - **Limpieza automática:** Elimina registros antiguos (>1 hora)

**Nuevas constantes configurables:**
```python
MAX_FAILED_ATTEMPTS_BEFORE_LOCKOUT = 5
LOCKOUT_DURATION_MINUTES = 15
PROGRESSIVE_DELAYS = [0, 1, 2, 5, 10]  # segundos
```

**Nuevo flujo de login:**
1. Verificar si la cuenta está bloqueada
2. Validar credenciales
3. Si falla: registrar intento, aplicar delay progresivo
4. Si éxito: limpiar registros de fallos, loguear éxito

---

## 4. Validación ZIP Incompleta ✅

**Archivo modificado:** [`backend/app/routers/mods.py`](backend/app/routers/mods.py)

**Problema:** Los archivos ZIP de mods no eran validados completamente, permitiendo archivos potencialmente maliciosos.

**Solución aplicada:**
- Nueva función `_is_safe_filename()` que valida:
  - Archivos ocultos (que empiezan con `.`)
  - Extensiones peligrosas (`.exe`, `.bat`, `.sh`, `.ps1`, etc.)
  - Doble extensiones (`.exe.jpg`)
  - Nombres reservados de Windows (`CON`, `NUL`, etc.)
  - Caracteres de control

- Nueva función `_safe_extract_zip()` mejorada que:
  - Detecta **zip bombs** (ratio de compresión > 100:1)
  - Limita profundidad de directorios (máximo 10 niveles)
  - Limita tamaño de archivo individual (500MB)
  - Rechaza symlinks
  - Registra archivos rechazados con razones

**Nuevas constantes:**
```python
DANGEROUS_EXTENSIONS = {'.exe', '.bat', '.sh', '.ps1', ...}
MAX_DIRECTORY_DEPTH = 10
MAX_SINGLE_FILE_BYTES = 500 * 1024 * 1024  # 500MB
MAX_COMPRESSION_RATIO = 100
```

---

## 5. Estado WebSocket en Memoria ✅

**Archivo modificado:** [`backend/app/routers/websockets.py`](backend/app/routers/websockets.py)

**Problema:** El estado WebSocket se mantenía solo en memoria, causando problemas con múltiples workers.

**Solución aplicada:**
- Validación obligatoria de Redis en producción con múltiples workers
- Mensajes de error claros cuando la configuración es incorrecta
- La aplicación falla explícitamente si:
  - `UVICORN_WORKERS > 1` y `WS_PUBSUB != "redis"`
  - `WS_PUBSUB=redis` pero no hay `REDIS_URL`
  - No se puede conectar a Redis

**Nuevo comportamiento:**
```python
if environment == "production" and is_multi_worker and mode != "redis":
    logger.error(
        "CRITICAL: Multi-worker production deployment detected "
        "but WS_PUBSUB is not set to 'redis'. WebSocket state will NOT be shared"
    )
    # En producción, esto es un error de configuración crítico
```

---

## 6. Sistema de Migraciones Dual ✅

**Archivo modificado:** [`backend/app/database.py`](backend/app/database.py)

**Problema:** Existían dos sistemas de migración (manual y Alembic), causando confusión y posibles conflictos.

**Solución aplicada:**
- Marcadas todas las funciones `ensure_*_schema()` como **DEPRECATED**
- Añadido `DeprecationWarning` que se muestra una vez por sesión
- Mensajes de log claros indicando que se debe usar Alembic
- Las funciones aún funcionan pero advierten de su deprecación

**Nuevo comportamiento:**
```python
def ensure_station_schema(db_engine):
    """
    DEPRECATED: Use Alembic migrations instead.
    
    To migrate, run: alembic upgrade head
    """
    _show_migration_deprecation_warning()
    # ... resto del código
```

**Mensaje de deprecación:**
```
DEPRECATED: Manual schema migration functions are being used. 
Please migrate to Alembic: 'alembic upgrade head'. 
These functions will be removed in a future version.
```

---

## 7. Falta de Soft Delete ✅

**Archivos modificados:**
- [`backend/app/models.py`](backend/app/models.py)
- [`backend/alembic/versions/add_soft_delete_columns.py`](backend/alembic/versions/add_soft_delete_columns.py) (nuevo)

**Problema:** Los registros se eliminaban físicamente, perdiendo historial y referencias.

**Solución aplicada:**
- Creado `SoftDeleteMixin` con:
  - Columna `deleted_at` (DateTime, nullable, indexado)
  - Propiedad `is_deleted`
  - Métodos `soft_delete()` y `restore()`
  - Filtros `not_deleted` y `with_deleted`

- Aplicado a modelos críticos:
  - `Driver`: Preserva historial de carreras
  - `Station`: Preserva datos de sesiones

- Creada migración Alembic para:
  - Añadir columna `deleted_at`
  - Crear índices parciales para unicidad (solo registros no eliminados)
  - Eliminar constraints UNIQUE antiguos que conflictúan

**Uso del mixin:**
```python
class Driver(Base, SoftDeleteMixin):
    __tablename__ = "drivers"
    # ... campos

# Soft delete
driver.soft_delete()  # Marca como eliminado
db.commit()

# Restaurar
driver.restore()
db.commit()

# Query solo activos
active_drivers = db.query(Driver).filter(Driver.not_deleted).all()
```

---

## Resumen de Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `backend/app/auth.py` | Clave persistente en desarrollo |
| `backend/app/routers/websockets.py` | Autenticación obligatoria, Redis requerido |
| `backend/app/routers/auth.py` | Rate limiting progresivo |
| `backend/app/routers/mods.py` | Validación ZIP completa |
| `backend/app/database.py` | Deprecación de migraciones manuales |
| `backend/app/models.py` | SoftDeleteMixin añadido |
| `backend/alembic/versions/add_soft_delete_columns.py` | Nueva migración |

---

## Próximos Pasos Recomendados

1. **Ejecutar migración:**
   ```bash
   cd backend
   alembic upgrade head
   ```

2. **Configurar Redis para producción:**
   ```env
   WS_PUBSUB=redis
   REDIS_URL=redis://localhost:6379/0
   ```

3. **Configurar tokens de cliente:**
   ```env
   CLIENT_TOKENS_JSON={"public-token":["public:read","ws:public"]}
   AGENT_TOKENS_JSON={"agent-token":["agent:ws","agent:report"]}
   ```

4. **Revisar logs después del despliegue:**
   - Buscar warnings de deprecación
   - Verificar que Redis pubsub está funcionando
   - Comprobar rate limiting en acción

---

## Notas de Compatibilidad

- **Backward compatible:** Todas las correcciones mantienen compatibilidad con código existente
- **Migración requerida:** Ejecutar `alembic upgrade head` para soft delete
- **Nuevas variables de entorno:** `WS_DEV_REQUIRE_AUTH` (opcional, default: true)
- **Deprecaciones:** Funciones `ensure_*_schema()` serán eliminadas en futura versión