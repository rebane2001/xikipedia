import json
import sqlite3
import os
import subprocess

br_path = 'assets/smoldata.json.br'
json_path = 'assets/smoldata.json.asset'
db_path = 'assets/xikipedia.db'

if not os.path.exists(br_path):
    print(f"Error: {br_path} not found. Please ensure the source data exists.")
    exit(1)

print("Decompressing data...")
subprocess.run(['brotli', '-d', br_path, '-o', json_path], check=True)

if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute('CREATE TABLE pages (id INTEGER PRIMARY KEY, title TEXT, summary TEXT, image TEXT, links TEXT)')
cursor.execute('CREATE TABLE categories (page_id INTEGER, category TEXT)')
cursor.execute('CREATE TABLE no_page_maps (id INTEGER PRIMARY KEY, title TEXT)')
cursor.execute('CREATE TABLE sub_categories (category TEXT, sub_category TEXT)')
cursor.execute('CREATE INDEX idx_categories_page_id ON categories(page_id)')
cursor.execute('CREATE INDEX idx_categories_category ON categories(category)')
cursor.execute('CREATE INDEX idx_sub_categories_sub ON sub_categories(sub_category)')
cursor.execute('CREATE INDEX idx_sub_categories_cat ON sub_categories(category)')

print("Opening JSON...")
with open(json_path, 'r') as f:
    data = json.load(f)

print("Inserting data...")
for p in data.get('pages', []):
    cursor.execute('INSERT INTO pages (id, title, summary, image, links) VALUES (?, ?, ?, ?, ?)',
                   (p[1], p[0], p[2], p[3], json.dumps(p[5])))
    for cat in p[4]:
        cursor.execute('INSERT INTO categories (page_id, category) VALUES (?, ?)', (p[1], cat))

for npm in data.get('noPageMaps', []):
    if isinstance(npm, dict):
        cursor.execute('INSERT INTO no_page_maps (id, title) VALUES (?, ?)', (npm.get('id'), npm.get('title')))

for cat, subs in data.get('subCategories', {}).items():
    for sub in subs:
        cursor.execute('INSERT INTO sub_categories (category, sub_category) VALUES (?, ?)', (cat, sub))

conn.commit()
conn.close()
os.remove(json_path)
print(f"Database successfully created at {db_path}")
