# VRacing Bar - Assetto Manager System

Sistema de gestión centralizada de mods y perfiles para simuladores de conducción Assetto Corsa. Diseñado para entornos Arcade/Bar.

## 🚀 Inicio Rápido (Producción)

### 1. Servidor Central (El PC del Operador)
*   **Instalación:** Ejecuta (como Admin) `server_setup.ps1` para configurar el Firewall.
*   **Uso Diario:** Haz doble clic en `start_server.bat`. Esto abrirá el Backend y el Panel de Control Web.
*   **Panel Web:** Accesible en [http://localhost:5959](http://localhost:5959).
*   **Base de Datos:** Requiere PostgreSQL (o Supabase) configurado en el archivo `backend/.env`.

### 2. Simuladores (Los Puestos de Conducción)
*   **Instalación:** Copia `dist/AC_Manager_Agent.exe` y crea un `config.json` con la IP del servidor.
*   **Uso:** El agente debe arrancar al inicio de Windows. Se mantendrá en silencio sincronizando el contenido.

## 📂 Estructura del Proyecto

*   `backend/`: Servidor API (FastAPI) y Base de Datos.
*   `frontend/`: Panel de Control Web (React + Tailwind).
*   `agent/`: Cliente de sincronización para los simuladores.
*   `shared/`: Código compartido (Hashing, Protocolos).
*   `dist/`: Ejecutables compilados (Agente).

## 📚 Documentación Adjunta

*   [Guía de Despliegue Arcade](file:///C:/Users/Usuari/.gemini/antigravity/brain/4e86eebd-7c8d-4a1f-9dfc-0f399709b868/arcade_deployment_guide.md): Recomendaciones específicas para tu Bar (VMS, Red, etc.).
*   [Roadmap de Futuro](file:///C:/Users/Usuari/.gemini/antigravity/brain/4e86eebd-7c8d-4a1f-9dfc-0f399709b868/future_roadmap.md): Ideas para expandir el sistema (Leaderboards, etc.).
*   [Walkthrough Técnico](file:///C:/Users/Usuari/.gemini/antigravity/brain/4e86eebd-7c8d-4a1f-9dfc-0f399709b868/walkthrough.md): Detalles de verificación y pruebas.

## ✨ Características Clave

*   **Sync Delta:** Solo descarga lo que cambia (rápido).
*   **Dependencias:** Si pones un Skin, se baja el Coche automáticamente.
*   **Dashboard Real:** Monitoriza tus 5 PCs desde una sola pantalla.
*   **Logo Personalizado:** Branding "VRacing".

---
Desarrollado por [Tu Asistente de IA] para VRacing Bar.
