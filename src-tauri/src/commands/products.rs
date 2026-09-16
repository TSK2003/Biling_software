use tauri::State;
use crate::AppState;
use crate::models::{Product, PaginatedResponse};

#[tauri::command]
pub fn get_products(
    state: State<'_, AppState>,
    category_id: Option<i64>,
    active_only: Option<bool>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<PaginatedResponse<Product>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, fetch products from Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("http://{}:{}/api/products", host_ip, host_port);
        let resp = client.get(&url)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            return Err(format!("Host returned error: {}", resp.status()));
        }

        let products: Vec<Product> = resp.json()
            .map_err(|e| format!("Invalid products response from Host: {}", e))?;

        let total = products.len() as i64;
        return Ok(PaginatedResponse {
            data: products,
            total,
            page: 1,
            page_size: total as i32,
            total_pages: 1,
        });
    }

    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(50).min(200);
    let offset = (page - 1) * page_size;
    
    let mut conditions = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    
    if active_only.unwrap_or(true) {
        conditions.push("p.is_active = 1".to_string());
    }
    
    if let Some(cat_id) = category_id {
        conditions.push(format!("p.category_id = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(cat_id));
    }
    
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    
    // Get total count
    let count_sql = format!(
        "SELECT COUNT(*) FROM products p {}",
        where_clause
    );
    let total: i64 = db.conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
        |row| row.get(0),
    ).unwrap_or(0);
    
    // Get paginated data
    let query = format!(
        "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                p.barcode, p.is_active, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         {}
         ORDER BY p.name ASC
         LIMIT ?{} OFFSET ?{}",
        where_clause,
        params_vec.len() + 1,
        params_vec.len() + 2
    );
    
    params_vec.push(Box::new(page_size));
    params_vec.push(Box::new(offset));
    
    let mut stmt = db.conn.prepare(&query).map_err(|e| format!("Query error: {}", e))?;
    
    let products: Vec<Product> = stmt.query_map(
        rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
        |row| {
            Ok(Product {
                id: row.get(0)?,
                product_code: row.get(1)?,
                name: row.get(2)?,
                category_id: row.get(3)?,
                category_name: row.get(4)?,
                image_path: row.get(5)?,
                selling_price_paise: row.get(6)?,
                gst_enabled: row.get::<_, i32>(7)? == 1,
                gst_percentage_x100: row.get(8)?,
                barcode: row.get(9)?,
                is_active: row.get::<_, i32>(10)? == 1,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        },
    ).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    let total_pages = ((total as f64) / (page_size as f64)).ceil() as i32;
    
    Ok(PaginatedResponse {
        data: products,
        total,
        page,
        page_size,
        total_pages,
    })
}

#[tauri::command]
pub fn get_product(state: State<'_, AppState>, id: i64) -> Result<Product, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    db.conn.query_row(
        "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                p.barcode, p.is_active, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = ?1",
        rusqlite::params![id],
        |row| Ok(Product {
            id: row.get(0)?,
            product_code: row.get(1)?,
            name: row.get(2)?,
            category_id: row.get(3)?,
            category_name: row.get(4)?,
            image_path: row.get(5)?,
            selling_price_paise: row.get(6)?,
            gst_enabled: row.get::<_, i32>(7)? == 1,
            gst_percentage_x100: row.get(8)?,
            barcode: row.get(9)?,
            is_active: row.get::<_, i32>(10)? == 1,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        }),
    ).map_err(|_| "Product not found".to_string())
}

#[tauri::command]
pub fn create_product(
    state: State<'_, AppState>,
    name: String,
    category_id: i64,
    selling_price_paise: i64,
    gst_enabled: Option<bool>,
    gst_percentage_x100: Option<i32>,
    image_path: Option<String>,
) -> Result<Product, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Product name is required".to_string());
    }
    if selling_price_paise < 0 {
        return Err("Price cannot be negative".to_string());
    }
    
    // Generate product code
    let product_code = generate_product_code(&db.conn)?;
    
    let gst_on = gst_enabled.unwrap_or(false);
    let gst_pct = gst_percentage_x100.unwrap_or(0);
    
    db.conn.execute(
        "INSERT INTO products (product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, image_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![product_code, name, category_id, selling_price_paise, gst_on as i32, gst_pct, image_path],
    ).map_err(|e| format!("Failed to create product: {}", e))?;
    
    let id = db.conn.last_insert_rowid();
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details_json) VALUES ('create', 'product', ?1, ?2)",
        rusqlite::params![id, format!("{{\"name\":\"{}\",\"code\":\"{}\"}}", name, product_code)],
    );
    
    get_product_by_id(&db.conn, id)
}

