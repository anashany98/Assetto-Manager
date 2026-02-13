from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import os
import json
from pathlib import Path
from typing import Any
from ..paths import PUBLIC_STORAGE_DIR, REPO_ROOT
from ..routers.auth import require_admin, require_agent_token_scoped
import re
from ..limiters import limiter
import hashlib
import hmac
import subprocess
import threading
import sys
import time
from copy import deepcopy
from ..utils.uploads import save_upload_file
from ..observability import snapshot
from .. import models, database
from datetime import datetime, timezone, timedelta

router = APIRouter(
    prefix="/system",
    tags=["system"],
    responses={404: {"description": "Not found"}},
)

UPDATES_DIR = PUBLIC_STORAGE_DIR / "updates"
UPDATES_DIR.mkdir(parents=True, exist_ok=True)
VERSION_FILE = UPDATES_DIR / "version.json"

class SystemVersion(BaseModel):
    version: str
    url: str
    mandatory: bool = False
    sha256: str | None = None
    signature: str | None = None


class AppUpdateRunRequest(BaseModel):
    force: bool = False


class AppUpdateStep(BaseModel):
    name: str
    status: str
    command: str | None = None
    return_code: int | None = None
    duration_ms: int | None = None
    output_tail: str | None = None
    error_tail: str | None = None


class AppUpdateRunInfo(BaseModel):
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    restart_required: bool = False
    error: str | None = None
    steps: list[AppUpdateStep] = Field(default_factory=list)


class AppUpdateStatus(BaseModel):
    supported: bool
    has_update: bool
    current_branch: str | None = None
    current_commit: str | None = None
    latest_commit: str | None = None
    behind_count: int = 0
    check_error: str | None = None
    checked_at: str | None = None
    is_updating: bool = False
    last_run: AppUpdateRunInfo | None = None
    restart_supported: bool = False
    restart_service_name: str | None = None
    restart_error: str | None = None


