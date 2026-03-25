import os

path = r'C:\Users\PC\.gemini\antigravity\brain\ab077100-b732-44a6-bf12-5b3d4def6826\task.md'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_task = "    - [x] Traducción de UI a Español <!-- id: 20 -->\n"

if "Traducción de UI a Español" not in content:
    idx = content.find("- [x] Integrate Lobby Flow (Join/Create) <!-- id: 19 -->")
    if idx != -1:
        insert_pos = content.find("\n", idx) + 1
        new_content = content[:insert_pos] + new_task + content[insert_pos:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Translation task appended.")
    else:
        print("Anchor task not found.")
else:
    print("Task already present.")
