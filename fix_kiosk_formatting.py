
import re

file_path = r'c:\Users\Usuari\Desktop\Assetto Manager Mods\ac-manager\frontend\src\pages\KioskSteps.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix pattern "word - word" -> "word-word"
content = re.sub(r'(\w)\s+-\s+(\w)', r'\1-\2', content)
# Fix pattern "word - number" -> "word-number" (e.g. p - 2 -> p-2)
content = re.sub(r'(\w)\s+-\s+(\d)', r'\1-\2', content)
# Fix pattern "number - number" -> "number-number" (e.g. cols - 3)
content = re.sub(r'(\d)\s+-\s+(\d)', r'\1-\2', content)
# Fix " / " -> "/" (e.g. 800 / 50 -> 800/50)
content = re.sub(r'\s+/\s+', '/', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed formatting in KioskSteps.tsx")