#[tauri::command]
pub fn update_product(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    category_id: Option<i64>,
    selling_price_paise: Option<i64>,
    gst_enabled: Option<bool>,
    gst_percentage_x100: Option<i32>,
    is_active: Option<bool>,
    image_path: Option<String>,
) -> Result<Product, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    if let Some(ref n) = name {
        let n = n.trim();
        if n.is_empty() {
            return Err("Product name cannot be empty".to_string());
        }
        db.conn.execute(
            "UPDATE products SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![n, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(cat_id) = category_id {
        db.conn.execute(
            "UPDATE products SET category_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![cat_id, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(price) = selling_price_paise {
        if price < 0 {
            return Err("Price cannot be negative".to_string());
        }
        db.conn.execute(
            "UPDATE products SET selling_price_paise = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![price, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(gst) = gst_enabled {
        db.conn.execute(
            "UPDATE products SET gst_enabled = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![gst as i32, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(pct) = gst_percentage_x100 {
        db.conn.execute(
            "UPDATE products SET gst_percentage_x100 = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![pct, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(active) = is_active {
        db.conn.execute(
            "UPDATE products SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![active as i32, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(ref img) = image_path {
        db.conn.execute(
            "UPDATE products SET image_path = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![if img.is_empty() { None } else { Some(img.as_str()) }, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('update', 'product', ?1)",
        rusqlite::params![id],
    );
    
    get_product_by_id(&db.conn, id)
}

#[tauri::command]
pub fn delete_product(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // Unlink any bill item references so foreign keys don't restrict deletion
    let _ = db.conn.execute(
        "UPDATE bill_items SET product_id = NULL WHERE product_id = ?1",
        rusqlite::params![id],
    );
    
    // Delete product permanently from database
    db.conn.execute(
        "DELETE FROM products WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Delete failed: {}", e))?;
    
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('delete', 'product', ?1)",
        rusqlite::params![id],
    );
    
    Ok(())
}

#[tauri::command]
pub fn search_products(
    state: State<'_, AppState>,
    query: String,
    category_id: Option<i64>,
) -> Result<Vec<Product>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let search = format!("%{}%", query.trim());
    
    let sql = if let Some(cat_id) = category_id {
        let mut stmt = db.conn.prepare(
            "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                    p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                    p.barcode, p.is_active, p.created_at, p.updated_at
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.is_active = 1 AND p.category_id = ?1
               AND (p.name LIKE ?2 OR p.product_code LIKE ?2)
             ORDER BY p.name ASC
             LIMIT 50"
        ).map_err(|e| format!("Query error: {}", e))?;
        
        let results: Vec<Product> = stmt.query_map(
            rusqlite::params![cat_id, search],
            |row| map_product_row(row),
        ).map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
        
        return Ok(results);
    } else {
        "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                p.barcode, p.is_active, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_active = 1
           AND (p.name LIKE ?1 OR p.product_code LIKE ?1)
         ORDER BY p.name ASC
         LIMIT 50"
    };
    
    let mut stmt = db.conn.prepare(sql).map_err(|e| format!("Query error: {}", e))?;
    let products: Vec<Product> = stmt.query_map(
        rusqlite::params![search],
        |row| map_product_row(row),
    ).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(products)
}

#[tauri::command]
pub fn upload_product_image(
    state: State<'_, AppState>,
    product_id: i64,
    source_path: String,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // Get product code for filename
    let product_code: String = db.conn.query_row(
        "SELECT product_code FROM products WHERE id = ?1",
        rusqlite::params![product_id],
        |row| row.get(0),
    ).map_err(|_| "Product not found".to_string())?;
    
    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err("Source file not found".to_string());
    }
    
    let ext = source.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();
    
    let dest_dir = db.data_dir.join("images").join("products");
    let dest_filename = format!("{}.{}", product_code, ext);
    let dest_path = dest_dir.join(&dest_filename);
    
    // Copy and optionally resize
    std::fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to copy image: {}", e))?;
    
    // Update product
    let relative_path = format!("images/products/{}", dest_filename);
    db.conn.execute(
        "UPDATE products SET image_path = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![relative_path, product_id],
    ).map_err(|e| format!("Failed to update product: {}", e))?;
    
    Ok(relative_path)
}

// Helper functions

fn generate_product_code(conn: &rusqlite::Connection) -> Result<String, String> {
    // Atomically increment the sequence
    conn.execute(
        "UPDATE product_code_seq SET last_code = last_code + 1 WHERE id = 1",
        [],
    ).map_err(|e| format!("Failed to generate code: {}", e))?;
    
    let last_code: i32 = conn.query_row(
        "SELECT last_code FROM product_code_seq WHERE id = 1",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to read code: {}", e))?;
    
    Ok(format!("PRD-{:06}", last_code))
}

fn get_product_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Product, String> {
    conn.query_row(
        "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                p.barcode, p.is_active, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = ?1",
        rusqlite::params![id],
        |row| map_product_row(row),
    ).map_err(|_| "Product not found".to_string())
}

fn map_product_row(row: &rusqlite::Row) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        product_code: row.get(1)?,
        name: row.get(2)?,
        category_id: row.get(3)?,
        category_name: row.get(4)?,
        image_path: row.get(5)?,
        selling_price_paise: row.get(6)?,
        gst_enabled: row.get::<_, i32>(7)? == 1,
        gst_percentage_x100: row.get(8)?,
        barcode: row.get(9)?,
        is_active: row.get::<_, i32>(10)? == 1,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}
