import os
import json
import re
import logging
from pathlib import Path
from config import logger
from utils import get_ip_address

CONTENT_CACHE_PATH = Path(__file__).resolve().parent / "content_cache.json"


def _save_content_cache(data: dict):
    """Save scanned content to a local JSON cache file for offline kiosk mode."""
    try:
        with open(CONTENT_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"Content cache saved to {CONTENT_CACHE_PATH}")
    except Exception as e:
        logger.error(f"Failed to save content cache: {e}")


def _load_json_tolerant(filepath: str) -> dict:
    """
    Load a JSON file tolerantly, handling common issues in AC mods:
    - UTF-8 BOM (Byte Order Mark)
    - Trailing commas before } or ]
    - Single-line comments (//)
    - Specs values as numbers instead of strings
    Returns empty dict on failure.
    """
    try:
        # utf-8-sig handles BOM transparently
        with open(filepath, 'r', encoding='utf-8-sig', errors='replace') as f:
            raw = f.read()
    except OSError:
        return {}

    # Remove single-line comments (// ...)
    raw = re.sub(r'//[^\n]*', '', raw)

    # Remove trailing commas before closing brace/bracket
    raw = re.sub(r',\s*([}\]])', r'\1', raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _brand_from_folder(folder_name: str) -> str:
    """
    Attempt to extract a brand name from the AC folder name when the brand
    field is missing or empty. Handles common patterns like:
      ferrari_458_gt3  → Ferrari
      bmw_m3_e92       → BMW
      lamborghini_huracan → Lamborghini
    """
    known_brands = [
        'Ferrari', 'Lamborghini', 'Porsche', 'McLaren', 'Aston Martin',
        'Bugatti', 'BMW', 'Mercedes', 'Audi', 'Alfa Romeo', 'Maserati',
        'Ford', 'Chevrolet', 'Dodge', 'Corvette', 'Mustang',
        'Honda', 'Toyota', 'Nissan', 'Mazda', 'Subaru',
        'Renault', 'Peugeot', 'Citroën', 'Lotus', 'Jaguar', 'Bentley',
        'KTM', 'Pagani', 'Koenigsegg', 'Radical', 'Tatuus', 'Dallara',
    ]
    lower = folder_name.lower()
    for brand in known_brands:
        if brand.lower().replace(' ', '_') in lower or brand.lower() in lower:
            return brand
    return ''

# --- CONTENT SCANNER ---
def scan_ac_content(ac_path: str, station_ip: str = None) -> dict:
    """
    Scan the Assetto Corsa content folder for installed cars and tracks.
    Returns a dict with 'cars' and 'tracks' lists, including proxy image URLs.
    Handles multi-layout tracks (layouts/ subdirectory).
    """
    result = {"cars": [], "tracks": []}

    if not ac_path or not os.path.exists(ac_path):
        logger.warning(f"AC path not found or not configured: {ac_path}")
        return result

    content_path = os.path.join(ac_path, "content")

    # Use station IP for image proxy URL, fallback to detected IP
    proxy_host = station_ip or get_ip_address() or "localhost"
    proxy_base = f"http://{proxy_host}:8081"

    # Helper to find first existing image and return proxy URL
    def find_image_url(base_path, *filenames):
        for fname in filenames:
            full_path = os.path.join(base_path, fname)
            if os.path.exists(full_path):
                rel_path = os.path.relpath(full_path, content_path).replace("\\", "/")
                return f"{proxy_base}/{rel_path}"
        return None

    # --- Scan Cars ---
    cars_path = os.path.join(content_path, "cars")
    if os.path.exists(cars_path):
        for car_folder in sorted(os.listdir(cars_path)):
            car_dir = os.path.join(cars_path, car_folder)
            if not os.path.isdir(car_dir):
                continue

            ui_dir = os.path.join(car_dir, "ui")
            ui_json = os.path.join(ui_dir, "ui_car.json")
            name = car_folder
            brand = ""
            specs = {}

            if os.path.exists(ui_json):
                ui_data = _load_json_tolerant(ui_json)
                name = ui_data.get("name") or car_folder
                brand = ui_data.get("brand") or ""
                raw_specs = ui_data.get("specs") or {}
                # Normalise spec values to strings (some mods store them as numbers)
                if isinstance(raw_specs, dict):
                    specs = {k: str(v) for k, v in raw_specs.items() if v is not None}

            # Fallback brand inference from folder name when missing
            if not brand:
                brand = _brand_from_folder(car_folder)

            # Badge URL (brand logo) — separate from car preview
            badge_url = find_image_url(ui_dir, "badge.png")

            # Preview image: skin preview → ui preview → badge fallback
            image_url = None
            skins_path = os.path.join(car_dir, "skins")
            if os.path.exists(skins_path):
                try:
                    skins = sorted([
                        d for d in os.listdir(skins_path)
                        if os.path.isdir(os.path.join(skins_path, d))
                    ])
                    if skins:
                        first_skin_dir = os.path.join(skins_path, skins[0])
                        image_url = find_image_url(first_skin_dir, "preview.jpg", "preview.png")
                except Exception:
                    pass

            if not image_url:
                image_url = (
                    find_image_url(ui_dir, "preview.png", "preview.jpg") or
                    find_image_url(car_dir, "logo.png") or
                    badge_url
                )

            result["cars"].append({
                "id": car_folder,
                "name": name,
                "brand": brand,
                "image_url": image_url,
                "badge_url": badge_url,
                "specs": specs
            })

    # --- Scan Tracks ---
    tracks_path = os.path.join(content_path, "tracks")
    if os.path.exists(tracks_path):
        for track_folder in sorted(os.listdir(tracks_path)):
            track_dir = os.path.join(tracks_path, track_folder)
            if not os.path.isdir(track_dir):
                continue

            layouts_dir = os.path.join(track_dir, "layouts")
            if os.path.exists(layouts_dir) and os.path.isdir(layouts_dir):
                # Multi-layout track: scan each layout as a separate entry
                for layout_name in sorted(os.listdir(layouts_dir)):
                    layout_dir = os.path.join(layouts_dir, layout_name)
                    if not os.path.isdir(layout_dir):
                        continue
                    _append_track(
                        result, content_path, find_image_url,
                        track_id=f"{track_folder}/{layout_name}",
                        folder_name=track_folder,
                        ui_dir=os.path.join(layout_dir, "ui"),
                        fallback_ui_dir=os.path.join(track_dir, "ui"),
                    )
            else:
                # Single layout track
                _append_track(
                    result, content_path, find_image_url,
                    track_id=track_folder,
                    folder_name=track_folder,
                    ui_dir=os.path.join(track_dir, "ui"),
                    fallback_ui_dir=None,
                )

    logger.info(
        f"Scanned AC content: {len(result['cars'])} cars, {len(result['tracks'])} tracks"
    )

    # Save to local cache for offline kiosk mode
    _save_content_cache(result)

    return result


def _append_track(result, content_path, find_image_url, track_id, folder_name, ui_dir, fallback_ui_dir):
    """Parse one track (or layout) entry and append to result['tracks']."""
    name = folder_name
    layout = ""
    country = ""
    geotags = []

    # Try layout-specific ui_track.json first, then fall back to parent
    for candidate_dir in filter(None, [ui_dir, fallback_ui_dir]):
        ui_json = os.path.join(candidate_dir, "ui_track.json")
        if os.path.exists(ui_json):
            ui_data = _load_json_tolerant(ui_json)
            if ui_data:
                name = ui_data.get("name") or folder_name
                layout = ui_data.get("description") or ""
                country = ui_data.get("country") or ""
                geotags = ui_data.get("geotags") or []
                break

    image_url = find_image_url(ui_dir, "preview.png", "preview.jpg")
    if not image_url and fallback_ui_dir:
        image_url = find_image_url(fallback_ui_dir, "preview.png", "preview.jpg")

    map_url = find_image_url(ui_dir, "outline.png", "map.png")
    if not map_url and fallback_ui_dir:
        map_url = find_image_url(fallback_ui_dir, "outline.png", "map.png")

    result["tracks"].append({
        "id": track_id,
        "name": name,
        "layout": layout,
        "country": country,
        "image_url": image_url,
        "map_url": map_url,
        "geotags": geotags,
    })
