# Guía Operativa - SimCenter Assetto Manager

Bienvenido a **Assetto Manager**. Este documento es la guía definitiva para operar su centro de simulación de forma eficiente, aprovechando todas las capacidades automatizadas del sistema.

---

## 1. Conceptos Básicos

El sistema centraliza el control de todos sus simuladores desde un único PC (Recepción). Usted no necesita configurar cada simulador manualmente; todo se hace desde el **Dashboard**.

### El Dashboard (Panel de Control)
Es su pantalla principal. Aquí verá de un vistazo:
*   **Estado de Simuladores**: 
    *   🟢 **Online**: Listo para usar.
    *   🔵 **En Sesión**: Cliente corriendo (muestra tiempo restante).
    *   ⚪ **Offline**: PC apagado o agente desconectado.
*   **Monitorización**: Vea si el volante está detectado o si el PC está sufriendo carga alta (CPU/GPU) sin levantarse de la silla.

---

## 2. Gestión de Clientes y Sesiones (El Día a Día)

### Iniciar una Sesión ("Lanzamiento")
Para poner a un cliente a correr:
1.  Haga clic en la tarjeta del simulador o use el botón 🚀 para lanzamiento masivo.
2.  **Seleccione el Contenido**: Coche y Circuito.
3.  **Configuración de Modo (¡Importante!)**:
    *   🖥️ **Modo Pantalla**: El sistema optimizará el juego para máxima calidad visual en monitor TV. **Respeta su configuración gráfica manual**.
    *   🕶️ **Modo VR**: El sistema cambiará automáticamente a modo Realidad Virtual (`Oculus`) y ajustará los gráficos (sombras, reflejos) para garantizar 90 FPS fluidos.
        *   *Nota: Puede personalizar la calidad VR en el archivo `agent/vr_settings.json` del simulador.*
4.  **Método de Pago**: Seleccione si el cliente pagó en Efectivo, Tarjeta, Bizum, etc. (Esto queda registrado para el cierre de caja).
5.  **Clic en "Iniciar"**: El simulador abrirá el juego automáticamente.

### Durante la Sesión
*   El cronómetro en el Dashboard le indica cuánto falta.
*   Puede **pausar** la sesión (congela el tiempo) o **detenerla** (cierra el juego forzosamente) en cualquier momento.

---

## 3. Torneos y Competición

Assetto Manager incluye un gestor completo de torneos para fidelizar clientes.

1.  Vaya a la sección **Torneos**.
2.  **Crear Torneo**: Ponga nombre (ej: "Copa Viernes GT3").
3.  **Definir Fases**: Clasificatoria (Time Attack) -> Eliminatorias (Carrera).
4.  **Inscripción**: Registre a los pilotos.
5.  **Brackets Automáticos**: El sistema generará los cruces (¼ de final, Semifinal, Final). Al lanzar una sesión de torneo, el sistema sabe quién corre contra quién.

---

## 4. Experiencia en el Local (TVs y Pantallas)

El sistema puede controlar pantallas externas ("Videowall") para dar ambiente al local. Use las siguientes direcciones en el navegador de su SmartTV:

*   **/tv/leaderboard**: Muestra los tiempos del torneo actual en vivo.
*   **/tv/hall-of-fame**: Muestra los récords históricos de cada circuito. **Rota automáticamente** mostrando categorías (Mejores Tiempos F1, Mejores Tiempos GT3, etc.).
*   **/tv/ads**: Carrusel publicitario a pantalla completa. Muestre sus ofertas o patrocinadores cuando no haya carreras.

---

## 5. Gestión Técnica Simplificada

### Perfiles de Volante (Force Feedback)
No pierda tiempo configurando el FFB para cada cliente.
*   En **Perfiles**, guarde configuraciones como "Modo Niño (Suave)" o "Modo Pro (Duro)".
*   Aplique el perfil al simulador con un clic antes de lanzar la sesión.

### Instalación de Mods (Coches y Pistas)
*   Simplemente arrastre el archivo `.zip` del coche o circuito al panel **Gestión de Contenido**.
*   El sistema lo instalará y lo enviará a **todos los simuladores** automáticamente.

### Modo Kiosko
Use la opción "Bloqueo Kiosko" para ocultar el Escritorio de Windows en los simuladores, evitando que los clientes toquen o desconfiguren los PCs.

---

## 6. Cierre y Reportes

En la sección **Historial/Reportes**:
*   Vea el total recaudado por día.
*   Desglose por método de pago (cuánto efectivo debe haber en caja).
*   **Telemetría**: Si ofrece entrenamiento profesional, puede exportar un **PDF con la telemetría** del cliente (velocidad, uso de pedales) para entregárselo como valor añadido.

---
*Assetto Manager - Diseñado para SimCenters Profesionales*
