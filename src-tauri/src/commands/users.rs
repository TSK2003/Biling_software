use tauri::State;
use crate::AppState;
use crate::models::User;

pub fn parse_user_permissions(role: &str, permissions_json: Option<String>) -> Vec<String> {
    if let Some(json_str) = permissions_json {
        if let Ok(perms) = serde_json::from_str::<Vec<String>>(&json_str) {
            if !perms.is_empty() {
                return perms;
            }
        }
    }
    
    // Fallback based on role
    match role {
        "admin" => vec![
            "billing".into(), "bills".into(), "dashboard".into(),
            "products".into(), "categories".into(), "reports".into(),
            "backup".into(), "users".into(), "settings".into(),
        ],
        "manager" => vec![
            "billing".into(), "bills".into(), "dashboard".into(),
            "products".into(), "categories".into(), "reports".into(),
        ],
        "inventory_staff" => vec![
            "products".into(), "categories".into(), "dashboard".into(),
        ],
        _ => vec!["billing".into(), "bills".into()], // cashier / staff default
    }
}

#[tauri::command]
pub fn get_users(state: State<'_, AppState>) -> Result<Vec<User>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let mut stmt = db.conn.prepare(
        "SELECT id, username, display_name, role, is_active, max_discount_pct, plain_password, permissions_json, created_at, updated_at
         FROM users ORDER BY role ASC, display_name ASC"
    ).map_err(|e| format!("Query error: {}", e))?;
    
    let users: Vec<User> = stmt.query_map([], |row| {
        let role: String = row.get(3)?;
        let plain_password: Option<String> = row.get(6).ok();
        let permissions_json: Option<String> = row.get(7).ok();
        let permissions = parse_user_permissions(&role, permissions_json);
        
        Ok(User {
            id: row.get(0)?,
            username: row.get(1)?,
            display_name: row.get(2)?,
            role,
            is_active: row.get::<_, i32>(4)? == 1,
            max_discount_pct: row.get(5)?,
            plain_password,
            permissions,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(users)
}

#[tauri::command]
pub fn create_user(
    state: State<'_, AppState>,
    username: String,
    display_name: String,
    password: String,
    role: String,
    permissions: Option<Vec<String>>,
    max_discount_pct: Option<i32>,
) -> Result<User, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let username = username.trim().to_lowercase();
    let display_name = display_name.trim().to_string();
    
    if username.is_empty() || display_name.is_empty() || password.is_empty() {
        return Err("Username, display name, and password are required".to_string());
    }
    if password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }
    
    let role = if role.trim().is_empty() {
        "staff".to_string()
    } else {
        role.trim().to_string()
    };
    
    // Hash password
    use argon2::{Argon2, password_hash::{rand_core::OsRng, PasswordHasher, SaltString}};
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {}", e))?
        .to_string();
    
    let max_disc = max_discount_pct.unwrap_or(10);
    
    // Determine screen permissions
    let final_permissions = if let Some(perms) = permissions {
        if !perms.is_empty() {
            perms
        } else {
            parse_user_permissions(&role, None)
        }
    } else {
        parse_user_permissions(&role, None)
    };
    
    let permissions_json = serde_json::to_string(&final_permissions).unwrap_or_else(|_| "[]".to_string());
    
    db.conn.execute(
        "INSERT INTO users (username, display_name, password_hash, plain_password, permissions_json, role, max_discount_pct) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![username, display_name, hash, password, permissions_json, role, max_disc],
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "Username already exists".to_string()
        } else {
            format!("Failed to create user: {}", e)
        }
    })?;
    
    let id = db.conn.last_insert_rowid();
    
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details_json) VALUES ('create', 'user', ?1, ?2)",
        rusqlite::params![id, format!("{{\"username\":\"{}\",\"role\":\"{}\"}}", username, role)],
    );
    
    Ok(User {
        id,
        username,
        display_name,
        role,
        is_active: true,
        max_discount_pct: max_disc,
        plain_password: Some(password),
        permissions: final_permissions,
        created_at: String::new(),
        updated_at: String::new(),
    })
}

#[tauri::command]
pub fn update_user(
    state: State<'_, AppState>,
    id: i64,
    display_name: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
    max_discount_pct: Option<i32>,
    new_password: Option<String>,
    permissions: Option<Vec<String>>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    if let Some(ref name) = display_name {
        db.conn.execute("UPDATE users SET display_name = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![name.trim(), id])
            .map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(ref r) = role {
        db.conn.execute("UPDATE users SET role = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![r, id])
            .map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(active) = is_active {
        db.conn.execute("UPDATE users SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![active as i32, id])
            .map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(disc) = max_discount_pct {
        db.conn.execute("UPDATE users SET max_discount_pct = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![disc, id])
            .map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(ref perms) = permissions {
        let perms_json = serde_json::to_string(perms).unwrap_or_else(|_| "[]".to_string());
        db.conn.execute("UPDATE users SET permissions_json = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![perms_json, id])
            .map_err(|e| format!("Update permissions failed: {}", e))?;
    }
    if let Some(ref pwd) = new_password {
        if !pwd.trim().is_empty() {
            use argon2::{Argon2, password_hash::{rand_core::OsRng, PasswordHasher, SaltString}};
            let salt = SaltString::generate(&mut OsRng);
            let hash = Argon2::default().hash_password(pwd.as_bytes(), &salt)
                .map_err(|e| format!("Password hashing failed: {}", e))?.to_string();
            db.conn.execute("UPDATE users SET password_hash = ?1, plain_password = ?2, updated_at = datetime('now') WHERE id = ?3", rusqlite::params![hash, pwd, id])
                .map_err(|e| format!("Update password failed: {}", e))?;
        }
    }
    
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('update', 'user', ?1)",
        rusqlite::params![id],
    );
    
    Ok(())
}

#[tauri::command]
pub fn delete_user(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // Prevent deleting the last admin
    let admin_count: i32 = db.conn.query_row(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?1",
        rusqlite::params![id],
        |row| row.get(0),
    ).unwrap_or(0);
    
    let role: String = db.conn.query_row("SELECT role FROM users WHERE id = ?1", rusqlite::params![id], |row| row.get(0))
        .map_err(|_| "User not found".to_string())?;
    
    if role == "admin" && admin_count == 0 {
        return Err("Cannot delete the last admin user account".to_string());
    }
    
    // Hard delete user from database
    db.conn.execute("DELETE FROM users WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete failed: {}", e))?;
    
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('delete', 'user', ?1)",
        rusqlite::params![id],
    );
    
    Ok(())
}
