import os
import platform
import shlex
import subprocess
import threading
from typing import Optional
from urllib.parse import urlparse, urlunparse

from config import (
    IDLE_DISPLAY_ENABLED,
    IDLE_DISPLAY_URL,
    IDLE_DISPLAY_BROWSER_PATH,
    IDLE_DISPLAY_BROWSER_ARGS,
    SERVER_URL,
    logger,
)

_proc: Optional[subprocess.Popen] = None
_lock = threading.Lock()


def _resolve_display_url() -> str:
    custom = (IDLE_DISPLAY_URL or "").strip()
    if custom:
        return custom

    parsed = urlparse(SERVER_URL or "")
    if not parsed.scheme or not parsed.hostname:
        return "http://localhost:8000/station-display"

    return urlunparse((parsed.scheme, parsed.netloc, "/station-display", "", "", ""))


def _resolve_browser_path() -> Optional[str]:
    configured = (IDLE_DISPLAY_BROWSER_PATH or "").strip()
    if configured:
        return configured

    if platform.system() != "Windows":
        return None

    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def _build_command(url: str) -> Optional[list[str]]:
    browser = _resolve_browser_path()
    if not browser:
        logger.warning("Idle display disabled: browser executable not found")
        return None

    args_text = (IDLE_DISPLAY_BROWSER_ARGS or "").strip()
    args = shlex.split(args_text, posix=False) if args_text else [
        "--kiosk",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-restore-session-state",
    ]

    return [browser, *args, url]


def start_idle_display() -> bool:
    global _proc
    if not IDLE_DISPLAY_ENABLED:
        return False

    with _lock:
        if _proc and _proc.poll() is None:
            return True

        url = _resolve_display_url()
        cmd = _build_command(url)
        if not cmd:
            return False

        try:
            creationflags = 0
            if platform.system() == "Windows":
                creationflags = (
                    getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                    | getattr(subprocess, "DETACHED_PROCESS", 0)
                )

            _proc = subprocess.Popen(cmd, creationflags=creationflags)
            logger.info("Idle display started: %s", url)
            return True
        except Exception as e:
            logger.error("Failed to start idle display: %s", e)
            _proc = None
            return False


def stop_idle_display() -> bool:
    global _proc
    with _lock:
        if not _proc:
            return True
        if _proc.poll() is not None:
            _proc = None
            return True

        try:
            _proc.terminate()
            try:
                _proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                _proc.kill()
            logger.info("Idle display stopped")
            return True
        except Exception as e:
            logger.error("Failed to stop idle display: %s", e)
            return False
        finally:
            _proc = None
