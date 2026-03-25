import os

path = r'c:\Users\PC\Desktop\AC-MANAGER\frontend\src\App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import_line = "const KioskMode = lazy(() => import('./pages/KioskMode'));"
new_import = "const KioskMode = lazy(() => import('./pages/KioskMode'));\nconst KioskModern = lazy(() => import('./pages/KioskModern'));"

route_line = '<Route path="/kiosk" element={<KioskMode />} />'
new_route = '<Route path="/kiosk" element={<KioskMode />} />\n                <Route path="/kiosk-modern" element={<KioskModern />} />'

if "KioskModern" not in content:
    if import_line in content:
        content = content.replace(import_line, new_import)
    else:
        print("Import line not found!")
    
    if route_line in content:
        content = content.replace(route_line, new_route)
    else:
         print("Route line not found!")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated App.tsx")
else:
    print("App.tsx already updated")
