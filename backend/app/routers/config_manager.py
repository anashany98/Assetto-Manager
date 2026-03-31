from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import configparser
import json
import logging
from pathlib import Path
import re
import shutil
import threading
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import database, models
from ..paths import PRIVATE_STORAGE_DIR
from ..security.license import require_license_module
from .auth import require_admin


router = APIRouter(
    prefix="/configs",
    tags=["configs"],
    dependencies=[Depends(require_admin), Depends(require_license_module("editor"))],
)

logger = logging.getLogger("api.configs")

CONFIG_ROOT = PRIVATE_STORAGE_DIR / "configs"
DEPLOY_ROOT = PRIVATE_STORAGE_DIR / "deploy"
DEPLOY_JOBS_DIR = DEPLOY_ROOT / "jobs"
DEPLOY_BACKUP_DIR = DEPLOY_ROOT / "backups"
DEPLOY_AUDIT_FILE = DEPLOY_ROOT / "audit.log"

SETTING_STATION_GROUPS = "config_station_groups_v1"
SETTING_HARDWARE_PRESETS = "config_hardware_presets_v1"
SETTING_SAFE_MODE = "config_safe_mode"

# Map Category -> Target Filename in Assetto Corsa cfg folder
CATEGORY_MAP: dict[str, str] = {
    "controls": "controls.ini",
    "gameplay": "assetto_corsa.ini",
    "video": "video.ini",
    "audio": "audio.ini",
    "camera": "cameras.ini",
    "race": "race.ini",
    "weather": "weather.ini",
}

GROUP_NAME_RE = re.compile(r"^[a-zA-Z0-9 _-]{2,40}$")
INI_NAME_RE = re.compile(r"^[a-zA-Z0-9._ -]{1,120}\.ini$", re.IGNORECASE)
SECTION_KEY_RE = re.compile(r"^[A-Z0-9_]+$")

DEPLOY_TERMINAL_STATUSES = {"success", "failed", "rollback_failed", "preflight_failed"}

_deploy_jobs_lock = threading.Lock()
_deploy_jobs_cache: dict[str, dict[str, Any]] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _utcnow().isoformat()


def _ensure_directories() -> None:
    for cat in CATEGORY_MAP:
        (CONFIG_ROOT / cat).mkdir(parents=True, exist_ok=True)
    DEPLOY_JOBS_DIR.mkdir(parents=True, exist_ok=True)
    DEPLOY_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    DEPLOY_AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)


_ensure_directories()


class DeployRequest(BaseModel):
    deploy_map: Dict[str, str]
    station_ids: Optional[List[int]] = None
    group_names: Optional[List[str]] = None
    hardware_target: Optional[str] = Field(default=None, description="vr | flat")
    strict: bool = False


class RetryDeployRequest(BaseModel):
    station_ids: Optional[List[int]] = None
    strict: bool = False


class StationGroupPayload(BaseModel):
    name: str
    station_ids: List[int]


class HardwarePresetPayload(BaseModel):
    vr: Dict[str, str] = Field(default_factory=dict)
    flat: Dict[str, str] = Field(default_factory=dict)


class SafeModePayload(BaseModel):
    enabled: bool


def _get_setting_row(db: Session, key: str) -> Optional[models.GlobalSettings]:
    return db.query(models.GlobalSettings).filter(models.GlobalSettings.key == key).first()


def _get_setting_value(db: Session, key: str, default: str = "") -> str:
    row = _get_setting_row(db, key)
    return (row.value if row and row.value is not None else default) or default


def _set_setting_value(db: Session, key: str, value: str) -> None:
    row = _get_setting_row(db, key)
    if row:
        row.value = value
    else:
        row = models.GlobalSettings(key=key, value=value)
        db.add(row)
    db.commit()


def _get_setting_json(db: Session, key: str, default: Any) -> Any:
    raw = _get_setting_value(db, key, "")
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _set_setting_json(db: Session, key: str, value: Any) -> None:
    _set_setting_value(db, key, json.dumps(value, ensure_ascii=False))


def _get_safe_mode(db: Session) -> bool:
    raw = _get_setting_value(db, SETTING_SAFE_MODE, "true").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _sanitize_ini_filename(raw: str) -> str:
    filename = Path(str(raw or "")).name.strip()
    if not filename:
        raise ValueError("Empty filename")
    if not filename.lower().endswith(".ini"):
        filename = f"{filename}.ini"
    if not INI_NAME_RE.match(filename):
        raise ValueError(f"Invalid ini filename: {filename}")
    return filename


def _normalize_deploy_map(
    deploy_map: Dict[str, str],
    *,
    require_existing_files: bool = True,
    allow_empty: bool = False,
) -> Dict[str, str]:
    if not isinstance(deploy_map, dict):
        raise HTTPException(status_code=400, detail="deploy_map must be an object")
    if not deploy_map and not allow_empty:
        raise HTTPException(status_code=400, detail="deploy_map cannot be empty")

    normalized: Dict[str, str] = {}
    errors: List[str] = []

    for raw_category, raw_filename in deploy_map.items():
        category = str(raw_category or "").strip().lower()
        if category not in CATEGORY_MAP:
            errors.append(f"Invalid category: {raw_category}")
            continue
        try:
            filename = _sanitize_ini_filename(str(raw_filename or ""))
        except ValueError as exc:
            errors.append(str(exc))
            continue

        src_path = CONFIG_ROOT / category / filename
        if require_existing_files and not src_path.exists():
            errors.append(f"Profile not found: {category}/{filename}")
            continue

        normalized[category] = filename

    if errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid deploy map",
                "errors": errors,
            },
        )

    return normalized


def _normalize_group_name(name: str) -> str:
    safe = (name or "").strip()
    if not GROUP_NAME_RE.match(safe):
        raise HTTPException(status_code=400, detail="Invalid group name")
    return safe


def _normalize_station_ids(raw_ids: List[int]) -> List[int]:
    cleaned: List[int] = []
    seen: set[int] = set()
    for raw in raw_ids:
        try:
            station_id = int(raw)
        except Exception:
            continue
        if station_id <= 0 or station_id in seen:
            continue
        cleaned.append(station_id)
        seen.add(station_id)
    return cleaned


