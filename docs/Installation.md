# Instalación del Sistema

## Requisitos Previos

### Servidor Central (Backend + Frontend)
*   **Sistema Operativo**: Windows 10/11 (Recomendado) o Linux.
*   **Software Base**:
    *   Python 3.10 o superior.
    *   Node.js 18 LTS o superior.
    *   PostgreSQL 14+ (Local o Remoto).
    *   Git.

### Agentes (Simuladores)
*   **Sistema Operativo**: Windows 10/11.
*   **Software Base**:
    *   Assetto Corsa (Steam).
    *   Python 3.10+ (Para ejecutar el agente).
    *   Steam instalado y logueado con cuenta propietaria de AC.

---

## 1. Instalación del Servidor (Recepción)

1.  **Clonar el Repositorio**:
    ```bash
    git clone https://github.com/tu-repo/ac-manager.git
    cd ac-manager
    ```

2.  **Backend (Python)**:
    ```bash
    cd backend
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt
    ```
    *   Crear archivo `.env` basado en `.env.example`.
    *   Configurar `DATABASE_URL=postgresql://user:pass@localhost/dbname`.

3.  **Frontend (React)**:
    ```bash
    cd frontend
    npm install
    ```
    *   Crear archivo `.env` con: `VITE_API_URL=http://localhost:8000`.

4.  **Iniciar Servidor**:
    *   Ejecutar `start_server.bat` en la raíz.

---

## 2. Instalación de Agentes (Simuladores)

1.  Copiar la carpeta `agent` del repositorio a cada PC simulador (ej: `C:\ACManager\agent`).
2.  Instalar dependencias:
    ```bash
    cd agent
    pip install -r requirements.txt
    ```
3.  **Configurar `config.json`**:
    Editar `agent/config.json` en cada PC:
    ```json
    {
        "server_url": "http://192.168.1.100:8000",  <-- IP DEL SERVIDOR
        "station_name": "Simulador 01",
        "ac_path": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa",
        "steam_app_id": 244210,
        "agent_token": "clave_secreta_si_aplica"
    }
    ```

4.  **Iniciar Agente**:
    *   Ejecutar `python main.py`.
    *   Recomendado: Crear una tarea programada o acceso directo al `setup.bat` para inicio automático con Windows.
