"""
Track Layout Parser for Assetto Corsa

This module provides endpoints to extract track layouts from Assetto Corsa track files.
It parses the fast_lane.ai binary file to generate SVG path data for visualization.
"""

from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
from typing import Optional, List, Dict, Any
import struct
import os
import logging

logger = logging.getLogger("api.tracks")

router = APIRouter(
    prefix="/tracks",
    tags=["tracks"]
)

# Assetto Corsa content path - typically C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\content\tracks
# This should be configurable via environment variable
AC_TRACKS_PATH = Path(os.environ.get("AC_TRACKS_PATH", r"C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\content\tracks"))


def parse_fast_lane_ai(file_path: Path) -> List[Dict[str, float]]:
    """
    Parse the fast_lane.ai binary file to extract track coordinates.
    
    The fast_lane.ai file format (simplified):
    - Header: 4 bytes (int) - number of points
    - For each point:
        - x: 4 bytes (float)
        - y: 4 bytes (float) 
        - z: 4 bytes (float)
        - ... additional data (speed hints, etc.)
    
    Returns a list of {x, y, z} coordinates.
    """
    points = []
    
    try:
        with open(file_path, 'rb') as f:
            # Read header - first 4 bytes contain version or count
            header = f.read(4)
            if len(header) < 4:
                return points
            
            # Try to determine format by reading first few values
            f.seek(0)
            
            # Format 1: starts with count (int32)
            count_bytes = f.read(4)
            count = struct.unpack('<i', count_bytes)[0]
            
            # Sanity check - count should be reasonable (1-50000 points)
            if 1 <= count <= 50000:
                # Read points (each point is 48 bytes in full format, but we only need first 12 for x,y,z)
                for i in range(min(count, 10000)):  # Limit to 10k points for performance
                    try:
                        # Read x, y, z as floats (12 bytes)
                        point_data = f.read(12)
                        if len(point_data) < 12:
                            break
                        
                        x, y, z = struct.unpack('<fff', point_data)
                        
                        # Skip remaining bytes of the point record (speed, etc.)
                        # Full record is typically 48 bytes, so skip 36 more
                        f.read(36)
                        
                        # Only add valid points (not NaN or extreme values)
                        if abs(x) < 100000 and abs(z) < 100000:
                            points.append({"x": x, "y": y, "z": z})
                    except struct.error:
                        break
            else:
                # Alternative format - try reading raw floats
                f.seek(0)
                file_size = file_path.stat().st_size
                num_floats = file_size // 4
                
                floats = []
                for _ in range(min(num_floats, 30000)):
                    try:
                        data = f.read(4)
                        if len(data) < 4:
                            break
                        floats.append(struct.unpack('<f', data)[0])
                    except:
                        break
                
                # Group into xyz triplets
                for i in range(0, len(floats) - 2, 3):
                    x, y, z = floats[i], floats[i+1], floats[i+2]
                    if abs(x) < 100000 and abs(z) < 100000:
                        points.append({"x": x, "y": y, "z": z})
                        
    except Exception as e:
        logger.error(f"Error parsing fast_lane.ai: {e}")
    
    return points