def _load_station_groups(db: Session) -> List[dict[str, Any]]:
    raw = _get_setting_json(db, SETTING_STATION_GROUPS, [])
    if not isinstance(raw, list):
        return []
    groups: List[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        station_ids = _normalize_station_ids(list(item.get("station_ids") or []))
        groups.append({"name": name, "station_ids": station_ids})
    groups.sort(key=lambda x: x["name"].lower())
    return groups


def _save_station_groups(db: Session, groups: List[dict[str, Any]]) -> None:
    payload = [{"name": g["name"], "station_ids": _normalize_station_ids(g["station_ids"])} for g in groups]
    _set_setting_json(db, SETTING_STATION_GROUPS, payload)


def _load_hardware_presets(db: Session) -> dict[str, Dict[str, str]]:
    raw = _get_setting_json(db, SETTING_HARDWARE_PRESETS, {"vr": {}, "flat": {}})
    if not isinstance(raw, dict):
        return {"vr": {}, "flat": {}}
    vr_map = raw.get("vr") if isinstance(raw.get("vr"), dict) else {}
    flat_map = raw.get("flat") if isinstance(raw.get("flat"), dict) else {}
    return {
        "vr": _normalize_deploy_map(vr_map, require_existing_files=False, allow_empty=True),
        "flat": _normalize_deploy_map(flat_map, require_existing_files=False, allow_empty=True),
    }


def _save_hardware_presets(db: Session, presets: dict[str, Dict[str, str]]) -> None:
    _set_setting_json(
        db,
        SETTING_HARDWARE_PRESETS,
        {
            "vr": presets.get("vr", {}),
            "flat": presets.get("flat", {}),
        },
    )


def _job_file(job_id: str) -> Path:
    return DEPLOY_JOBS_DIR / f"{job_id}.json"


def _persist_job(job: dict[str, Any]) -> None:
    path = _job_file(job["job_id"])
    tmp_path = path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def _recompute_job_summary(job: dict[str, Any]) -> None:
    station_results: dict[str, dict[str, Any]] = job.get("station_results", {})
    counters = {
        "total": len(station_results),
        "queued": 0,
        "running": 0,
        "success": 0,
        "failed": 0,
        "preflight_failed": 0,
    }
    for station_data in station_results.values():
        status = station_data.get("status")
        if status == "queued":
            counters["queued"] += 1
        elif status == "running":
            counters["running"] += 1
        elif status == "success":
            counters["success"] += 1
        elif status == "preflight_failed":
            counters["preflight_failed"] += 1
            counters["failed"] += 1
        elif status in {"failed", "rollback_failed"}:
            counters["failed"] += 1
        else:
            counters["failed"] += 1

    job["summary"] = counters

    status = job.get("status")
    if status in {"failed_preflight", "failed"}:
        return
    if counters["running"] > 0:
        job["status"] = "running"
        return
    if counters["queued"] > 0:
        job["status"] = "queued"
        return
    if counters["failed"] == 0:
        job["status"] = "completed"
    elif counters["success"] > 0:
        job["status"] = "completed_with_errors"
    else:
        job["status"] = "failed"


def _store_job(job: dict[str, Any]) -> None:
    with _deploy_jobs_lock:
        _recompute_job_summary(job)
        _deploy_jobs_cache[job["job_id"]] = job
        _persist_job(job)


def _load_job(job_id: str) -> Optional[dict[str, Any]]:
    with _deploy_jobs_lock:
        cached = _deploy_jobs_cache.get(job_id)
        if cached:
            return cached
        path = _job_file(job_id)
        if not path.exists():
            return None
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
        _deploy_jobs_cache[job_id] = loaded
        return loaded


def _mutate_job(job_id: str, mutator) -> Optional[dict[str, Any]]:
    with _deploy_jobs_lock:
        job = _deploy_jobs_cache.get(job_id)
        if not job:
            path = _job_file(job_id)
            if not path.exists():
                return None
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return None
            _deploy_jobs_cache[job_id] = job

        mutator(job)
        _recompute_job_summary(job)
        _persist_job(job)
        return job


def _list_jobs(limit: int) -> List[dict[str, Any]]:
    files = sorted(DEPLOY_JOBS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    jobs: List[dict[str, Any]] = []
    for path in files[:max(1, min(limit, 200))]:
        try:
            job = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        jobs.append(job)
    return jobs


def _append_audit_event(event: str, actor: str, payload: dict[str, Any]) -> None:
    try:
        record = {
            "timestamp": _iso_now(),
            "event": event,
            "actor": actor,
            "payload": payload,
        }
        with DEPLOY_AUDIT_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("Failed to append deploy audit event: %s", exc)


def _read_audit_events(limit: int) -> List[dict[str, Any]]:
    if not DEPLOY_AUDIT_FILE.exists():
        return []
    try:
        lines = DEPLOY_AUDIT_FILE.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []
    records: List[dict[str, Any]] = []
    for line in lines[-max(1, min(limit, 1000)):]:
        try:
            records.append(json.loads(line))
        except Exception:
            continue
    return list(reversed(records))


def _station_share_base(ip_address: str) -> Path:
    import re
    if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip_address):
        raise ValueError(f"Invalid IP address format: {ip_address}")
    return Path(f"\\\\{ip_address}\\AC_Config")


def _source_profile_path(category: str, filename: str) -> Path:
    return CONFIG_ROOT / category / filename


def _probe_write_access(target_base: Path) -> None:
    probe_path = target_base / f".ac_manager_probe_{uuid.uuid4().hex}.tmp"
    probe_path.write_text("probe", encoding="utf-8")
    probe_path.unlink(missing_ok=True)


def _snapshot_station(station: models.Station) -> dict[str, Any]:
    return {
        "station_id": station.id,
        "station_name": station.name,
        "ip_address": station.ip_address,
        "is_online": bool(station.is_online),
        "is_active": bool(station.is_active),
        "is_vr": bool(station.is_vr),
        "status": station.status,
    }


def _run_preflight_for_station(station: dict[str, Any], deploy_map: Dict[str, str]) -> dict[str, Any]:
    checks = {
        "is_active": bool(station.get("is_active")),
        "is_online": bool(station.get("is_online")),
        "has_ip": False,
        "share_reachable": False,
        "write_access": False,
        "source_profiles_ok": True,
    }
    errors: List[str] = []
    warnings: List[str] = []

    station_id = int(station["station_id"])
    station_name = str(station["station_name"])
    ip_address = (station.get("ip_address") or "").strip()

    if not checks["is_active"]:
        errors.append("Station is inactive/archived")
    if not checks["is_online"]:
        warnings.append("Station reported offline (deploy may still work via SMB)")

    if not ip_address:
        errors.append("Station has no IP address configured")
    else:
        checks["has_ip"] = True
        target_base = _station_share_base(ip_address)
        if target_base.exists():
            checks["share_reachable"] = True
            try:
                _probe_write_access(target_base)
                checks["write_access"] = True
            except Exception as exc:
                errors.append(f"Cannot write to {target_base}: {exc}")

            try:
                usage = shutil.disk_usage(str(target_base))
                total_src_size = 0
                for category, profile_name in deploy_map.items():
                    src = _source_profile_path(category, profile_name)
                    if src.exists():
                        total_src_size += src.stat().st_size
                if usage.free < max(total_src_size * 2, 10 * 1024 * 1024):
                    warnings.append("Low free space on station share")
            except Exception:
                warnings.append("Could not verify free space on station share")
        else:
            errors.append(f"Share not reachable: {target_base}")

    missing_sources: List[str] = []
    for category, profile_name in deploy_map.items():
        src = _source_profile_path(category, profile_name)
        if not src.exists():
            missing_sources.append(f"{category}/{profile_name}")
    if missing_sources:
        checks["source_profiles_ok"] = False
        errors.append("Missing source profiles: " + ", ".join(missing_sources))

    return {
        "station_id": station_id,
        "station_name": station_name,
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
    }


def _resolve_target_stations(request: DeployRequest, db: Session) -> List[models.Station]:
    hardware_target = (request.hardware_target or "").strip().lower()
    if hardware_target and hardware_target not in {"vr", "flat"}:
        raise HTTPException(status_code=400, detail="hardware_target must be 'vr' or 'flat'")

    selected_ids: set[int] = set()

    if request.station_ids:
        selected_ids.update(_normalize_station_ids(request.station_ids))

    if request.group_names:
        group_names = {str(name or "").strip() for name in request.group_names if str(name or "").strip()}
        groups = _load_station_groups(db)
        group_map = {g["name"]: g["station_ids"] for g in groups}
        missing_groups = sorted([name for name in group_names if name not in group_map])
        if missing_groups:
            raise HTTPException(
                status_code=400,
                detail={"message": "Unknown station groups", "groups": missing_groups},
            )
        for name in group_names:
            selected_ids.update(group_map[name])

    if selected_ids:
        stations = db.query(models.Station).filter(models.Station.id.in_(selected_ids)).all()
    else:
        stations = db.query(models.Station).filter(models.Station.is_active == True).all()  # noqa: E712

    if hardware_target == "vr":
        stations = [s for s in stations if bool(s.is_vr)]
    elif hardware_target == "flat":
        stations = [s for s in stations if not bool(s.is_vr)]

    stations.sort(key=lambda s: s.id)
    return stations


def _prepare_job_payload(
    request: DeployRequest,
    stations: List[models.Station],
    deploy_map: Dict[str, str],
    preflight: List[dict[str, Any]],
    requested_by: str,
    *,
    source_job_id: Optional[str] = None,
) -> dict[str, Any]:
    station_results: dict[str, dict[str, Any]] = {}
    preflight_by_id = {int(item["station_id"]): item for item in preflight}
    for station in stations:
        pf = preflight_by_id.get(station.id, {"ok": False, "errors": ["Missing preflight"], "warnings": [], "checks": {}})
        station_results[str(station.id)] = {
            "station_id": station.id,
            "station_name": station.name,
            "status": "queued" if pf.get("ok") else "preflight_failed",
            "preflight": pf,
            "started_at": None,
            "finished_at": None,
            "error": None,
            "warnings": [],
            "applied": [],
            "rollback_applied": False,
            "rollback_errors": [],
        }

    job = {
        "job_id": uuid.uuid4().hex,
        "status": "queued",
        "created_at": _iso_now(),
        "started_at": None,
        "finished_at": None,
        "requested_by": requested_by,
        "source_job_id": source_job_id,
        "request": {
            "deploy_map": deploy_map,
            "station_ids": request.station_ids,
            "group_names": request.group_names,
            "hardware_target": request.hardware_target,
            "strict": request.strict,
        },
        "station_results": station_results,
        "summary": {},
    }
    _recompute_job_summary(job)
    return job


def _deploy_station_with_rollback(
    station: dict[str, Any],
    deploy_map: Dict[str, str],
    job_id: str,
) -> dict[str, Any]:
    station_id = int(station["station_id"])
    station_name = str(station["station_name"])
    ip_address = str(station.get("ip_address") or "")
    result = {
        "station_id": station_id,
        "station_name": station_name,
        "status": "failed",
        "started_at": _iso_now(),
        "finished_at": None,
        "error": None,
        "warnings": [],
        "applied": [],
        "rollback_applied": False,
        "rollback_errors": [],
    }

    target_base = _station_share_base(ip_address)
    backup_root = DEPLOY_BACKUP_DIR / job_id / f"station_{station_id}"
    backup_root.mkdir(parents=True, exist_ok=True)

    applied: List[dict[str, Any]] = []
    try:
        if not target_base.exists():
            raise RuntimeError(f"Share not reachable: {target_base}")
        _probe_write_access(target_base)

        for category, profile_name in deploy_map.items():
            src = _source_profile_path(category, profile_name)
            if not src.exists():
                raise RuntimeError(f"Source profile missing during deploy: {category}/{profile_name}")

            target_filename = CATEGORY_MAP[category]
            dst = target_base / target_filename

            backup_file: Optional[Path] = None
            if dst.exists():
                backup_file = backup_root / f"{category}__{target_filename}.bak"
                shutil.copy2(dst, backup_file)

            shutil.copy2(src, dst)
            applied.append(
                {
                    "category": category,
                    "profile": profile_name,
                    "source": str(src),
                    "target": str(dst),
                    "backup": str(backup_file) if backup_file else None,
                }
            )

        result["status"] = "success"
        result["applied"] = applied
        return result
    except Exception as exc:
        result["error"] = str(exc)
        result["applied"] = applied

        rollback_errors: List[str] = []
        for entry in reversed(applied):
            target_path = Path(entry["target"])
            backup_path = Path(entry["backup"]) if entry.get("backup") else None
            try:
                if backup_path and backup_path.exists():
                    shutil.copy2(backup_path, target_path)
                else:
                    target_path.unlink(missing_ok=True)
            except Exception as rollback_exc:
                rollback_errors.append(str(rollback_exc))

        result["rollback_applied"] = bool(applied)
        if rollback_errors:
            result["status"] = "rollback_failed"
            result["rollback_errors"] = rollback_errors
        else:
            result["status"] = "failed"

        return result
    finally:
        result["finished_at"] = _iso_now()


def _run_deploy_job(
    job_id: str,
    station_snapshots: List[dict[str, Any]],
    deploy_map: Dict[str, str],
    requested_by: str,
) -> None:
    started_at = _iso_now()
    _mutate_job(job_id, lambda job: job.update({"status": "running", "started_at": started_at}))
    _append_audit_event(
        "deploy_started",
        requested_by,
        {"job_id": job_id, "stations": [s["station_id"] for s in station_snapshots]},
    )

    max_workers = max(1, min(5, len(station_snapshots)))
    futures = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for station in station_snapshots:
            station_id = int(station["station_id"])

            def _mark_running(job, sid=station_id):
                station_state = job["station_results"].get(str(sid))
                if station_state:
                    station_state["status"] = "running"
                    station_state["started_at"] = _iso_now()

            _mutate_job(job_id, _mark_running)
            futures[executor.submit(_deploy_station_with_rollback, station, deploy_map, job_id)] = station

        for future in as_completed(futures):
            station = futures[future]
            station_id = int(station["station_id"])
            try:
                station_result = future.result()
            except Exception as exc:
                station_result = {
                    "station_id": station_id,
                    "station_name": station["station_name"],
                    "status": "failed",
                    "started_at": None,
                    "finished_at": _iso_now(),
                    "error": f"Unhandled deploy error: {exc}",
                    "warnings": [],
                    "applied": [],
                    "rollback_applied": False,
                    "rollback_errors": [],
                }

            def _apply_station_result(job, sid=station_id, result=station_result):
                station_state = job["station_results"].get(str(sid))
                if not station_state:
                    return
                station_state.update(
                    {
                        "status": result.get("status"),
                        "started_at": result.get("started_at") or station_state.get("started_at"),
                        "finished_at": result.get("finished_at") or _iso_now(),
                        "error": result.get("error"),
                        "warnings": result.get("warnings") or [],
                        "applied": result.get("applied") or [],
                        "rollback_applied": bool(result.get("rollback_applied")),
                        "rollback_errors": result.get("rollback_errors") or [],
                    }
                )

            _mutate_job(job_id, _apply_station_result)
            _append_audit_event(
                "station_deploy_result",
                requested_by,
                {
                    "job_id": job_id,
                    "station_id": station_id,
                    "station_name": station.get("station_name"),
                    "status": station_result.get("status"),
                    "error": station_result.get("error"),
                    "rollback_applied": station_result.get("rollback_applied"),
                },
            )

    def _finalize(job):
        job["finished_at"] = _iso_now()

    final_job = _mutate_job(job_id, _finalize)
    if final_job:
        _append_audit_event(
            "deploy_finished",
            requested_by,
            {
                "job_id": job_id,
                "status": final_job.get("status"),
                "summary": final_job.get("summary"),
            },
        )


def _queue_deploy_job(
    request: DeployRequest,
    background_tasks: BackgroundTasks,
    db: Session,
    requested_by: str,
    *,
    source_job_id: Optional[str] = None,
) -> dict[str, Any]:
    deploy_map = _normalize_deploy_map(request.deploy_map, require_existing_files=True, allow_empty=False)
    stations = _resolve_target_stations(request, db)
    if not stations:
        raise HTTPException(status_code=404, detail="No target stations found")

    snapshots = [_snapshot_station(s) for s in stations]
    preflight = [_run_preflight_for_station(snap, deploy_map) for snap in snapshots]
    runnable_ids = {int(item["station_id"]) for item in preflight if item.get("ok")}
    failed_preflight = [item for item in preflight if not item.get("ok")]

    job = _prepare_job_payload(
        request,
        stations,
        deploy_map,
        preflight,
        requested_by,
        source_job_id=source_job_id,
    )
    _store_job(job)

    _append_audit_event(
        "deploy_requested",
        requested_by,
        {
            "job_id": job["job_id"],
            "source_job_id": source_job_id,
            "deploy_map": deploy_map,
            "station_count": len(stations),
            "failed_preflight": [item["station_id"] for item in failed_preflight],
        },
    )

    if request.strict and failed_preflight:
        _mutate_job(
            job["job_id"],
            lambda j: j.update({"status": "failed_preflight", "finished_at": _iso_now()}),
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Strict preflight failed",
                "job_id": job["job_id"],
                "preflight": preflight,
            },
        )

    runnable_snapshots = [snap for snap in snapshots if int(snap["station_id"]) in runnable_ids]
    if not runnable_snapshots:
        _mutate_job(
            job["job_id"],
            lambda j: j.update({"status": "failed_preflight", "finished_at": _iso_now()}),
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Preflight failed for all target stations",
                "job_id": job["job_id"],
                "preflight": preflight,
            },
        )

    background_tasks.add_task(_run_deploy_job, job["job_id"], runnable_snapshots, deploy_map, requested_by)

    station_names = [snap["station_name"] for snap in runnable_snapshots]
    return {
        "message": f"Profile deployment queued to: {', '.join(station_names)}",
        "count": len(runnable_snapshots),
        "stations": station_names,
        "job_id": job["job_id"],
        "status": "queued",
        "summary": job.get("summary", {}),
        "preflight": preflight,
    }


