import hashlib
import os
from typing import Dict, List
from pathlib import Path

def calculate_file_hash(file_path: str, chunk_size: int = 8192) -> str:
    """Calculates SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except FileNotFoundError:
        return ""

def generate_manifest(directory_path: str) -> Dict[str, Dict]:
    """
    Generates a manifest of all files in a directory.
    Returns: { 'relative/path': { 'hash': '...', 'size': 123, 'mtime': 123456.7 } }
    """
    manifest = {}
    root_dir = Path(directory_path)
    
    if not root_dir.exists():
        return {}

    for file_path in root_dir.rglob("*"):
        if file_path.is_file():
            relative_path = str(file_path.relative_to(root_dir)).replace("\\", "/") # Enforce forward slashes
            stat = file_path.stat()
            manifest[relative_path] = {
                "hash": calculate_file_hash(str(file_path)),
                "size": stat.st_size,
                "last_modified": stat.st_mtime
            }
            
    return manifest
