# Explicación Simple de los Fallos Críticos

## Analogía: El Bar y sus Problemas

Imagina que AC Manager es como un bar con cámaras de seguridad, empleados y clientes. Estos son los problemas encontrados:

---

## 1. La Llave que Cambia Cada Día

**El problema:**
El bar tiene una llave maestra para abrir las puertas. Pero cada mañana, cambian la llave por una nueva aleatoria.

**Qué pasa:**
- Los empleados que tenían llave ayer, hoy no pueden entrar
- Tienen que pedir una nueva llave cada día

**En el código:**
Cada vez que reinicias el servidor, se genera una nueva "llave maestra" (SECRET_KEY). Los usuarios que estaban logueados tienen que volver a hacer login.

**Archivo:** `backend/app/auth.py` línea 44

---

## 2. El Guardia de Seguridad que Deja Pasar a Cualquiera

**El problema:**
El guardia de la puerta dice:
- "Si no me dan una tarjeta, espero 8 segundos"
- "Si después de 8 segundos no hay tarjeta... ¡pasa!"

**Qué pasa:**
- Cualquiera puede entrar sin tarjeta
- Solo tiene que esperar 8 segundos

**En el código:**
Los WebSockets permiten conexiones sin autenticación si no hay tokens configurados. Un atacante puede conectarse y ver datos de telemetría en tiempo real.

**Archivo:** `backend/app/routers/websockets.py` línea 39

---

## 3. El Cajero que Solo Cuenta 5 Intentos por Persona

**El problema:**
El cajero dice: "Solo permito 5 intentos de contraseña por minuto por persona".

**Qué pasa:**
- Un ladrón trae 100 amigos
- Cada amigo intenta 5 contraseñas
- ¡500 intentos por minuto!

**En el código:**
El límite de 5 intentos/minuto es por IP. Un atacante con muchas IPs (botnet) puede hacer miles de intentos.

**Archivo:** `backend/app/routers/auth.py` línea 178

---

## 4. El Paquete que Nadie Revisa Bien

**El problema:**
El bar recibe paquetes de proveedores. El empleado revisa:
- Que no sean demasiado pesados
- Que no tengan demasiadas cosas

**Pero NO revisa:**
- Si hay cosas peligrosas dentro (bombas, veneno)
- Si hay archivos ejecutables ocultos
- Si hay enlaces a lugares prohibidos

**Qué pasa:**
- Alguien puede enviar un paquete con un archivo .exe malicioso
- El archivo se extrae y puede ejecutarse

**En el código:**
Los archivos ZIP de mods se extraen sin validar el contenido. Un mod malicioso podría contener ejecutables o consumir todo el disco.

**Archivo:** `backend/app/routers/mods.py` línea 73

---

## 5. Los Empleados que No Se Hablan

**El problema:**
El bar tiene 2 pisos con un empleado en cada uno:
- Empleado A en piso 1 sabe que la mesa 5 está ocupada
- Empleado B en piso 2 sabe que la mesa 10 está libre
- Pero NO se comunican entre ellos

**Qué pasa:**
- Cliente en piso 1 quiere ir a mesa 10
- Empleado A no sabe dónde está mesa 10
- ¡El cliente se pierde!

**En el código:**
Con múltiples servidores (workers), cada uno tiene su propia lista de conexiones WebSocket. Un cliente conectado al servidor 1 no puede enviar mensajes a una estación conectada al servidor 2.

**Archivo:** `backend/app/routers/websockets.py` línea 75

---

## 6. Dos Jefes Dando Órdenes Diferentes

**El problema:**
Hay dos jefes:
- Jefe A dice: "Pongan una columna nueva en la base de datos"
- Jefe B dice: "Yo también voy a poner esa columna"

**Qué pasa:**
- La columna se intenta crear dos veces
- ¡Error! La columna ya existe

**En el código:**
Hay dos sistemas de migración:
- Funciones manuales en `database.py`
- Sistema Alembic versionado

Ambos pueden intentar modificar la base de datos, causando conflictos.

**Archivos:** `backend/app/database.py` y `backend/alembic/`

---

## 7. El Archivador que Quema Documentos

**El problema:**
Cuando un cliente se va, el bar quema todos sus documentos:
- Historial de visitas
- Puntos de fidelidad
- Reservas anteriores

**Qué pasa:**
- Si el cliente vuelve, no hay registro de él
- Si se equivocaron al borrar, no hay forma de recuperar

**En el código:**
Cuando se elimina un piloto, se borra físicamente de la base de datos. Sus 500 resultados históricos quedan huérfanos sin poder recuperarse.

**Archivo:** `backend/app/models.py`

---

## Resumen: ¿Por qué NO está listo para producción?

| Problema | Riesgo |
|----------|--------|
| Llave que cambia | Usuarios expulsados al reiniciar |
| Guardia permisivo | Hackers ven datos en tiempo real |
| Cajero limitado | Robo de contraseñas por fuerza bruta |
| Paquetes sin revisar | Virus en mods descargados |
| Empleados sin comunicación | Sistema multiplayer roto |
| Dos jefes | Base de datos corrupta |
| Archivador que quema | Pérdida irreversible de datos |

---

## ¿Qué hacer antes de lanzar?

1. **Fase 1 (Urgente):** Arreglar los problemas de seguridad (guardia, cajero, paquetes)
2. **Fase 2 (Importante):** Hacer que los empleados se comuniquen (Redis obligatorio)
3. **Fase 3 (Necesario):** Unificar los jefes y mejorar el archivador

**Tiempo estimado:** 4-6 semanas antes de poder lanzar con seguridad.