# --------------------------
# INI Validation
# --------------------------
CATEGORY_ALLOWED_SECTIONS: dict[str, set[str]] = {
    "controls": {"ADVANCED", "STEER", "KEYBOARD"},
    "gameplay": {"ASSISTS", "REALISM"},
    "video": {"VIDEO", "POST_PROCESS", "MIRROR", "CUBEMAP", "ASSETTOCORSA"},
    "audio": {"LEVELS"},
    "camera": {"COCKPIT", "CHASE", "HOOD", "GENERAL"},
    "race": {"RACE", "BOT", "AI"},
    "weather": {"WEATHER", "DYNAMIC_TIME", "TIME", "LIGHTING"},
}

RANGE_RULES: dict[str, Tuple[float, float]] = {
    "STEER.FF_GAIN": (0.0, 2.0),
    "STEER.FILTER_FF": (0.0, 1.0),
    "STEER.LOCK": (180, 1080),
    "STEER.STEER_GAMMA": (0.5, 2.0),
    "STEER.STEER_FILTER": (0.0, 1.0),
    "STEER.SPEED_SENSITIVITY": (0.0, 1.0),
    "STEER.STEER_DEADZONE": (0.0, 0.2),
    "ADVANCED.DAMPER_GAIN": (0.0, 1.0),
    "ADVANCED.MIN_FF": (0.0, 0.3),
    "ADVANCED.KERB_EFFECT": (0.0, 1.5),
    "ADVANCED.ROAD_EFFECT": (0.0, 1.5),
    "ADVANCED.SLIP_EFFECT": (0.0, 1.5),
    "ADVANCED.ABS_EFFECT": (0.0, 1.0),
    "KEYBOARD.STEER_SPEED": (0.5, 5.0),
    "KEYBOARD.GAS_SPEED": (0.5, 5.0),
    "KEYBOARD.BRAKE_SPEED": (0.5, 5.0),
    "ASSISTS.STABILITY_CONTROL": (0, 100),
    "REALISM.DAMAGE": (0, 100),
    "REALISM.FUEL_RATE": (0, 3),
    "REALISM.TYRE_WEAR": (0, 3),
    "VIDEO.WIDTH": (640, 7680),
    "VIDEO.HEIGHT": (480, 4320),
    "VIDEO.FPS_CAP_MS": (0, 1000),
    "VIDEO.RENDER_SCALE": (50, 200),
    "VIDEO.REFRESH": (30, 360),
    "VIDEO.AASAMPLES": (0, 16),
    "VIDEO.ANISOTROPIC": (0, 16),
    "VIDEO.SHADOW_MAP_SIZE": (0, 8192),
    "VIDEO.MOTION_BLUR": (0, 10),
    "VIDEO.SMOKE": (0, 5),
    "ASSETTOCORSA.WORLD_DETAIL": (0, 5),
    "CUBEMAP.SIZE": (0, 4096),
    "CUBEMAP.FACES_PER_FRAME": (1, 6),
    "MIRROR.SIZE": (128, 4096),
    "POST_PROCESS.QUALITY": (0, 5),
    "POST_PROCESS.GLARE": (0, 5),
    "POST_PROCESS.DOF": (0, 5),
    "LEVELS.MASTER": (0.0, 1.0),
    "LEVELS.ENGINE": (0.0, 1.0),
    "LEVELS.TYRES": (0.0, 1.0),
    "LEVELS.SURFACES": (0.0, 1.0),
    "LEVELS.WIND": (0.0, 1.0),
    "LEVELS.OPPONENTS": (0.0, 1.0),
    "LEVELS.DIRT": (0.0, 1.0),
    "COCKPIT.FOV": (30, 100),
    "COCKPIT.DISTANCE": (0.0, 1.0),
    "COCKPIT.HEIGHT": (-0.5, 0.5),
    "COCKPIT.EXPOSURE": (-0.5, 0.5),
    "CHASE.FOV": (20, 80),
    "CHASE.DISTANCE": (2.0, 15.0),
    "CHASE.HEIGHT": (0.5, 5.0),
    "HOOD.FOV": (30, 100),
    "HOOD.HEIGHT": (0.0, 2.0),
    "RACE.AI_OPPONENTS": (0, 30),
    "RACE.LAPS": (1, 100),
    "RACE.PRACTICE_TIME": (0, 60),
    "RACE.QUALIFY_TIME": (0, 30),
    "BOT.LEVEL": (70, 100),
    "BOT.AGGRESSION": (0, 100),
    "BOT.STRENGTH_VARIATION": (0, 30),
    "AI.LEVEL": (70, 100),
    "AI.AGGRESSION": (0, 100),
    "AI.STRENGTH_VARIATION": (0, 30),
    "WEATHER.AMBIENT": (-10, 45),
    "WEATHER.ROAD": (0, 60),
    "WEATHER.WIND_SPEED": (0, 50),
    "WEATHER.WIND_DIRECTION": (0, 359),
    "WEATHER.TRACK_GRIP": (80, 100),
    "DYNAMIC_TIME.START_TIME": (0, 23),
    "DYNAMIC_TIME.TIME_MULT": (0, 60),
    "TIME.START_TIME": (0, 23),
    "TIME.TIME_MULT": (0, 60),
    "LIGHTING.SATURATION": (0, 150),
    "LIGHTING.BRIGHTNESS": (50, 150),
}

