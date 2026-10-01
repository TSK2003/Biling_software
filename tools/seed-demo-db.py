#!/usr/bin/env python3
import os
import re
import sqlite3
import base64

def generate_svg(name, category, icon_kind):
    colors = {
        "juice": ("#f43f5e", "#be123c", "#ffe4e6", "#9f1239"),
        "citrus": ("#f97316", "#c2410c", "#ffedd5", "#9a3412"),
        "tropical": ("#eab308", "#ca8a04", "#fef9c3", "#854d0e"),
        "soda": ("#06b6d4", "#0891b2", "#cffafe", "#155e75"),
        "shake": ("#ec4899", "#be185d", "#fce7f3", "#9d174d"),
        "samosa": ("#d97706", "#b45309", "#fef3c7", "#92400e"),
        "fries": ("#f59e0b", "#d97706", "#fef3c7", "#78350f"),
        "chaat": ("#10b981", "#059669", "#d1fae5", "#065f46"),
        "burger": ("#ea580c", "#9a3412", "#ffedd5", "#7c2d12"),
        "pizza": ("#dc2626", "#991b1b", "#fee2e2", "#7f1d1d"),
        "sandwich": ("#84cc16", "#4d7c0f", "#ecfccb", "#365314"),
        "noodles": ("#f59e0b", "#b45309", "#fef3c7", "#78350f"),
        "icecream": ("#a855f7", "#7e22ce", "#f3e8ff", "#581c87"),
        "dessert": ("#ec4899", "#9333ea", "#fdf2f8", "#701a75"),
        "pastry": ("#854d0e", "#543310", "#fef9c3", "#451a03"),
        "doughnut": ("#f43f5e", "#e11d48", "#ffe4e6", "#881337"),
        "coffee": ("#78350f", "#451a03", "#fef3c7", "#38200f"),
        "tea": ("#b45309", "#78350f", "#fef3c7", "#451a03"),
        "dosa": ("#d97706", "#92400e", "#fef3c7", "#713f12"),
        "thali": ("#0284c7", "#0369a1", "#e0f2fe", "#075985"),
        "packaged": ("#3b82f6", "#1d4ed8", "#dbeafe", "#1e40af"),
    }
    c1, c2, b_bg, b_txt = colors.get(icon_kind, ("#64748b", "#334155", "#f1f5f9", "#0f172a"))
    short_title = name[:18]
    cat_label = category.upper()[:12]

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}" />
      <stop offset="100%" stop-color="{c2}" />
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="22" fill="url(#g)" />
  <circle cx="130" cy="30" r="45" fill="rgba(255,255,255,0.08)" />
  <circle cx="20" cy="140" r="35" fill="rgba(0,0,0,0.08)" />
  <rect x="14" y="118" width="132" height="28" rx="8" fill="rgba(255,255,255,0.92)" />
  <text x="80" y="136" fill="#0f172a" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="9" font-weight="700" text-anchor="middle">{short_title}</text>
  <rect x="52" y="10" width="56" height="15" rx="7.5" fill="{b_bg}" />
  <text x="80" y="21" fill="{b_txt}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="7" font-weight="800" text-anchor="middle">{cat_label}</text>
