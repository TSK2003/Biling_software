use billing_software_lib::db::connection::Database;

#[test]
fn wipe_all_database_data() {
    let mut db = Database::init().expect("Failed to initialize database");
    
    let tx = db.conn.transaction().expect("Failed to start transaction");
    
    // Clear all bills, payments, items, drafts
    let _ = tx.execute("DELETE FROM draft_bills", []);
    let _ = tx.execute("DELETE FROM payments", []);
    let _ = tx.execute("DELETE FROM bill_items", []);
    let _ = tx.execute("DELETE FROM bills", []);
    
    // Clear inventory and stock movements
    let _ = tx.execute("DELETE FROM stock_movements", []);
    let _ = tx.execute("DELETE FROM inventory", []);
    
    // Clear products and custom categories
    let _ = tx.execute("DELETE FROM products", []);
    let _ = tx.execute("DELETE FROM categories", []);
    let _ = tx.execute("UPDATE product_code_seq SET last_code = 0 WHERE id = 1", []);
    
    // Clear sync queue and backup records
    let _ = tx.execute("DELETE FROM sync_queue", []);
    let _ = tx.execute("DELETE FROM backup_records", []);
    let _ = tx.execute("DELETE FROM audit_logs", []);
    
    // Re-seed standard empty categories
    let _ = tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (1, 'Juice', 1, 1)", []);
    let _ = tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (2, 'Snacks', 2, 1)", []);
    let _ = tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (3, 'Fast Food', 3, 1)", []);
    let _ = tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (4, 'Ice Cream', 4, 1)", []);
    let _ = tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (5, 'Others', 5, 1)", []);
    
    tx.commit().expect("Failed to commit wipe transaction");
    
    println!("✅ All business data, bills, products, inventory, and records have been completely wiped from the database!");
}