INT_ONLY_KEYS = {
    "STEER.LOCK",
    "ASSISTS.STABILITY_CONTROL",
    "REALISM.DAMAGE",
    "REALISM.FUEL_RATE",
    "REALISM.TYRE_WEAR",
    "VIDEO.WIDTH",
    "VIDEO.HEIGHT",
    "VIDEO.FPS_CAP_MS",
    "VIDEO.RENDER_SCALE",
    "VIDEO.REFRESH",
    "VIDEO.AASAMPLES",
    "VIDEO.ANISOTROPIC",
    "VIDEO.SHADOW_MAP_SIZE",
    "VIDEO.MOTION_BLUR",
    "VIDEO.SMOKE",
    "ASSETTOCORSA.WORLD_DETAIL",
    "CUBEMAP.SIZE",
    "CUBEMAP.FACES_PER_FRAME",
    "MIRROR.SIZE",
    "POST_PROCESS.QUALITY",
    "POST_PROCESS.GLARE",
    "POST_PROCESS.DOF",
    "RACE.AI_OPPONENTS",
    "RACE.LAPS",
    "RACE.PRACTICE_TIME",
    "RACE.QUALIFY_TIME",
    "BOT.LEVEL",
    "BOT.AGGRESSION",
    "BOT.STRENGTH_VARIATION",
    "AI.LEVEL",
    "AI.AGGRESSION",
    "AI.STRENGTH_VARIATION",
    "WEATHER.AMBIENT",
    "WEATHER.ROAD",
    "WEATHER.WIND_SPEED",
    "WEATHER.WIND_DIRECTION",
    "WEATHER.TRACK_GRIP",
    "DYNAMIC_TIME.START_TIME",
    "DYNAMIC_TIME.TIME_MULT",
    "TIME.START_TIME",
    "TIME.TIME_MULT",
    "LIGHTING.SATURATION",
    "LIGHTING.BRIGHTNESS",
}

