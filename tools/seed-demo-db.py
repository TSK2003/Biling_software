#!/usr/bin/env python3
import os
import re
import sqlite3

def main():
    print("========================================================")
    print("SEEDING 100+ DEMO PRODUCTS & CATEGORIES")
    print("========================================================")
    
    app_data = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if not app_data:
        app_data = os.path.expanduser("~")
    db_path = os.path.join(app_data, "com.billing.software", "billing_software.db")
    
    if not os.path.exists(db_path):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, ".."))
    demo_file = os.path.join(project_root, "src-tauri", "src", "db", "demo_data.rs")
    
    if not os.path.exists(demo_file):
        print(f"Error: demo_data.rs not found at {demo_file}")
        return

    content = open(demo_file, "r", encoding="utf-8").read()
    
    # Parse categories
    cat_matches = re.findall(r'\("([^"]+)",\s*(\d+)\)', content)
    
    # Parse products
    prod_pattern = r'DemoProduct\s*\{\s*code:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category_name:\s*"([^"]+)",\s*price_paise:\s*(\d+),\s*gst_enabled:\s*(true|false),\s*gst_percentage_x100:\s*(\d+),\s*barcode:\s*"([^"]+)"\s*\}'
    prod_matches = re.findall(prod_pattern, content)
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # 1. Insert categories
    for name, sort_order in cat_matches:
        cur.execute("INSERT OR IGNORE INTO categories (name, sort_order, is_active) VALUES (?, ?, 1)", (name, int(sort_order)))
        cur.execute("UPDATE categories SET sort_order = ?, is_active = 1 WHERE name = ?", (int(sort_order), name))
        
    # Build category lookup map
    cur.execute("SELECT name, id FROM categories")
    cat_map = {row[0]: row[1] for row in cur.fetchall()}
    
    # 2. Insert products
    inserted = 0
    for code, name, cat_name, price, gst_enabled, gst_pct, barcode in prod_matches:
        cat_id = cat_map.get(cat_name, 1)
        gst_val = 1 if gst_enabled == "true" else 0
        cur.execute("""
            INSERT OR REPLACE INTO products (
                product_code, name, category_id, image_path, selling_price_paise,
                gst_enabled, gst_percentage_x100, barcode, is_active
            ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1)
        """, (code, name, cat_id, int(price), gst_val, int(gst_pct), barcode))
        inserted += 1
        
    conn.commit()
    conn.close()
    
    print(f"[OK] Successfully seeded {inserted} demo products across {len(cat_matches)} categories!")
    print(f"Database: {db_path}")
    print("========================================================")

if __name__ == "__main__":
    main()
