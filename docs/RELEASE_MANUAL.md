# Manual de Lanzamientos (Release)

Este manual describe el flujo recomendado para publicar nuevas versiones del sistema (backend + frontend + agente).

## 0) Requisitos previos
- Rama principal limpia y tests en verde.
- Backups recientes de la base de datos.
- Acceso a credenciales necesarias (UPDATE_SIGNING_KEY, SECRET_KEY, etc.).

## 1) Versionado
- Usa SemVer: MAJOR.MINOR.PATCH (ej: 1.4.2)
- Backend y frontend comparten versión de release.
- El Agente puede llevar versión propia si lo necesitas.

## 2) Preparación
1. Actualiza CHANGELOG (si existe) o crea notas de release.
2. Revisa que el pipeline CI pase (tests backend + build frontend).
3. Asegura que AUTO_SCHEMA esté en false en producción.
4. Si hay migraciones, prepara el plan de ejecución.

## 3) Release Backend + Frontend
1. Actualiza el número de versión (si lo usas en UI o API).
2. Construye frontend:
   - npm run build (en /frontend)
3. Lanza backend en entorno de staging y valida:
   - /health
   - login
   - estaciones online
   - flujo kiosk

## 4) Release del Agente
1. Incrementa AGENT_VERSION en agent/config.py
2. Genera el ZIP del agente (excluye .venv, logs, etc.).
3. Sube el ZIP al backend:
   - POST /system/update (requiere admin)
   - Usa versión exacta (ej: 1.4.2)
4. Si UPDATE_SIGNING_KEY está configurado, el backend firmará el update y el agente lo verificará.

## 5) Despliegue a Producción
1. Ejecuta backup:
   - scripts/backup_db.ps1
2. Despliega backend/frontend (scripts/deploy_prod.ps1 o start_server_prod.bat)
3. Verifica:
   - /health
   - UI carga en http://<server-ip>:8000
   - permisos y tokens correctos
4. Agentes:
   - O esperan el update automático
   - O reinicia el agente para forzar check_for_updates

## 6) Rollback
- Backend/frontend: vuelve al commit/tag anterior y redeploy.
- Agente: sube un ZIP anterior con /system/update y marca mandatory=false.

## 7) Etiquetas Git
- Crea tags firmadas cuando sea posible:
  git tag -a v1.4.2 -m "Release 1.4.2"
  git push --tags

## 8) Checklist rápida
- [ ] CI verde
- [ ] Backup hecho
- [ ] Migraciones listas
- [ ] Frontend build ok
- [ ] Backend ok (health + auth + kiosk)
- [ ] Agente update probado en una estación
- [ ] Tag creado
- [ ] Release comunicado