BOOL_KEYS = {
    "ADVANCED.ENHANCED_UNDERSTEER",
    "ASSISTS.AUTO_CLUTCH",
    "ASSISTS.AUTO_BLIP",
    "ASSISTS.AUTOSTEER",
    "ASSISTS.IDEAL_LINE",
    "ASSISTS.AUTO_GEAR",
    "REALISM.VISUAL_DAMAGE",
    "REALISM.TYRE_BLANKETS",
    "REALISM.PENALTIES",
    "VIDEO.FULLSCREEN",
    "VIDEO.VSYNC",
    "VIDEO.RENDER_SMOKE_IN_MIRROR",
    "MIRROR.HQ",
    "POST_PROCESS.FXAA",
    "POST_PROCESS.ENABLED",
    "POST_PROCESS.HEAT_SHIMMER",
    "POST_PROCESS.RAYS_OF_GOD",
    "RACE.ROLLING_START",
    "RACE.JUMP_START",
    "BOT.UNIQUE",
    "AI.UNIQUE",
    "DYNAMIC_TIME.ENABLED",
    "TIME.ENABLED",
    "GENERAL.HIDE_STEER",
    "GENERAL.HIDE_ARMS",
    "GENERAL.LOCK_STEER",
}

ENUM_RULES: dict[str, set[str]] = {
    "ASSISTS.ABS": {"0", "1", "2"},
    "ASSISTS.TRACTION_CONTROL": {"0", "1", "2"},
    "VIDEO.CAMERA_MODE": {"DEFAULT", "OCULUS", "OPENVR", "TRIPLE"},
    "WEATHER.TRACK_STATE": {"green", "fast", "optimum", "dusty", "old"},
}

