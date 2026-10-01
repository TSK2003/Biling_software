use tauri::State;
use crate::AppState;
use crate::models::{User, LoginResponse};
use crate::commands::users::parse_user_permissions;

/// Current session state (in-memory)
use std::sync::Mutex;

static CURRENT_USER: std::sync::LazyLock<Mutex<Option<User>>> = 
    std::sync::LazyLock::new(|| Mutex::new(None));

#[tauri::command]
pub fn login(state: State<'_, AppState>, username: String, password: String) -> Result<LoginResponse, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, authenticate with Host PC over LAN
    let network_mode: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'network_mode'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "host".to_string());

    if network_mode == "client" {
        let host_ip: String = db.conn.query_row(
            "SELECT value FROM settings WHERE key = 'client_host_ip'",
            [],
            |r| r.get(0),
        ).unwrap_or_else(|_| "127.0.0.1".to_string());
        
        let host_port: String = db.conn.query_row(
            "SELECT value FROM settings WHERE key = 'client_host_port'",
            [],
            |r| r.get(0),
        ).unwrap_or_else(|_| "4123".to_string());

        let url = format!("http://{}:{}/api/auth/login", host_ip.trim(), host_port.trim());
        let client = crate::network::client::get_http_client();

        let body = serde_json::json!({
            "username": username.trim(),
            "password": password
        });

        let resp = client.post(&url)
            .json(&body)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            let err_text = resp.text().unwrap_or_else(|_| "Invalid username or password".to_string());
            return Err(err_text);
        }

        let login_resp: LoginResponse = resp.json()
            .map_err(|e| format!("Invalid response from Shop Main Computer: {}", e))?;

        let mut current = CURRENT_USER.lock().map_err(|_| "Session error".to_string())?;
        *current = Some(login_resp.user.clone());

        // Persist active user session in local SQLite settings
        let _ = db.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('active_user_id', ?1)",
            rusqlite::params![login_resp.user.id.to_string()],
        );

        return Ok(login_resp);
    }

    // Host mode: Find user in local SQLite database
    let mut stmt = db.conn.prepare(
        "SELECT id, username, display_name, password_hash, role, is_active, max_discount_pct, permissions_json, created_at, updated_at
         FROM users WHERE username = ?1 COLLATE NOCASE"
    ).map_err(|e| format!("Query error: {}", e))?;
    
    let user_result = stmt.query_row(rusqlite::params![username], |row| {
        let password_hash: String = row.get(3)?;
        let role: String = row.get(4)?;
        let permissions_json: Option<String> = row.get(7).ok();
        let permissions = parse_user_permissions(&role, permissions_json);
        
        Ok((
            User {
                id: row.get(0)?,
                username: row.get(1)?,
                display_name: row.get(2)?,
                role,
                is_active: row.get::<_, i32>(5)? == 1,
                max_discount_pct: row.get(6)?,
                permissions,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            },
            password_hash,
        ))
    }).map_err(|_| "Invalid username or password".to_string())?;
    
    let (user, password_hash) = user_result;
    
    // Check if user is active
    if !user.is_active {
        return Err("Account is deactivated. Contact admin.".to_string());
    }
    
    // Verify password with argon2 — no cleartext fallback, no hardcoded passwords
    use argon2::{Argon2, PasswordHash, PasswordVerifier};
    
    let parsed_hash = PasswordHash::new(&password_hash)
        .map_err(|_| "Invalid username or password".to_string())?;
    
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| "Invalid username or password".to_string())?;
    
    // Set current user session
    let mut current = CURRENT_USER.lock().map_err(|_| "Session error".to_string())?;
    *current = Some(user.clone());
    
    // Persist active user session in SQLite settings across restarts & refreshes
    let _ = db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('active_user_id', ?1)",
        rusqlite::params![user.id.to_string()],
    );

    // Create session token (simple UUID for local app)
    let token = uuid::Uuid::new_v4().to_string();
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES (?1, 'login', 'user', ?2)",
        rusqlite::params![user.id, user.id],
    );
    
    Ok(LoginResponse {
        user,
        session_token: token,
    })
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let mut current = CURRENT_USER.lock().map_err(|_| "Session error".to_string())?;
    if let Some(user) = current.as_ref() {
        let _ = db.conn.execute(
            "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES (?1, 'logout', 'user', ?2)",
            rusqlite::params![user.id, user.id],
        );
    }
    *current = None;

    // Clear persistent active user session from SQLite
    let _ = db.conn.execute("DELETE FROM settings WHERE key = 'active_user_id'", []);

    Ok(())
}

