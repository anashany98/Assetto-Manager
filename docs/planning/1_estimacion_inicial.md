# Estimación de Desarrollo y Costes: Assetto Manager System

Esta estimación se basa en la arquitectura actual del sistema (Backend FastAPI, Frontend React, Agente Windows) y las funcionalidades identificadas en el código (Gestión de Mods, Telemetría, Campeonatos, Torneos).

## Resumen Ejecutivo

*   **Tiempo Total Estimado:** 380 - 520 horas.
*   **Plazo de Entrega (1 Desarrollador):** 2.5 - 3.5 meses (a tiempo completo).
*   **Complejidad:** Alta (Sincronización de archivos, Tiempo real, Lógica de torneos).

## Desglose Detallado

### 1. Backend (API & Base de Datos)
**Tecnología:** Python, FastAPI, SQLAlchemy, WebSockets.
**Funcionalidades:**
*   Gestión de usuarios y autenticación.
*   Base de datos compleja (Drivers, Mods, Eventos, Torneos, Telemetría).
*   Lógica de Torneos (Sistemas de brackets, ELO rating).
*   Procesamiento de Telemetría (Análisis de vueltas, sectores).
*   WebSockets para Dashboard en tiempo real.

**Estimación:** 120 - 160 horas.

### 2. Frontend (Panel de Control Web)
**Tecnología:** React, TypeScript, TailwindCSS, Recharts.
**Funcionalidades:**
*   Dashboard en tiempo real (Monitorización de 5 PCs).
*   Gestores de Archivos (Subida de Mods, gestión de dependencias).
*   Visualización de Datos (Gráficas de telemetría, comparadores).
*   UI de Gestión de Campeonatos y Torneos (Brackets visuales).
*   +20 Páginas y componentes complejos.

**Estimación:** 140 - 180 horas.

### 3. Agente de Cliente (Simuladores)
**Tecnología:** Python, Scripts Windows, File System.
**Funcionalidades:**
*   Sincronización diferencial de archivos ("Sync Delta").
*   Instalación silenciosa y gestión de procesos Assetto Corsa.
*   Comunicación bidireccional con el servidor.
*   Manejo de errores y recuperación automática.

**Estimación:** 80 - 120 horas.

### 4. Infraestructura y DevOps
**Funcionalidades:**
*   Base de datos (Migraciones, Seeds).
*   Scripts de despliegue (`server_setup.ps1`, `install.bat`).
*   Configuración de red local (Firewall, IPs).
*   Testing y QA.

**Estimación:** 40 - 60 horas.

## Factores de Coste

El coste monetario dependerá de la tarifa por hora del desarrollador.
*   **Junior/Mid (25€ - 40€/hora):** 9.500€ - 20.000€
*   **Senior/Agency (50€ - 80€/hora):** 19.000€ - 41.000€

## Estado Actual vs. Restante
El proyecto parece estar en una fase avanzada (70-80%). Gran parte del núcleo (Modelos, Routers principales, Estructura Frontend) está construido.
**Restante estimado para "Versión 1.0 Final":** Posiblemente 80-120 horas de depuración, testeo en entorno real (Bar) y pulido de UI.
