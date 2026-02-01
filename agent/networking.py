import logging
import requests
import socket
from config import AGENT_TOKEN, SERVER_URL, logger

def get_agent_headers():
    return {"X-Agent-Token": AGENT_TOKEN} if AGENT_TOKEN else {}

# --- Network Log Handler ---
class NetworkLogHandler(logging.Handler):
    def __init__(self, server_url):
        super().__init__()
        self.server_url = server_url
        self.agent_name = socket.gethostname()

    def emit(self, record):
        # Prevent infinite recursion if requests logs something
        if record.name.startswith("urllib3") or record.name.startswith("requests"):
            return
            
        try:
            log_data = {
                "level": record.levelname,
                "source": f"Agent-{self.agent_name}",
                "message": record.getMessage(),
                "details": f"{record.filename}:{record.lineno}"
            }
            # Use a short timeout and ignore errors to not block the agent
            requests.post(
                f"{self.server_url}/system/logs/",
                json=log_data,
                headers=get_agent_headers(),
                timeout=1
            )
        except Exception:
            pass # Fail silently if backend is down