SAFE_MODE_MAX_RULES: dict[str, float] = {
    "RACE.AI_OPPONENTS": 20,
    "VIDEO.RENDER_SCALE": 130,
    "VIDEO.SHADOW_MAP_SIZE": 4096,
    "REALISM.DAMAGE": 75,
    "REALISM.FUEL_RATE": 2,
    "REALISM.TYRE_WEAR": 2,
}

SAFE_MODE_MIN_RULES: dict[str, float] = {
    "WEATHER.TRACK_GRIP": 90,
}

SAFE_MODE_WARN_KEYS = {
    "REALISM.DAMAGE",
    "REALISM.FUEL_RATE",
    "REALISM.TYRE_WEAR",
    "RACE.AI_OPPONENTS",
    "VIDEO.RENDER_SCALE",
}


def _to_scalar_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value).strip()


def _validate_profile_sections(
    category: str,
    sections: Dict[str, Dict[str, Any]],
    *,
    safe_mode: bool,
) -> tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []
    safe_category = (category or "").strip().lower()

    if safe_category not in CATEGORY_MAP:
        return (["Invalid category"], warnings)
    if not isinstance(sections, dict) or not sections:
        return (["No sections provided"], warnings)

    allowed_sections = CATEGORY_ALLOWED_SECTIONS.get(safe_category, set())
    flattened: Dict[str, str] = {}

    for section_name, values in sections.items():
        if not SECTION_KEY_RE.match(str(section_name or "")):
            errors.append(f"Invalid section name: {section_name}")
            continue
        if section_name not in allowed_sections:
            warnings.append(f"Section '{section_name}' is unusual for category '{safe_category}'")
        if not isinstance(values, dict):
            errors.append(f"Section '{section_name}' must be an object")
            continue

        for key, raw_value in values.items():
            if not SECTION_KEY_RE.match(str(key or "")):
                errors.append(f"Invalid key name: {section_name}.{key}")
                continue
            full_key = f"{section_name}.{key}"
            value = _to_scalar_str(raw_value)
            flattened[full_key] = value

            if full_key in ENUM_RULES:
                if value not in ENUM_RULES[full_key]:
                    errors.append(
                        f"{full_key} must be one of: {', '.join(sorted(ENUM_RULES[full_key]))} (got '{value}')"
                    )
                continue

            if full_key in BOOL_KEYS:
                if value not in {"0", "1"}:
                    errors.append(f"{full_key} must be 0 or 1 (got '{value}')")
                continue

            if full_key in RANGE_RULES:
                try:
                    number_value = float(value)
                except Exception:
                    errors.append(f"{full_key} must be numeric (got '{value}')")
                    continue
                min_value, max_value = RANGE_RULES[full_key]
                if number_value < min_value or number_value > max_value:
                    errors.append(f"{full_key} must be between {min_value} and {max_value} (got {number_value})")
                    continue
                if full_key in INT_ONLY_KEYS and not number_value.is_integer():
                    errors.append(f"{full_key} must be an integer (got {number_value})")
                continue

            # Unknown keys are warnings (forward-compatible with new AC versions).
            warnings.append(f"Unknown key for validation: {full_key}")

    if safe_mode:
        for full_key, max_allowed in SAFE_MODE_MAX_RULES.items():
            if full_key not in flattened:
                continue
            try:
                value = float(flattened[full_key])
            except Exception:
                continue
            if value > max_allowed:
                errors.append(f"Safe mode: {full_key} cannot exceed {max_allowed} (got {value})")

        for full_key, min_allowed in SAFE_MODE_MIN_RULES.items():
            if full_key not in flattened:
                continue
            try:
                value = float(flattened[full_key])
            except Exception:
                continue
            if value < min_allowed:
                errors.append(f"Safe mode: {full_key} cannot be below {min_allowed} (got {value})")

        for full_key in SAFE_MODE_WARN_KEYS:
            if full_key in flattened:
                warnings.append(f"Safe mode caution: {full_key} modified to {flattened[full_key]}")

        assists_abs = flattened.get("ASSISTS.ABS")
        assists_tc = flattened.get("ASSISTS.TRACTION_CONTROL")
        assists_auto = flattened.get("ASSISTS.AUTO_GEAR")
        if assists_abs == "0" and assists_tc == "0" and assists_auto == "0":
            warnings.append("Safe mode caution: ABS + TC + AUTO_GEAR are all disabled")

    return (errors, warnings)


