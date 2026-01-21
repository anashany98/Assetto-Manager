import os
import json
import zipfile
import shutil

def create_fake_mod(mod_type="car", internal_name="test_vehicle_01", real_name="Test Ferrari F40 Pro"):
    print(f"Creating fake {mod_type} mod...")
    
    # Define structure based on AC standards
    # content/cars/{internal_name}/ui/ui_car.json
    
    base_dir = "temp_mod_build"
    if os.path.exists(base_dir):
        shutil.rmtree(base_dir)
    
    if mod_type == "car":
        target_dir = os.path.join(base_dir, "content", "cars", internal_name, "ui")
        json_file = "ui_car.json"
        json_content = {
            "name": real_name,
            "brand": "Ferrari",
            "class": "street",
            "specs": {"bhp": "478", "torque": "577 Nm"},
            "author": "AC Manager Test"
        }
    else:
        target_dir = os.path.join(base_dir, "content", "tracks", internal_name, "ui")
        json_file = "ui_track.json"
        json_content = {
            "name": real_name,
            "city": "Monza",
            "length": "5000m",
            "author": "AC Manager Test"
        }
        
    os.makedirs(target_dir, exist_ok=True)
    
    # Write JSON
    with open(os.path.join(target_dir, json_file), "w") as f:
        json.dump(json_content, f, indent=2)
        
    # Create a dummy file to simulate data
    with open(os.path.join(target_dir, "preview.png"), "w") as f:
        f.write("running")

    # Zip it
    zip_filename = f"fake_{mod_type}_{internal_name}.zip"
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(base_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, base_dir)
                zipf.write(file_path, arcname)
                
    # Cleanup
    shutil.rmtree(base_dir)
    print(f"✅ Created: {zip_filename}")
    return os.path.abspath(zip_filename)

if __name__ == "__main__":
    create_fake_mod("car", "ks_ferrari_test", "Ferrari Test F40")
    create_fake_mod("track", "monza_test", "Monza Circuit Test")
    print("\nAhora sube estos archivos en: http://localhost:5959/mods")
