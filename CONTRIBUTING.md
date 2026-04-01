# Contribuir a AC-MANAGER

Gracias por tu interés en contribuir. Esta guía te ayudará a empezar.

## 🌿 Branching

Usamos un flujo simple de ramas:

- `master` - Rama principal, siempre estable
- `feature/<nombre>` - Nuevas funcionalidades
- `fix/<nombre>` - Correcciones de bugs
- `docs/<nombre>` - Cambios de documentación

```bash
git checkout -b feature/mi-funcionalidad
# ... trabajar ...
git commit -m "feat: descripción del cambio"
git push origin feature/mi-funcionalidad
```

## 📝 Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
tipo: descripción corta

# Tipos:
feat:     Nueva funcionalidad
fix:      Corrección de bug
test:     Añadir o corregir tests
docs:     Cambios de documentación
chore:    Tareas de mantenimiento
refactor: Refactorización sin cambio de comportamiento
perf:     Mejoras de rendimiento
style:    Cambios de formato/estilo (sin lógica)
```

Ejemplos:
```bash
git commit -m "feat: añadir sistema de notificaciones push"
git commit -m "fix: corregir serialización de Row en analytics"
git commit -m "test: añadir 16 tests para endpoints de analytics"
```

## 🧪 Testing

### Antes de hacer PR

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test -- --run
npm run build:check
```

### Nuevos tests

- **Backend**: Añadir tests en `backend/tests/test_<modulo>.py`
- **Frontend**: Añadir tests en `frontend/src/__tests__/<modulo>.test.tsx`
- **E2E**: Añadir specs en `frontend/e2e/<modulo>.spec.ts`

### Cobertura mínima

- Nuevas funcionalidades: 80% de cobertura
- Correcciones de bugs: test que reproduce el bug + fix

## 🎨 Estándares de Código

### Frontend (TypeScript + React)

- TypeScript estricto (sin `any`)
- Componentes funcionales con hooks
- Tailwind CSS para estilos
- Imports: React → librerías externas → internos → utils
- Nombres: PascalCase para componentes, camelCase para hooks/funciones

```typescript
// ✅ Bien
interface StationProps {
    id: number;
    name: string;
    status: 'online' | 'offline';
}

export function StationCard({ id, name, status }: StationProps) {
    return <div className="p-4">{name}</div>;
}

// ❌ Mal
const StationCard = (props: any) => {
    return <div>{props.name}</div>;
};
```

### Backend (Python + FastAPI)

- Pydantic para validación de request/response
- SQLAlchemy ORM para queries
- Docstrings en funciones complejas
- snake_case para funciones/variables, PascalCase para clases

```python
# ✅ Bien
async def get_station_stats(range_days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    """Get station statistics for the specified range."""
    ...

# ❌ Mal
def get_stats(days=30, db=None):
    ...
```

## 🔍 Code Review

Antes de solicitar review:

1. [ ] Tests pasan (`pytest` + `npm test`)
2. [ ] Build pasa (`npm run build:check`)
3. [ ] No hay warnings de TypeScript
4. [ ] No hay imports no usados
5. [ ] El commit sigue Conventional Commits

## 🐛 Reportar Bugs

Abre un issue con:

1. Descripción del problema
2. Pasos para reproducir
3. Comportamiento esperado vs real
4. Logs relevantes (si aplica)
5. Versión del sistema

## 🚀 Release Process

1. Actualizar `CHANGELOG.md`
2. Crear tag: `git tag v1.2.0`
3. Push tag: `git push origin v1.2.0`
4. Crear GitHub Release con notas

---

**¿Dudas?** Abre un issue o contacta al equipo.