# --------------------------
# Profile CRUD
# --------------------------
@router.get("/profiles", response_model=Dict[str, List[str]])
def list_profiles() -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = {}
    for cat in CATEGORY_MAP:
        path = CONFIG_ROOT / cat
        files = sorted([f.name for f in path.glob("*.ini")])
        result[cat] = files
    return result


@router.get("/profile/{category}/{filename}")
def get_profile_content(category: str, filename: str):
    safe_category = (category or "").strip().lower()
    if safe_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")

    safe_filename = Path(filename).name
    fpath = CONFIG_ROOT / safe_category / safe_filename
    if not fpath.exists():
        return {"content": ""}

    try:
        content = fpath.read_text(encoding="utf-8", errors="ignore")
        return {"content": content}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/profile/{category}/{filename}")
def save_profile_content(category: str, filename: str, content: str = Body(...)):
    safe_category = (category or "").strip().lower()
    if safe_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")

    safe_filename = _sanitize_ini_filename(filename)
    fpath = CONFIG_ROOT / safe_category / safe_filename
    fpath.parent.mkdir(parents=True, exist_ok=True)

    try:
        fpath.write_text(content or "", encoding="utf-8")
        return {"status": "saved", "filename": safe_filename}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/profile/{category}/{filename}")
def delete_profile(category: str, filename: str):
    safe_category = (category or "").strip().lower()
    if safe_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")

    safe_filename = Path(filename).name
    fpath = CONFIG_ROOT / safe_category / safe_filename
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        fpath.unlink()
        return {"status": "deleted", "filename": safe_filename}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/profile/{category}/{filename}/parsed")
def get_profile_content_parsed(category: str, filename: str):
    safe_category = (category or "").strip().lower()
    if safe_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")

    safe_filename = Path(filename).name
    fpath = CONFIG_ROOT / safe_category / safe_filename
    if not fpath.exists():
        return {"sections": {}}

    try:
        parser = configparser.ConfigParser(strict=False)
        parser.optionxform = str
        parser.read(fpath, encoding="utf-8")
        sections = {section: dict(parser.items(section)) for section in parser.sections()}
        return {"sections": sections}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/validate/{category}")
def validate_profile_sections(category: str, data: Dict[str, Any] = Body(...), db: Session = Depends(database.get_db)):
    safe_category = (category or "").strip().lower()
    if safe_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")

    payload = data or {}
    sections = payload.get("sections")
    if sections is None and isinstance(payload.get("data"), dict):
        inner = payload["data"]
        sections = inner.get("sections", inner)
    if sections is None and payload and all(isinstance(v, dict) for v in payload.values()):
        sections = payload
    if not isinstance(sections, dict):
        raise HTTPException(status_code=400, detail="No sections provided")

    safe_mode = _get_safe_mode(db)
    errors, warnings = _validate_profile_sections(safe_category, sections, safe_mode=safe_mode)
    return {
        "category": safe_category,
        "safe_mode": safe_mode,
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


@router.post("/profile/{category}/{filename}/parsed")
def save_profile_content_parsed(
    category: str,
    filename: str,
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(database.get_db),
):
    safe_category = (category or "").strip().lower()
    if safe_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")

    safe_filename = _sanitize_ini_filename(filename)
    fpath = CONFIG_ROOT / safe_category / safe_filename
    fpath.parent.mkdir(parents=True, exist_ok=True)

    payload = data or {}
    sections = payload.get("sections")
    if sections is None and isinstance(payload.get("data"), dict):
        inner = payload["data"]
        sections = inner.get("sections", inner)
    if sections is None and payload and all(isinstance(v, dict) for v in payload.values()):
        sections = payload
    if not sections:
        raise HTTPException(status_code=400, detail="No sections provided")

    safe_mode = _get_safe_mode(db)
    errors, warnings = _validate_profile_sections(safe_category, sections, safe_mode=safe_mode)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Validation failed",
                "errors": errors,
                "warnings": warnings,
                "safe_mode": safe_mode,
            },
        )

    try:
        parser = configparser.ConfigParser(strict=False)
        parser.optionxform = str
        for section_name, items in sections.items():
            parser.add_section(section_name)
            for key, value in (items or {}).items():
                parser.set(section_name, key, _to_scalar_str(value))
        with fpath.open("w", encoding="utf-8") as fh:
            parser.write(fh)
        return {"status": "saved", "filename": safe_filename, "warnings": warnings, "safe_mode": safe_mode}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# --------------------------
# Station groups & presets
# --------------------------
@router.get("/groups")
def get_station_groups(db: Session = Depends(database.get_db)):
    return {"groups": _load_station_groups(db)}


