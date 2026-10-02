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
    crate::commands::auth::require_admin()?;
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

#[tauri::command]
pub fn get_audit_logs(
    state: State<'_, AppState>,
    date_from: Option<String>,
    date_to: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<crate::models::AuditLog>, String> {
    crate::commands::auth::require_admin()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let mut sql = String::from(
        "SELECT a.id, a.user_id, COALESCE(u.display_name, u.username) as user_name,
                a.action, a.entity_type, a.entity_id, a.details_json, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE 1=1"
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref from) = date_from {
        if !from.trim().is_empty() {
            sql.push_str(&format!(" AND date(a.created_at) >= date(?{})", params.len() + 1));
            params.push(Box::new(from.trim().to_string()));
        }
    }

    if let Some(ref to) = date_to {
        if !to.trim().is_empty() {
            sql.push_str(&format!(" AND date(a.created_at) <= date(?{})", params.len() + 1));
            params.push(Box::new(to.trim().to_string()));
        }
    }

    if let Some(ref q) = search {
        if !q.trim().is_empty() {
            let pattern = format!("%{}%", q.trim());
            sql.push_str(&format!(
                " AND (a.action LIKE ?{} OR a.entity_type LIKE ?{} OR a.details_json LIKE ?{} OR u.display_name LIKE ?{} OR u.username LIKE ?{})",
                params.len() + 1, params.len() + 1, params.len() + 1, params.len() + 1, params.len() + 1
            ));
            params.push(Box::new(pattern));
        }
    }

    sql.push_str(" ORDER BY a.created_at DESC, a.id DESC");

    let max_rows = limit.unwrap_or(500);
    sql.push_str(&format!(" LIMIT {}", max_rows));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = db.conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(crate::models::AuditLog {
            id: row.get(0)?,
            user_id: row.get(1)?,
            user_name: row.get(2)?,
            action: row.get(3)?,
            entity_type: row.get(4)?,
            entity_id: row.get(5)?,
            details_json: row.get(6)?,
            created_at: row.get(7)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