</svg>"""
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode('utf-8')).decode('utf-8')

def main():
    print("========================================================")
    print("SEEDING 116 DEMO PRODUCTS & CATEGORIES (WITH IMAGES & STOCK)")
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
    
    # Parse categories: ("Name", sort_order, "kind")
    cat_matches = re.findall(r'\("([^"]+)",\s*(\d+),\s*"([^"]+)"\)', content)
    
    # Parse products
    prod_pattern = r'DemoProduct\s*\{\s*code:\s*"([^"]+)",\s*name:\s*"((?:\\.|[^"\\])*)",\s*category_name:\s*"([^"]+)",\s*price_paise:\s*(\d+),\s*buying_price_paise:\s*(\d+),\s*is_restockable:\s*(true|false),\s*initial_stock:\s*(\d+),\s*gst_enabled:\s*(true|false),\s*gst_percentage_x100:\s*(\d+),\s*barcode:\s*"([^"]+)",\s*icon_kind:\s*"([^"]+)"\s*\}'
    prod_matches = re.findall(prod_pattern, content)
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Clean up legacy empty categories before inserting
    merges = [
        ("Juice", "Juice & Beverages"),
        ("Snacks", "Snacks & Chaat"),
        ("Fast Food", "Fast Food & Burgers"),
        ("Ice Cream", "Ice Cream & Desserts"),
    ]
    for old_name, new_name in merges:
        cur.execute("SELECT id FROM categories WHERE name = ?", (old_name,))
        old_row = cur.fetchone()
        cur.execute("SELECT id FROM categories WHERE name = ?", (new_name,))
        new_row = cur.fetchone()
        if old_row and new_row:
            cur.execute("UPDATE products SET category_id = ? WHERE category_id = ?", (new_row[0], old_row[0]))
            cur.execute("SELECT COUNT(*) FROM products WHERE category_id = ?", (old_row[0],))
            if cur.fetchone()[0] == 0:
                cur.execute("DELETE FROM categories WHERE id = ?", (old_row[0],))
        elif old_row and not new_row:
            cur.execute("UPDATE categories SET name = ? WHERE id = ?", (new_name, old_row[0]))

    # Delete empty 'Others'
    cur.execute("SELECT id FROM categories WHERE name = 'Others'")
    others_row = cur.fetchone()
    if others_row:
        cur.execute("SELECT COUNT(*) FROM products WHERE category_id = ?", (others_row[0],))
        if cur.fetchone()[0] == 0:
            cur.execute("DELETE FROM categories WHERE id = ?", (others_row[0],))

    # 1. Insert categories
    for name, sort_order, kind in cat_matches:
        cat_img = generate_svg(name, name, kind)
        cur.execute("INSERT OR IGNORE INTO categories (name, sort_order, image_path, is_active) VALUES (?, ?, ?, 1)", (name, int(sort_order), cat_img))
        cur.execute("UPDATE categories SET sort_order = ?, image_path = ?, is_active = 1 WHERE name = ?", (int(sort_order), cat_img, name))
        
    # Resequence sort_order 1..8
    cur.execute("SELECT id FROM categories ORDER BY sort_order ASC, id ASC")
    all_cats = cur.fetchall()
    for idx, (cat_id,) in enumerate(all_cats):
        cur.execute("UPDATE categories SET sort_order = ? WHERE id = ?", (idx + 1, cat_id))

    # Build category lookup map
    cur.execute("SELECT name, id FROM categories")
    cat_map = {row[0]: row[1] for row in cur.fetchall()}
    
    # 2. Insert products and inventory
    inserted = 0
    for code, name, cat_name, price, buying_price, restock, stock, gst_enabled, gst_pct, barcode, kind in prod_matches:
        cat_id = cat_map.get(cat_name, 1)
        gst_val = 1 if gst_enabled == "true" else 0
        is_restock = 1 if restock == "true" else 0
        img = generate_svg(name, cat_name, kind)
        
        cur.execute("""
            INSERT OR REPLACE INTO products (
                product_code, name, category_id, image_path, selling_price_paise,
                buying_price_paise, is_restockable, gst_enabled, gst_percentage_x100, barcode, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (code, name, cat_id, img, int(price), int(buying_price), is_restock, gst_val, int(gst_pct), barcode))
        
        cur.execute("SELECT id FROM products WHERE product_code = ?", (code,))
        row = cur.fetchone()
        if row:
            p_id = row[0]
            cur.execute("""
                INSERT INTO inventory (product_id, current_stock, low_stock_threshold, updated_at)
                VALUES (?, ?, 5, datetime('now'))
                ON CONFLICT(product_id) DO UPDATE SET current_stock = ?, low_stock_threshold = 5, updated_at = datetime('now')
            """, (p_id, int(stock), int(stock)))
            
        inserted += 1
        
    conn.commit()
    conn.close()
    
    print(f"[OK] Successfully seeded {inserted} demo products across {len(cat_matches)} categories!")
    print(f"Database: {db_path}")
    print("========================================================")

if __name__ == "__main__":
    main()