@router.post("/groups")
def upsert_station_group(payload: StationGroupPayload, db: Session = Depends(database.get_db)):
    name = _normalize_group_name(payload.name)
    station_ids = _normalize_station_ids(payload.station_ids)
    if not station_ids:
        raise HTTPException(status_code=400, detail="Group requires at least one station")

    existing_station_ids = {
        station.id for station in db.query(models.Station).filter(models.Station.id.in_(station_ids)).all()
    }
    station_ids = [sid for sid in station_ids if sid in existing_station_ids]
    if not station_ids:
        raise HTTPException(status_code=400, detail="No valid stations for group")

    groups = _load_station_groups(db)
    replaced = False
    for item in groups:
        if item["name"] == name:
            item["station_ids"] = station_ids
            replaced = True
            break
    if not replaced:
        groups.append({"name": name, "station_ids": station_ids})
    groups.sort(key=lambda g: g["name"].lower())
    _save_station_groups(db, groups)
    return {"status": "saved", "groups": groups}


@router.delete("/groups/{name}")
def delete_station_group(name: str, db: Session = Depends(database.get_db)):
    target = str(name or "").strip()
    groups = _load_station_groups(db)
    next_groups = [item for item in groups if item["name"] != target]
    if len(next_groups) == len(groups):
        raise HTTPException(status_code=404, detail="Group not found")
    _save_station_groups(db, next_groups)
    return {"status": "deleted", "name": target, "groups": next_groups}


@router.get("/hardware-presets")
def get_hardware_presets(db: Session = Depends(database.get_db)):
    return _load_hardware_presets(db)


@router.post("/hardware-presets")
def save_hardware_presets(payload: HardwarePresetPayload, db: Session = Depends(database.get_db)):
    presets = {
        "vr": _normalize_deploy_map(payload.vr, require_existing_files=True, allow_empty=True),
        "flat": _normalize_deploy_map(payload.flat, require_existing_files=True, allow_empty=True),
    }
    _save_hardware_presets(db, presets)
    return {"status": "saved", **presets}


@router.get("/safe-mode")
def get_safe_mode(db: Session = Depends(database.get_db)):
    return {"enabled": _get_safe_mode(db)}


@router.post("/safe-mode")
def set_safe_mode(payload: SafeModePayload, db: Session = Depends(database.get_db)):
    _set_setting_value(db, SETTING_SAFE_MODE, "true" if payload.enabled else "false")
    return {"status": "saved", "enabled": payload.enabled}


# --------------------------
# Deploy endpoints
# --------------------------
@router.post("/deploy/preflight")
def deploy_preflight(request: DeployRequest, db: Session = Depends(database.get_db)):
    deploy_map = _normalize_deploy_map(request.deploy_map, require_existing_files=True, allow_empty=False)
    stations = _resolve_target_stations(request, db)
    if not stations:
        raise HTTPException(status_code=404, detail="No target stations found")
    snapshots = [_snapshot_station(station) for station in stations]
    preflight = [_run_preflight_for_station(snapshot, deploy_map) for snapshot in snapshots]
    ok_count = sum(1 for item in preflight if item["ok"])
    return {
        "ok": ok_count > 0,
        "deploy_map": deploy_map,
        "total_stations": len(preflight),
        "runnable_stations": ok_count,
        "failed_stations": len(preflight) - ok_count,
        "preflight": preflight,
    }


@router.post("/deploy", response_model=dict)
def deploy_profiles(
    background_tasks: BackgroundTasks,
    request: DeployRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_admin),
):
    return _queue_deploy_job(request, background_tasks, db, current_user.username)


@router.get("/deploy/jobs", response_model=list[dict])
def list_deploy_jobs(limit: int = Query(20, ge=1, le=200)):
    jobs = _list_jobs(limit)
    response: List[dict[str, Any]] = []
    for job in jobs:
        response.append(
            {
                "job_id": job.get("job_id"),
                "status": job.get("status"),
                "created_at": job.get("created_at"),
                "started_at": job.get("started_at"),
                "finished_at": job.get("finished_at"),
                "requested_by": job.get("requested_by"),
                "source_job_id": job.get("source_job_id"),
                "request": job.get("request"),
                "summary": job.get("summary", {}),
            }
        )
    return response


@router.get("/deploy/jobs/{job_id}", response_model=dict)
def get_deploy_job(job_id: str):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Deploy job not found")
    return job


@router.post("/deploy/jobs/{job_id}/retry", response_model=dict)
def retry_deploy_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    payload: RetryDeployRequest = Body(default=RetryDeployRequest()),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_admin),
):
    source = _load_job(job_id)
    if not source:
        raise HTTPException(status_code=404, detail="Deploy job not found")

    source_map = source.get("request", {}).get("deploy_map")
    if not isinstance(source_map, dict) or not source_map:
        raise HTTPException(status_code=400, detail="Source job has no deploy map")

    failed_ids = []
    for station_data in (source.get("station_results") or {}).values():
        if station_data.get("status") in {"failed", "rollback_failed", "preflight_failed"}:
            failed_ids.append(int(station_data["station_id"]))

    target_ids = _normalize_station_ids(payload.station_ids or failed_ids)
    if not target_ids:
        raise HTTPException(status_code=400, detail="No failed stations to retry")

    request = DeployRequest(
        deploy_map=source_map,
        station_ids=target_ids,
        strict=payload.strict,
    )
    _append_audit_event(
        "deploy_retry_requested",
        current_user.username,
        {"source_job_id": job_id, "station_ids": target_ids},
    )
    return _queue_deploy_job(request, background_tasks, db, current_user.username, source_job_id=job_id)


@router.get("/deploy/audit", response_model=list[dict])
def get_deploy_audit(limit: int = Query(100, ge=1, le=1000)):
    return _read_audit_events(limit)


@router.post("/deploy/{station_id}", response_model=dict)
def deploy_profiles_to_station(
    station_id: int,
    background_tasks: BackgroundTasks,
    deploy_map: Dict[str, str] = Body(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_admin),
):
    request = DeployRequest(deploy_map=deploy_map, station_ids=[station_id])
    return _queue_deploy_job(request, background_tasks, db, current_user.username)
