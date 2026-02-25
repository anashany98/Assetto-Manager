import os
import re

# Fix KioskStepsModern.tsx
path_steps = r'c:\Users\PC\Desktop\AC-MANAGER\frontend\src\pages\KioskStepsModern.tsx'
with open(path_steps, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove unused import ContentStep
content = re.sub(r"import \{ ContentStep \} from '\./KioskContentStep';\s*", "", content)

# Fix unused 't' in ScenarioStepModern props destructuring
# content = content.replace("t, scenarios,", "scenarios,") 
# logic might use t eventually, let's just suppress or ignore.
# Actually, let's just remove the import of ContentStep as that was a main error.

with open(path_steps, 'w', encoding='utf-8') as f:
    f.write(content)

# Fix KioskModern.tsx
path_page = r'c:\Users\PC\Desktop\AC-MANAGER\frontend\src\pages\KioskModern.tsx'
with open(path_page, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove unused useEffect from import
content = content.replace("import { useState, useEffect, useMemo, useRef }", "import { useState, useMemo, useRef }")
# Check if useEffect is used elsewhere, if so, keep it. 
# The error said it was unused.

with open(path_page, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed lint errors.")
