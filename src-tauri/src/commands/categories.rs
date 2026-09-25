use tauri::State;
use crate::AppState;
use crate::models::Category;

#[tauri::command]
pub fn get_categories(state: State<'_, AppState>, active_only: Option<bool>) -> Result<Vec<Category>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, fetch categories from Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/categories", host_ip, host_port);
        let resp = client.get(&url)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            return Err(format!("Host returned error: {}", resp.status()));
        }

        let categories: Vec<Category> = resp.json()
            .map_err(|e| format!("Invalid categories response from Host: {}", e))?;

        return Ok(categories);
    }

    let query = if active_only.unwrap_or(false) {
        "SELECT id, name, image_path, sort_order, is_active, created_at, updated_at
         FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC"
    } else {
        "SELECT id, name, image_path, sort_order, is_active, created_at, updated_at
         FROM categories ORDER BY sort_order ASC, name ASC"
    };
    
    let mut stmt = db.conn.prepare(query).map_err(|e| format!("Query error: {}", e))?;
    
    let categories = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            image_path: row.get(2)?,
            sort_order: row.get(3)?,
            is_active: row.get::<_, i32>(4)? == 1,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(categories)
}

#[tauri::command]
pub fn create_category(state: State<'_, AppState>, name: String, sort_order: Option<i32>) -> Result<Category, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward create to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/categories", host_ip, host_port);
        let payload = crate::network::server::CreateCategoryPayload {
            name: name.trim().to_string(),
            sort_order,
        };
        let resp = client.post(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;
        if !resp.status().is_success() {
            let err = resp.text().unwrap_or_else(|_| "Host error creating category".to_string());
            return Err(err);
        }
        return resp.json::<Category>().map_err(|e| format!("Invalid response from Host: {}", e));
    }
    
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Category name is required".to_string());
    }
    
    let order = sort_order.unwrap_or(0);
    
    db.conn.execute(
        "INSERT INTO categories (name, sort_order) VALUES (?1, ?2)",
        rusqlite::params![name, order],
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "A category with this name already exists".to_string()
        } else {
            format!("Failed to create category: {}", e)
        }
    })?;
    
    let id = db.conn.last_insert_rowid();
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details_json) VALUES ('create', 'category', ?1, ?2)",
        rusqlite::params![id, format!("{{\"name\":\"{}\"}}", name)],
    );
    
    let category = db.conn.query_row(
        "SELECT id, name, image_path, sort_order, is_active, created_at, updated_at FROM categories WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            image_path: row.get(2)?,
            sort_order: row.get(3)?,
            is_active: row.get::<_, i32>(4)? == 1,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        }),
    ).map_err(|e| format!("Failed to fetch category: {}", e))?;
    
    Ok(category)
}

#[tauri::command]
pub fn update_category(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    sort_order: Option<i32>,
    is_active: Option<bool>,
) -> Result<Category, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward update to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/categories/{}", host_ip, host_port, id);
        let payload = crate::network::server::UpdateCategoryPayload {
            name,
            sort_order,
            is_active,
        };
        let resp = client.put(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;
        if !resp.status().is_success() {
            let err = resp.text().unwrap_or_else(|_| "Host error updating category".to_string());
            return Err(err);
        }
        return resp.json::<Category>().map_err(|e| format!("Invalid response from Host: {}", e));
    }
    
    if let Some(ref n) = name {
        let n = n.trim();
        if n.is_empty() {
            return Err("Category name cannot be empty".to_string());
        }
        db.conn.execute(
            "UPDATE categories SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![n, id],
        ).map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "A category with this name already exists".to_string()
            } else {
                format!("Update failed: {}", e)
            }
        })?;
    }
    
    if let Some(order) = sort_order {
        db.conn.execute(
            "UPDATE categories SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![order, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    
    if let Some(active) = is_active {
        db.conn.execute(
            "UPDATE categories SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![active as i32, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('update', 'category', ?1)",
        rusqlite::params![id],
    );
    
    let category = db.conn.query_row(
        "SELECT id, name, image_path, sort_order, is_active, created_at, updated_at FROM categories WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            image_path: row.get(2)?,
            sort_order: row.get(3)?,
            is_active: row.get::<_, i32>(4)? == 1,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        }),
    ).map_err(|_| "Category not found".to_string())?;
    
    Ok(category)
}

#[tauri::command]
pub fn delete_category(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward delete to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/categories/{}", host_ip, host_port, id);
        let resp = client.delete(&url)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;
        if !resp.status().is_success() {
            let err = resp.text().unwrap_or_else(|_| "Host error deleting category".to_string());
            return Err(err);
        }
        return Ok(());
    }
    
    // Delete any products assigned to this category
    let _ = db.conn.execute("DELETE FROM products WHERE category_id = ?1", rusqlite::params![id]);
    
    // Delete category permanently from database
    db.conn.execute(
        "DELETE FROM categories WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Delete failed: {}", e))?;
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('delete', 'category', ?1)",
        rusqlite::params![id],
    );
    
    Ok(())
}
