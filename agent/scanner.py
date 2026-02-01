import os
import json
import logging
from config import logger
from utils import get_ip_address

# --- CONTENT SCANNER ---
def scan_ac_content(ac_path: str, station_ip: str = None) -> dict:
    """
    Scan the Assetto Corsa content folder for installed cars and tracks.
    Returns a dict with 'cars' and 'tracks' lists, including proxy image URLs.
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
    def find_image_url(base_path, content_path_root, *filenames):
        for fname in filenames:
            full_path = os.path.join(base_path, fname)
            if os.path.exists(full_path):
                # Convert to relative path from content folder
                rel_path = os.path.relpath(full_path, content_path_root).replace("\\", "/")
                return f"{proxy_base}/{rel_path}"
        return None
    
    # Scan Cars
    cars_path = os.path.join(content_path, "cars")
    if os.path.exists(cars_path):
        for car_folder in os.listdir(cars_path):
            car_dir = os.path.join(cars_path, car_folder)
            if os.path.isdir(car_dir):
                ui_dir = os.path.join(car_dir, "ui")
                ui_json = os.path.join(ui_dir, "ui_car.json")
                name = car_folder
                brand = ""
                
                specs = {}
                if os.path.exists(ui_json):
                    try:
                        with open(ui_json, 'r', encoding='utf-8', errors='ignore') as f:
                            ui_data = json.load(f)
                            name = ui_data.get("name", car_folder)
                            brand = ui_data.get("brand", "")
                            specs = ui_data.get("specs", {})
                    except Exception:
                        pass
                
                # Find preview image and generate proxy URL
                image_url = None
                
                # Check for skin preview first (Requested behavior)
                skins_path = os.path.join(car_dir, "skins")
                if os.path.exists(skins_path):
                    try:
                        # Get first alphabetical skin folder
                        skins = sorted([d for d in os.listdir(skins_path) if os.path.isdir(os.path.join(skins_path, d))])
                        if skins:
                            first_skin_dir = os.path.join(skins_path, skins[0])
                            image_url = find_image_url(first_skin_dir, content_path, "preview.jpg", "preview.png")
                    except Exception:
                        pass
                
                if not image_url:
                    image_url = (
                        find_image_url(ui_dir, content_path, "preview.png", "preview.jpg") or
                        find_image_url(car_dir, content_path, "logo.png") or
                        find_image_url(ui_dir, content_path, "badge.png")
                    )
                
                result["cars"].append({
                    "id": car_folder,
                    "name": name,
                    "brand": brand,
                    "image_url": image_url,
                    "specs": specs
                })
    
    # Scan Tracks
    tracks_path = os.path.join(content_path, "tracks")
    if os.path.exists(tracks_path):
        for track_folder in os.listdir(tracks_path):
            track_dir = os.path.join(tracks_path, track_folder)
            if os.path.isdir(track_dir):
                ui_dir = os.path.join(track_dir, "ui")
                ui_json = os.path.join(ui_dir, "ui_track.json")
                name = track_folder
                layout = ""
                geotags = []
                
                if os.path.exists(ui_json):
                    try:
                        with open(ui_json, 'r', encoding='utf-8', errors='ignore') as f:
                            ui_data = json.load(f)
                            name = ui_data.get("name", track_folder)
                            layout = ui_data.get("description", "")
                            geotags = ui_data.get("geotags", [])
                    except Exception:
                        pass
                
                # Find preview image and generate proxy URL
                image_url = find_image_url(ui_dir, content_path, "preview.png")
                map_url = find_image_url(ui_dir, content_path, "outline.png", "map.png")
                
                result["tracks"].append({
                    "id": track_folder,
                    "name": name,
                    "layout": layout,
                    "image_url": image_url,
                    "map_url": map_url,
                    "geotags": geotags
                })
    
    logger.info(f"Scanned AC content: {len(result['cars'])} cars, {len(result['tracks'])} tracks")
    return result
