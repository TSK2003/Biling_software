use tauri::State;
use crate::AppState;
use crate::models::Setting;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Vec<Setting>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let mut stmt = db.conn.prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| format!("Query error: {}", e))?;
    
    let settings: Vec<Setting> = stmt.query_map([], |row| {
        Ok(Setting {
            key: row.get(0)?,
            value: row.get(1)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(settings)
}

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    db.conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    ).map_err(|_| format!("Setting '{}' not found", key))
}

#[tauri::command]
pub fn update_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let affected = db.conn.execute(
        "UPDATE settings SET value = ?1, updated_at = datetime('now') WHERE key = ?2",
        rusqlite::params![value, key],
    ).map_err(|e| format!("Update failed: {}", e))?;
    
    if affected == 0 {
        // Insert if not exists
        db.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        ).map_err(|e| format!("Insert failed: {}", e))?;
    }
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, details_json) VALUES ('update', 'setting', ?1)",
        rusqlite::params![format!("{{\"key\":\"{}\"}}", key)],
    );
    
    Ok(())
}
