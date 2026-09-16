use tauri::State;
use crate::AppState;
use crate::models::{BackupRecord, BackupManifest};
use crate::services::backup_service::BackupService;

#[tauri::command]
pub fn create_backup(state: State<'_, AppState>, backup_type: Option<String>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let record = BackupService::create_full_backup(&db, &backup_type.unwrap_or_else(|| "manual".to_string()))?;
    Ok(record.backup_path)
}

#[tauri::command]
pub fn validate_backup(_state: State<'_, AppState>, path: String) -> Result<BackupManifest, String> {
    BackupService::validate_backup_archive(&path)
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    BackupService::restore_full_backup(&mut db, &path)
}

#[tauri::command]
pub fn get_backup_list(state: State<'_, AppState>) -> Result<Vec<BackupRecord>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    BackupService::get_backup_list(&db)
}

#[tauri::command]
pub fn clear_all_business_data(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // Clear transactions and catalog data
    let _ = db.conn.execute("DELETE FROM draft_bills", []);
    let _ = db.conn.execute("DELETE FROM payments", []);
    let _ = db.conn.execute("DELETE FROM bill_items", []);
    let _ = db.conn.execute("DELETE FROM bills", []);
    let _ = db.conn.execute("DELETE FROM products", []);
    let _ = db.conn.execute("DELETE FROM categories", []);
    let _ = db.conn.execute("DELETE FROM inventory", []);
    let _ = db.conn.execute("DELETE FROM stock_movements", []);
    let _ = db.conn.execute("UPDATE product_code_seq SET last_code = 0 WHERE id = 1", []);
    
    // Reset standard categories for convenience
    let _ = db.conn.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (1, 'Juice', 1, 1)", []);
    let _ = db.conn.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (2, 'Snacks', 2, 1)", []);
    let _ = db.conn.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (3, 'Fast Food', 3, 1)", []);
    let _ = db.conn.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (4, 'Ice Cream', 4, 1)", []);
    let _ = db.conn.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (5, 'Others', 5, 1)", []);
    
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type) VALUES ('wipe_all_data', 'database')",
        [],
    );
    
    Ok(())
}