_APP_UPDATE_LOCK = threading.Lock()
_APP_UPDATE_STATE: dict[str, Any] = {
    "is_updating": False,
    "last_run": None,
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _web_updates_enabled() -> bool:
    return os.getenv("ENABLE_WEB_UPDATES", "true").lower() in {"1", "true", "yes"}


def _restart_service_name() -> str:
    value = (os.getenv("APP_UPDATE_SERVICE_NAME") or "ACManagerBackend").strip()
    return value or "ACManagerBackend"


def _tail_text(value: str | None, limit: int = 2500) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[-limit:]


def _run_cmd(command: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _git_cmd(args: list[str], timeout: int = 25) -> subprocess.CompletedProcess[str]:
    return _run_cmd(["git", *args], cwd=REPO_ROOT, timeout=timeout)


def _read_git_update_status(refresh: bool = True) -> dict[str, Any]:
    result: dict[str, Any] = {
        "supported": False,
        "has_update": False,
        "current_branch": None,
        "current_commit": None,
        "latest_commit": None,
        "behind_count": 0,
        "check_error": None,
        "checked_at": _utc_now_iso(),
    }

    if not _web_updates_enabled():
        result["check_error"] = "Web updater disabled by ENABLE_WEB_UPDATES."
        return result

    try:
        version_check = _git_cmd(["--version"], timeout=10)
        if version_check.returncode != 0:
            result["check_error"] = "Git is not available on this server."
            return result

        inside_repo = _git_cmd(["rev-parse", "--is-inside-work-tree"], timeout=10)
        if inside_repo.returncode != 0 or inside_repo.stdout.strip().lower() != "true":
            result["check_error"] = "Server is not running from a Git repository."
            return result

        branch_res = _git_cmd(["rev-parse", "--abbrev-ref", "HEAD"], timeout=10)
        if branch_res.returncode != 0:
            result["check_error"] = _tail_text(branch_res.stderr) or "Failed to read current Git branch."
            return result
        branch = branch_res.stdout.strip()
        result["current_branch"] = branch

        local_res = _git_cmd(["rev-parse", "HEAD"], timeout=10)
        if local_res.returncode == 0:
            result["current_commit"] = local_res.stdout.strip()

        if refresh:
            fetch_res = _git_cmd(["fetch", "origin", branch, "--prune"], timeout=60)
            if fetch_res.returncode != 0:
                result["check_error"] = _tail_text(fetch_res.stderr) or "Could not fetch remote changes."

        remote_res = _git_cmd(["rev-parse", f"origin/{branch}"], timeout=10)
        if remote_res.returncode != 0:
            if not result["check_error"]:
                result["check_error"] = _tail_text(remote_res.stderr) or "Remote branch not found."
            return result

        remote_commit = remote_res.stdout.strip()
        result["latest_commit"] = remote_commit

        behind_res = _git_cmd(["rev-list", "--count", f"HEAD..origin/{branch}"], timeout=10)
        if behind_res.returncode == 0:
            try:
                behind_count = int(behind_res.stdout.strip() or "0")
            except ValueError:
                behind_count = 0
        else:
            behind_count = 0
            if not result["check_error"]:
                result["check_error"] = _tail_text(behind_res.stderr) or "Could not compare versions."

        result["behind_count"] = max(behind_count, 0)
        result["has_update"] = result["behind_count"] > 0
        result["supported"] = True
        return result
    except subprocess.TimeoutExpired:
        result["check_error"] = "Update check timed out."
        return result
    except Exception as exc:
        result["check_error"] = f"Update check failed: {exc}"
        return result


def _read_restart_capability(check_service: bool = True) -> dict[str, Any]:
    service_name = _restart_service_name()
    info: dict[str, Any] = {
        "restart_supported": False,
        "restart_service_name": service_name,
        "restart_error": None,
    }

    if os.name != "nt":
        info["restart_error"] = "Automatic restart is only supported on Windows services."
        return info

    if not check_service:
        info["restart_supported"] = True
        return info

    try:
        query = subprocess.run(
            ["sc", "query", service_name],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if query.returncode != 0:
            detail = _tail_text(query.stderr) or _tail_text(query.stdout) or "Service not found."
            info["restart_error"] = f"Windows service '{service_name}' not available. {detail}"
            return info
    except Exception as exc:
        info["restart_error"] = f"Could not verify Windows service '{service_name}': {exc}"
        return info

    info["restart_supported"] = True
    return info


def _snapshot_app_update_state() -> dict[str, Any]:
    with _APP_UPDATE_LOCK:
        return deepcopy(_APP_UPDATE_STATE)


def _append_step(
    run_info: dict[str, Any],
    *,
    name: str,
    status: str,
    command: str | None = None,
    return_code: int | None = None,
    duration_ms: int | None = None,
    output_tail: str | None = None,
    error_tail: str | None = None,
) -> None:
    run_info["steps"].append({
        "name": name,
        "status": status,
        "command": command,
        "return_code": return_code,
        "duration_ms": duration_ms,
        "output_tail": output_tail,
        "error_tail": error_tail,
    })


def _run_update_step(run_info: dict[str, Any], *, name: str, command: list[str], cwd: Path, timeout: int) -> None:
    started = time.time()
    result = _run_cmd(command, cwd=cwd, timeout=timeout)
    duration_ms = int((time.time() - started) * 1000)
    command_str = " ".join(command)
    if result.returncode != 0:
        _append_step(
            run_info,
            name=name,
            status="failed",
            command=command_str,
            return_code=result.returncode,
            duration_ms=duration_ms,
            output_tail=_tail_text(result.stdout),
            error_tail=_tail_text(result.stderr),
        )
        raise RuntimeError(f"{name} failed (exit code {result.returncode})")

    _append_step(
        run_info,
        name=name,
        status="success",
        command=command_str,
        return_code=result.returncode,
        duration_ms=duration_ms,
        output_tail=_tail_text(result.stdout),
        error_tail=_tail_text(result.stderr),
    )


def _execute_full_app_update(force: bool = False) -> None:
    run_info: dict[str, Any] = {
        "status": "running",
        "started_at": _utc_now_iso(),
        "finished_at": None,
        "restart_required": False,
        "error": None,
        "steps": [],
    }

    try:
        status = _read_git_update_status(refresh=True)
        _append_step(
            run_info,
            name="Check for updates",
            status="success" if status.get("supported") else "failed",
            output_tail=json.dumps({
                "branch": status.get("current_branch"),
                "current_commit": status.get("current_commit"),
                "latest_commit": status.get("latest_commit"),
                "behind_count": status.get("behind_count"),
                "has_update": status.get("has_update"),
            }, ensure_ascii=False),
            error_tail=status.get("check_error"),
        )

        if not status.get("supported"):
            raise RuntimeError(status.get("check_error") or "Web updater is not supported in this environment.")

        if not force and not status.get("has_update"):
            run_info["status"] = "success"
            run_info["finished_at"] = _utc_now_iso()
            with _APP_UPDATE_LOCK:
                _APP_UPDATE_STATE["is_updating"] = False
                _APP_UPDATE_STATE["last_run"] = run_info
            return

        branch = status.get("current_branch") or "master"

        _run_update_step(
            run_info,
            name="Pull repository changes",
            command=["git", "pull", "origin", branch],
            cwd=REPO_ROOT,
            timeout=180,
        )
        _run_update_step(
            run_info,
            name="Install backend dependencies",
            command=[
                sys.executable,
                "-m",
                "pip",
                "install",
                "-r",
                str(REPO_ROOT / "backend" / "requirements.txt"),
            ],
            cwd=REPO_ROOT,
            timeout=1200,
        )
        _run_update_step(
            run_info,
            name="Install frontend dependencies",
            command=["npm", "install"],
            cwd=REPO_ROOT / "frontend",
            timeout=1800,
        )
        _run_update_step(
            run_info,
            name="Build frontend",
            command=["npm", "run", "build"],
            cwd=REPO_ROOT / "frontend",
            timeout=1800,
        )

        run_info["status"] = "success"
        run_info["restart_required"] = True
    except Exception as exc:
        run_info["status"] = "failed"
        run_info["error"] = str(exc)
    finally:
        run_info["finished_at"] = _utc_now_iso()
        with _APP_UPDATE_LOCK:
            _APP_UPDATE_STATE["is_updating"] = False
            _APP_UPDATE_STATE["last_run"] = run_info


@router.get("/app-update/status", response_model=AppUpdateStatus, dependencies=[Depends(require_admin)])
def get_app_update_status(refresh: bool = True):
    runtime_state = _snapshot_app_update_state()
    git_status = _read_git_update_status(refresh=refresh and not bool(runtime_state.get("is_updating")))
    restart_info = _read_restart_capability(check_service=True)

    return AppUpdateStatus(
        supported=bool(git_status.get("supported")),
        has_update=bool(git_status.get("has_update")),
        current_branch=git_status.get("current_branch"),
        current_commit=git_status.get("current_commit"),
        latest_commit=git_status.get("latest_commit"),
        behind_count=int(git_status.get("behind_count") or 0),
        check_error=git_status.get("check_error"),
        checked_at=git_status.get("checked_at"),
        is_updating=bool(runtime_state.get("is_updating")),
        last_run=runtime_state.get("last_run"),
        restart_supported=bool(restart_info.get("restart_supported")),
        restart_service_name=restart_info.get("restart_service_name"),
        restart_error=restart_info.get("restart_error"),
    )


@router.post("/app-update/run", dependencies=[Depends(require_admin)])
@limiter.limit("3/minute")
def run_app_update(request: Request, background_tasks: BackgroundTasks, payload: AppUpdateRunRequest | None = None):
    if not _web_updates_enabled():
        raise HTTPException(status_code=403, detail="Web updater is disabled by server configuration.")

    with _APP_UPDATE_LOCK:
        if _APP_UPDATE_STATE.get("is_updating"):
            raise HTTPException(status_code=409, detail="An update is already running.")

        _APP_UPDATE_STATE["is_updating"] = True
        _APP_UPDATE_STATE["last_run"] = {
            "status": "queued",
            "started_at": _utc_now_iso(),
            "finished_at": None,
            "restart_required": False,
            "error": None,
            "steps": [],
        }

    force = bool(payload.force) if payload else False
    background_tasks.add_task(_execute_full_app_update, force)
    return {"status": "started", "force": force, "message": "Update task started."}


@router.post("/app-update/restart-service", dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def restart_app_service(request: Request):
    with _APP_UPDATE_LOCK:
        if _APP_UPDATE_STATE.get("is_updating"):
            raise HTTPException(status_code=409, detail="Cannot restart while an update is running.")

    restart_info = _read_restart_capability(check_service=True)
    if not restart_info.get("restart_supported"):
        raise HTTPException(
            status_code=400,
            detail=restart_info.get("restart_error") or "Automatic restart is not supported in this environment.",
        )

    service_name = str(restart_info.get("restart_service_name") or _restart_service_name())
    delay_seconds = max(1, int(os.getenv("APP_UPDATE_RESTART_DELAY_SECONDS", "3")))
    safe_service_name = service_name.replace("'", "''")
    command = f"$ErrorActionPreference='Stop'; Start-Sleep -Seconds {delay_seconds}; Restart-Service -Name '{safe_service_name}' -Force"

    creationflags = 0
    creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)

    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to schedule service restart: {exc}")

    return {
        "status": "scheduled",
        "service_name": service_name,
        "delay_seconds": delay_seconds,
        "message": "Service restart scheduled.",
    }

@router.get("/version", response_model=SystemVersion, dependencies=[Depends(require_agent_token_scoped("agent:update"))])
def get_latest_version():
    """
    Returns the latest available Agent version.
    """
    if not VERSION_FILE.exists():
        return SystemVersion(version="0.0.0", url="", mandatory=False)
    
    try:
        with open(VERSION_FILE, "r") as f:
            data = json.load(f)
            return SystemVersion(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read version file: {str(e)}")

@router.post("/update", dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def upload_update(request: Request, version: str, file: UploadFile = File(...), mandatory: bool = False):
    """
    Upload a new Agent update (ZIP file).
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")
    
    if not re.fullmatch(r"[A-Za-z0-9._-]+", version or ""):
        raise HTTPException(status_code=400, detail="Invalid version format")

    try:
        # Save the file
        file_path = UPDATES_DIR / f"agent_v{version}.zip"
        max_bytes = int(os.getenv("MAX_UPDATE_UPLOAD_MB", "200")) * 1024 * 1024
        save_upload_file(file, file_path, max_bytes)

        # Compute SHA256 for integrity
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        sha256_hex = sha256.hexdigest()

        signature = None
        signing_key = os.getenv("UPDATE_SIGNING_KEY")
        if signing_key:
            signature = hmac.new(
                signing_key.encode("utf-8"),
                sha256_hex.encode("utf-8"),
                hashlib.sha256
            ).hexdigest()
            
        # Update version manifest
        update_info = {
            "version": version,
            "url": f"/static/updates/agent_v{version}.zip",
            "mandatory": mandatory,
            "sha256": sha256_hex,
            "signature": signature
        }
        
        with open(VERSION_FILE, "w") as f:
            json.dump(update_info, f, indent=2)
            
        return {"status": "success", "message": f"Version {version} uploaded", "info": update_info}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save update: {str(e)}")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes"}


def _severity_rank(severity: str) -> int:
    return {"ok": 0, "warning": 1, "critical": 2}.get(severity, 0)


def _merge_status(current: str, candidate: str) -> str:
    return candidate if _severity_rank(candidate) > _severity_rank(current) else current


def _collect_station_summary(db) -> dict[str, int]:
    grace_seconds = int(os.getenv("STATION_ONLINE_GRACE_SECONDS", "90"))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=grace_seconds)

    stations = db.query(models.Station).all()
    total = len(stations)
    online = 0
    offline = 0
    stale = 0

    for station in stations:
        last_seen = station.last_seen
        is_fresh = last_seen and last_seen >= cutoff
        if station.is_online and is_fresh:
            online += 1
        else:
            offline += 1
            if station.is_online and not is_fresh:
                stale += 1

    return {
        "total": total,
        "online": online,
        "offline": offline,
        "stale_online": stale,
        "grace_seconds": grace_seconds,
    }


def _collect_ws_stats() -> dict[str, Any]:
    try:
        from ..routers.websockets import manager as ws_manager
        return ws_manager.stats()
    except Exception as exc:
        return {"error": str(exc)}


def _collect_scheduler_stats() -> dict[str, Any]:
    try:
        from ..services.scheduler import scheduler as apscheduler
        jobs = []
        for job in apscheduler.get_jobs():
            next_run = getattr(job, "next_run_time", None)
            jobs.append({
                "id": job.id,
                "next_run_time": next_run.isoformat() if next_run else None,
                "trigger": str(job.trigger),
            })
        return {
            "running": bool(getattr(apscheduler, "running", False)),
            "jobs": jobs,
        }
    except Exception as exc:
        return {"error": str(exc)}


def _build_operational_alerts(
    metrics: dict[str, Any],
    station_summary: dict[str, int],
    ws_stats: dict[str, Any],
    scheduler_stats: dict[str, Any],
) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    alerts: list[dict[str, Any]] = []
    status = "ok"

    recent = metrics.get("recent", {}) if isinstance(metrics, dict) else {}
    recent_requests = int(recent.get("requests") or 0)
    recent_error_rate = float(recent.get("error_rate") or 0.0)
    recent_server_error_rate = float(recent.get("server_error_rate") or 0.0)
    recent_p95_ms = float(recent.get("p95_ms") or 0.0)

    min_requests = _env_int("ALERT_MIN_REQUESTS", 50)
    error_warn = _env_float("ALERT_ERROR_RATE_WARN", 0.10)
    error_crit = _env_float("ALERT_ERROR_RATE_CRIT", 0.20)
    server_error_warn = _env_float("ALERT_SERVER_ERROR_RATE_WARN", 0.02)
    server_error_crit = _env_float("ALERT_SERVER_ERROR_RATE_CRIT", 0.05)
    p95_warn_ms = _env_float("ALERT_P95_WARN_MS", 800.0)
    p95_crit_ms = _env_float("ALERT_P95_CRIT_MS", 2000.0)

    if recent_requests >= min_requests:
        if recent_error_rate >= error_crit:
            severity = "critical"
        elif recent_error_rate >= error_warn:
            severity = "warning"
        else:
            severity = "ok"
        if severity != "ok":
            alerts.append({
                "id": "api_error_rate",
                "severity": severity,
                "title": "High API error rate",
                "message": (
                    f"Recent error rate is {recent_error_rate:.2%} in the last {recent_requests} requests "
                    f"(warn {error_warn:.2%}, crit {error_crit:.2%})."
                ),
                "value": round(recent_error_rate, 4),
                "warn_threshold": error_warn,
                "critical_threshold": error_crit,
                "window_requests": recent_requests,
            })
            status = _merge_status(status, severity)

        if recent_server_error_rate >= server_error_crit:
            severity = "critical"
        elif recent_server_error_rate >= server_error_warn:
            severity = "warning"
        else:
            severity = "ok"
        if severity != "ok":
            alerts.append({
                "id": "api_server_error_rate",
                "severity": severity,
                "title": "High API 5xx rate",
                "message": (
                    f"Recent 5xx rate is {recent_server_error_rate:.2%} in the last {recent_requests} requests "
                    f"(warn {server_error_warn:.2%}, crit {server_error_crit:.2%})."
                ),
                "value": round(recent_server_error_rate, 4),
                "warn_threshold": server_error_warn,
                "critical_threshold": server_error_crit,
                "window_requests": recent_requests,
            })
            status = _merge_status(status, severity)

        if recent_p95_ms >= p95_crit_ms:
            severity = "critical"
        elif recent_p95_ms >= p95_warn_ms:
            severity = "warning"
        else:
            severity = "ok"
        if severity != "ok":
            alerts.append({
                "id": "api_p95_latency",
                "severity": severity,
                "title": "High API latency",
                "message": (
                    f"Recent p95 latency is {recent_p95_ms:.2f}ms "
                    f"(warn {p95_warn_ms:.2f}ms, crit {p95_crit_ms:.2f}ms)."
                ),
                "value": round(recent_p95_ms, 2),
                "warn_threshold": p95_warn_ms,
                "critical_threshold": p95_crit_ms,
                "window_requests": recent_requests,
            })
            status = _merge_status(status, severity)

    total_stations = int(station_summary.get("total") or 0)
    offline_stations = int(station_summary.get("offline") or 0)
    stale_online = int(station_summary.get("stale_online") or 0)
    station_min_total = _env_int("ALERT_STATIONS_MIN_TOTAL", 3)
    station_warn_ratio = _env_float("ALERT_STATION_OFFLINE_WARN_RATIO", 0.20)
    station_crit_ratio = _env_float("ALERT_STATION_OFFLINE_CRIT_RATIO", 0.50)

    if total_stations >= station_min_total:
        offline_ratio = (offline_stations / total_stations) if total_stations else 0.0
        if offline_ratio >= station_crit_ratio:
            severity = "critical"
        elif offline_ratio >= station_warn_ratio:
            severity = "warning"
        else:
            severity = "ok"
        if severity != "ok":
            alerts.append({
                "id": "stations_offline_ratio",
                "severity": severity,
                "title": "Stations offline",
                "message": (
                    f"{offline_stations}/{total_stations} stations are offline "
                    f"({offline_ratio:.2%}, warn {station_warn_ratio:.2%}, crit {station_crit_ratio:.2%})."
                ),
                "value": round(offline_ratio, 4),
                "warn_threshold": station_warn_ratio,
                "critical_threshold": station_crit_ratio,
            })
            status = _merge_status(status, severity)

    if stale_online > 0:
        severity = "warning"
        alerts.append({
            "id": "stations_stale_online",
            "severity": severity,
            "title": "Stale online stations",
            "message": (
                f"{stale_online} stations are marked online but have not reported within "
                f"{station_summary.get('grace_seconds', 90)} seconds."
            ),
            "value": stale_online,
        })
        status = _merge_status(status, severity)

    ws_agents = int(ws_stats.get("agents") or 0) if isinstance(ws_stats, dict) else 0
    if total_stations > 0 and ws_agents == 0:
        severity = "critical" if int(station_summary.get("online") or 0) > 0 else "warning"
        alerts.append({
            "id": "ws_agents_disconnected",
            "severity": severity,
            "title": "No active WS agent connections",
            "message": "WebSocket manager reports 0 connected agents.",
            "value": ws_agents,
        })
        status = _merge_status(status, severity)

    expect_scheduler = _env_bool("ALERT_EXPECT_SCHEDULER", True)
    scheduler_enabled = _env_bool("ENABLE_SCHEDULER", True)
    if expect_scheduler and scheduler_enabled and isinstance(scheduler_stats, dict):
        if scheduler_stats.get("running") is False:
            severity = "warning"
            alerts.append({
                "id": "scheduler_not_running",
                "severity": severity,
                "title": "Scheduler not running",
                "message": "Scheduler is disabled or stopped while ENABLE_SCHEDULER=true.",
                "value": 0,
            })
            status = _merge_status(status, severity)

    return {
        "status": status,
        "generated_at": now_iso,
        "alerts": alerts,
        "counts": {
            "critical": sum(1 for a in alerts if a.get("severity") == "critical"),
            "warning": sum(1 for a in alerts if a.get("severity") == "warning"),
            "total": len(alerts),
        },
    }


@router.get("/metrics", dependencies=[Depends(require_admin)])
def get_metrics(db=Depends(database.get_db)):
    """Runtime metrics + operational alert evaluation."""
    data = snapshot()
    stations = _collect_station_summary(db)
    ws_stats = _collect_ws_stats()
    scheduler_stats = _collect_scheduler_stats()

    data["stations"] = stations
    data["ws"] = ws_stats
    data["scheduler"] = scheduler_stats
    data["alerts"] = _build_operational_alerts(data, stations, ws_stats, scheduler_stats)
    return data


@router.get("/alerts", dependencies=[Depends(require_admin)])
def get_operational_alerts(db=Depends(database.get_db)):
    """Operational alerts for dashboards, probes, or external integrations."""
    metrics = snapshot()
    stations = _collect_station_summary(db)
    ws_stats = _collect_ws_stats()
    scheduler_stats = _collect_scheduler_stats()
    data = _build_operational_alerts(metrics, stations, ws_stats, scheduler_stats)
    data["context"] = {
        "recent": metrics.get("recent", {}),
        "stations": stations,
        "ws": ws_stats,
        "scheduler": scheduler_stats,
    }
    return data