def points_to_svg_path(points: List[Dict[str, float]], width: int = 1000, height: int = 800) -> Dict[str, Any]:
    """
    Convert a list of 3D points to an SVG path string.
    Uses X and Z coordinates (horizontal plane in 3D space).
    """
    if not points or len(points) < 3:
        return {"path": "", "viewBox": f"0 0 {width} {height}", "error": "Not enough points"}
    
    # Extract X and Z (we use Z as Y in 2D since it's the horizontal plane)
    xs = [p["x"] for p in points]
    zs = [p["z"] for p in points]
    
    # Calculate bounds
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    
    # Add padding
    padding = 50
    range_x = max_x - min_x or 1
    range_z = max_z - min_z or 1
    
    # Scale to fit in viewBox
    scale = min((width - 2 * padding) / range_x, (height - 2 * padding) / range_z)
    
    # Center offset
    offset_x = padding + (width - 2 * padding - range_x * scale) / 2
    offset_z = padding + (height - 2 * padding - range_z * scale) / 2
    
    # Build SVG path
    path_parts = []
    
    # Simplify path by sampling every Nth point for performance
    sample_rate = max(1, len(points) // 500)
    sampled_points = points[::sample_rate]
    
    for i, p in enumerate(sampled_points):
        screen_x = (p["x"] - min_x) * scale + offset_x
        screen_y = (p["z"] - min_z) * scale + offset_z
        
        if i == 0:
            path_parts.append(f"M {screen_x:.1f},{screen_y:.1f}")
        else:
            path_parts.append(f"L {screen_x:.1f},{screen_y:.1f}")
    
    # Close the path (tracks are loops)
    path_parts.append("Z")
    
    return {
        "path": " ".join(path_parts),
        "viewBox": f"0 0 {width} {height}",
        "pointCount": len(points),
        "sampledCount": len(sampled_points)
    }


@router.get("/list")
async def list_available_tracks():
    """
    List all available tracks in the Assetto Corsa content folder.
    """
    if not AC_TRACKS_PATH.exists():
        raise HTTPException(status_code=404, detail=f"AC tracks path not found: {AC_TRACKS_PATH}")
    
    tracks = []
    for track_dir in AC_TRACKS_PATH.iterdir():
        if track_dir.is_dir():
            # Check for ai folder with fast_lane.ai
            ai_file = track_dir / "ai" / "fast_lane.ai"
            has_ai = ai_file.exists()
            
            # Check for map.png
            map_file = track_dir / "ui" / "outline.png"
            if not map_file.exists():
                map_file = track_dir / "ui" / "map.png"
            has_map = map_file.exists()
            
            tracks.append({
                "id": track_dir.name,
                "name": track_dir.name.replace("_", " ").title(),
                "hasAiLine": has_ai,
                "hasMapImage": has_map
            })
    
    return tracks


@router.get("/{track_id}/outline")
async def get_track_outline(
    track_id: str,
    width: int = Query(1000, ge=100, le=4000),
    height: int = Query(800, ge=100, le=3000),
    layout: Optional[str] = None
):
    """
    Get the SVG path outline for a specific track.
    
    - **track_id**: The folder name of the track
    - **width**: Output SVG width
    - **height**: Output SVG height
    - **layout**: Optional layout variant (e.g., "gp", "oval")
    """
    track_path = AC_TRACKS_PATH / track_id
    
    if not track_path.exists():
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    
    # Check for layout-specific ai file
    if layout:
        ai_file = track_path / layout / "ai" / "fast_lane.ai"
        if not ai_file.exists():
            ai_file = track_path / "ai" / "fast_lane.ai"
    else:
        ai_file = track_path / "ai" / "fast_lane.ai"
    
    if not ai_file.exists():
        # Try to find any fast_lane.ai in subdirectories
        for subdir in track_path.iterdir():
            if subdir.is_dir():
                potential_ai = subdir / "ai" / "fast_lane.ai"
                if potential_ai.exists():
                    ai_file = potential_ai
                    break
    
    if not ai_file.exists():
        raise HTTPException(status_code=404, detail=f"AI line file not found for track: {track_id}")
    
    # Parse the AI file
    points = parse_fast_lane_ai(ai_file)
    
    if not points:
        raise HTTPException(status_code=500, detail="Failed to parse AI line file")
    
    # Convert to SVG path
    result = points_to_svg_path(points, width, height)
    result["trackId"] = track_id
    result["trackName"] = track_id.replace("_", " ").title()
    
    return result


@router.get("/{track_id}/map-image")
async def get_track_map_image(track_id: str, layout: Optional[str] = None):
    """
    Get the path to the track's map/outline image if available.
    """
    from fastapi.responses import FileResponse
    
    track_path = AC_TRACKS_PATH / track_id
    
    if not track_path.exists():
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    
    # Priority: outline.png > map.png
    possible_paths = [
        track_path / "ui" / "outline.png",
        track_path / "ui" / "map.png",
    ]
    
    if layout:
        possible_paths = [
            track_path / layout / "ui" / "outline.png",
            track_path / layout / "ui" / "map.png",
        ] + possible_paths
    
    for img_path in possible_paths:
        if img_path.exists():
            return FileResponse(img_path, media_type="image/png")
    
    raise HTTPException(status_code=404, detail=f"Map image not found for track: {track_id}")
