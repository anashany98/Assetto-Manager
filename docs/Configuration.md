# Configuración Avanzada

## 1. Realidad Virtual (VR)

El sistema gestiona automáticamente el cambio entre VR y Monitor.

### Ajustes por Defecto
El agente tiene un archivo `agent/vr_settings.json` donde se definen los gráficos para el modo VR.

**Ejemplo `vr_settings.json`:**
```json
{
    "RENDERING_MODE": "OCULUS",
    "AASAMPLES": "2",           // 2x MSAA para rendimiento
    "SHADOW_MAP_SIZE": "2048",  // Sombras medias
    "REFLECTION_QUALITY": "1",  // Reflejos bajos
    "GLARE": "3",
    "DEPTH_OF_FIELD": "0"       // Desactivado para claridad
}
```
*   Puede editar este archivo en cada simulador para ajustar la calidad según la gráfica (RTX 3070 vs 4090).

### Modo Monitor
Cuando se lanza en modo "Pantalla", el sistema establece `RENDERING_MODE=SINGLE_SCREEN` y **respeta** cualquier otra configuración gráfica que tenga el simulador (calidad Ultra, etc.), sin sobrescribirla.

---

## 2. Perfiles de Volante (Force Feedback)

Puede crear "Perfiles" en el Backend (`/profiles`) y enviarlos a los simuladores.
*   **Funcionamiento**: El sistema sobrescribe el archivo `controls.ini` de Assetto Corsa.
*   **Uso**: Cree perfiles para distintos tipos de coche/base (e.g. "Fanatec GT3", "Logitech F1").
*   **Envío**: Desde el Dashboard o menú de Perfiles, seleccione el perfil y pulse "Aplicar a Todos" o a una estación específica.

---

## 3. Modo Kiosko

Para proteger los PCs de los clientes:
1.  Vaya a **Ajustes** -> **Estaciones**.
2.  Active **"Modo Kiosko"** en el simulador deseado.
3.  **Efecto**: El agente mata el proceso `explorer.exe` en el simulador, dejando solo el fondo de pantalla y el juego cuando se lanza. Al desactivarlo, restaura el escritorio.

---

## 4. Publicidad en TV

Para usar una TV como panel publicitario:
1.  Suba imágenes/videos a la carpeta de medios (o vía API `/ads`).
2.  Abra el navegador de la SmartTV en `http://IP_SERVIDOR:3000/tv/ads`.
3.  Pulse **F11** para pantalla completa. El sistema rotará los anuncios automáticamente.
