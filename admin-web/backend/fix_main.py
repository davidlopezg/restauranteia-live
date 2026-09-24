"""Fix: rebuild main.py with all missing sections."""
from pathlib import Path

p = Path('main.py')
content = p.read_text(encoding='utf-8')

# Find insertion point - between IDEAS section and Ware section
ware_start = content.find('# === Ware (inventario de vajilla) ===')
insert_point = content.rfind('return {"deleted": True, "id": idea_id}', 0, ware_start)
insert_point = content.find('\n', insert_point) + 1

# Read missing sections from file
missing = Path('sections_to_add.py').read_text(encoding='utf-8')

# Insert
new_content = content[:insert_point] + '\n' + missing + '\n' + content[insert_point:]

# Remove duplicate convertir at end
if '# === IDEA' in new_content and new_content.rfind('# === IDEA') > new_content.rfind('# === SERVE FRONTEND'):
    last_dup = new_content.rfind('# === IDEA')
    new_content = new_content[:last_dup]

p.write_text(new_content, encoding='utf-8')
print('Written')