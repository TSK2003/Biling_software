#!/usr/bin/env python3
import os
import sqlite3

def main():
    print("========================================================")
    print("CLEARING DEMO PRODUCTS & CATEGORIES")
    print("========================================================")
    
    app_data = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if not app_data:
        app_data = os.path.expanduser("~")
    db_path = os.path.join(app_data, "com.billing.software", "billing_software.db")
    
    if not os.path.exists(db_path):
        print("Database not found, nothing to clear.")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    cur.execute("DELETE FROM bill_items")
    cur.execute("DELETE FROM payments")
    cur.execute("DELETE FROM bills")
    cur.execute("DELETE FROM draft_bills")
    cur.execute("DELETE FROM products")
    cur.execute("DELETE FROM categories")
    cur.execute("DELETE FROM product_code_seq")
    cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('products', 'categories', 'bills', 'bill_items', 'payments', 'draft_bills')")
    
    conn.commit()
    conn.close()
    
    print("[OK] Successfully cleared all demo products and categories!")
    print(f"Database: {db_path}")
    print("========================================================")

if __name__ == "__main__":
    main()