#[tauri::command]
pub fn get_current_user(state: State<'_, AppState>) -> Result<Option<User>, String> {
    let mut current = CURRENT_USER.lock().map_err(|_| "Session error".to_string())?;
    if let Some(user) = current.as_ref() {
        return Ok(Some(user.clone()));
    }

    // Attempt to rehydrate from persistent SQLite active_user_id
    if let Ok(db) = state.db.lock() {
        if let Ok(uid_str) = db.conn.query_row::<String, _, _>(
            "SELECT value FROM settings WHERE key = 'active_user_id'",
            [],
            |r| r.get(0),
        ) {
            if let Ok(uid) = uid_str.trim().parse::<i64>() {
                let mut stmt = match db.conn.prepare(
                    "SELECT id, username, display_name, role, is_active, max_discount_pct, permissions_json, created_at, updated_at
                     FROM users WHERE id = ?1 AND is_active = 1"
                ) {
                    Ok(s) => s,
                    Err(_) => return Ok(None),
                };

                if let Ok(user) = stmt.query_row(rusqlite::params![uid], |row| {
                    let role: String = row.get(3)?;
                    let permissions_json: Option<String> = row.get(6).ok();
                    let permissions = parse_user_permissions(&role, permissions_json);
                    Ok(User {
                        id: row.get(0)?,
                        username: row.get(1)?,
                        display_name: row.get(2)?,
                        role,
                        is_active: row.get::<_, i32>(4)? == 1,
                        max_discount_pct: row.get(5)?,
                        permissions,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                }) {
                    *current = Some(user.clone());
                    return Ok(Some(user));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn change_password(
    state: State<'_, AppState>,
    user_id: i64,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // Get current hash
    let current_hash: String = db.conn.query_row(
        "SELECT password_hash FROM users WHERE id = ?1",
        rusqlite::params![user_id],
        |row| row.get(0),
    ).map_err(|_| "User not found".to_string())?;
    
    // Verify old password
    use argon2::{Argon2, PasswordHash, PasswordVerifier, password_hash::{rand_core::OsRng, PasswordHasher, SaltString}};
    let parsed_hash = PasswordHash::new(&current_hash)
        .map_err(|_| "Internal error".to_string())?;
    
    Argon2::default()
        .verify_password(old_password.as_bytes(), &parsed_hash)
        .map_err(|_| "Current password is incorrect".to_string())?;
    
    // Validate new password
    if new_password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }
    
    // Hash new password
    let salt = SaltString::generate(&mut OsRng);
    let new_hash = Argon2::default()
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {}", e))?
        .to_string();
    
    // Update password hash only — never store cleartext passwords
    db.conn.execute(
        "UPDATE users SET password_hash = ?1, plain_password = NULL, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![new_hash, user_id],
    ).map_err(|e| format!("Update failed: {}", e))?;
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES (?1, 'change_password', 'user', ?2)",
        rusqlite::params![user_id, user_id],
    );
    
    Ok(())
}

/// Get the currently authenticated user from the backend session.
/// This is the AUTHORITATIVE identity — never trust frontend-supplied user IDs for authorization.
pub fn get_authenticated_user() -> Result<User, String> {
    let current = CURRENT_USER.lock().map_err(|_| "Session error".to_string())?;
    current.clone().ok_or_else(|| "Authentication required. Please log in.".to_string())
}

/// Require that the current user has access to a specific screen/module.
pub fn require_screen_access(screen: &str) -> Result<User, String> {
    let user = get_authenticated_user()?;
    if user.role == "admin" {
        return Ok(user);
    }
    if user.permissions.contains(&screen.to_string()) {
        return Ok(user);
    }
    Err(format!("Access denied. You do not have permission to access '{}'.", screen))
}

/// Require that the current user is an administrator.
pub fn require_admin() -> Result<User, String> {
    let user = get_authenticated_user()?;
    if user.role == "admin" {
        return Ok(user);
    }
    Err("Access denied. Administrator privileges required.".to_string())
}
