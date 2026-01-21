import json
from typing import Any
from sqlalchemy.orm import Session
from ..models import GlobalSettings


def _get_setting(db: Session, key: str, default: Any) -> Any:
    setting = db.query(GlobalSettings).filter(GlobalSettings.key == key).first()
    if not setting or setting.value is None:
        return default
    return setting.value


def _parse_json(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _parse_number(value: Any, fallback: float) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return fallback
    return num if num == num else fallback


def calculate_price(db: Session, duration_minutes: int, is_vr: bool = False) -> float:
    base_15 = _parse_number(_get_setting(db, "pricing_base_15min", 5), 5)
    base_per_min = _parse_number(_get_setting(db, "pricing_base_per_min", base_15 / 15), base_15 / 15)
    legacy_vr = _parse_number(_get_setting(db, "pricing_vr_surcharge", 0), 0)
    vr_surcharge_per_min = _parse_number(_get_setting(db, "pricing_vr_surcharge_per_min", legacy_vr / 15), legacy_vr / 15)

    rate_list = _parse_json(_get_setting(db, "pricing_duration_rates", "[]"), [])
    rate_map = {}
    if isinstance(rate_list, list):
        for item in rate_list:
            try:
                minutes = int(item.get("minutes"))
                price = float(item.get("price"))
                rate_map[minutes] = price
            except (TypeError, ValueError, AttributeError):
                continue

    total = rate_map.get(duration_minutes, duration_minutes * base_per_min)

    if is_vr and vr_surcharge_per_min > 0:
        total += duration_minutes * vr_surcharge_per_min

    discount_list = _parse_json(_get_setting(db, "pricing_discounts", "[]"), [])
    if isinstance(discount_list, list):
        for item in discount_list:
            try:
                minutes = int(item.get("minutes"))
                if minutes != duration_minutes:
                    continue
                discount_type = item.get("type")
                value = float(item.get("value"))
                if discount_type == "percent":
                    total -= total * (value / 100)
                else:
                    total -= value
                break
            except (TypeError, ValueError, AttributeError):
                continue

    if total < 0:
        total = 0

    return round(total, 2)
