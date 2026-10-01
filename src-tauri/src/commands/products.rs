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
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/products", host_ip, host_port);
        let mut req = client.get(&url);
        if let Some(cat) = category_id {
            req = req.query(&[("category_id", cat.to_string())]);
        }
        if let Some(active) = active_only {
            req = req.query(&[("active_only", active.to_string())]);
        }
        if let Some(p) = page {
            req = req.query(&[("page", p.to_string())]);
        }
        if let Some(ps) = page_size {
            req = req.query(&[("page_size", ps.to_string())]);
        }

        let resp = req
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
        conditions.push("(c.is_active IS NULL OR c.is_active = 1)".to_string());
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
                p.barcode, p.is_active, COALESCE(p.is_restockable, 0), COALESCE(p.buying_price_paise, 0),
                COALESCE(i.current_stock, 0), p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
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
        |row| map_product_row(row),
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
    get_product_by_id(&db.conn, id)
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
    is_restockable: Option<bool>,
    buying_price_paise: Option<i64>,
    initial_stock: Option<i32>,
) -> Result<Product, String> {
    crate::commands::auth::require_screen_access("products")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward create to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/products", host_ip, host_port);
        let payload = crate::network::server::CreateProductPayload {
            name: name.trim().to_string(),
            category_id,
            selling_price_paise,
            gst_enabled,
            gst_percentage_x100,
            image_path,
            is_restockable,
            buying_price_paise,
            initial_stock,
        };
        let resp = client.post(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;
        if !resp.status().is_success() {
            let err = resp.text().unwrap_or_else(|_| "Host error creating product".to_string());
            return Err(err);
        }
        return resp.json::<Product>().map_err(|e| format!("Invalid response from Host: {}", e));
    }
    
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Product name is required".to_string());
    }
    if selling_price_paise < 0 {
        return Err("Price cannot be negative".to_string());
    }

    // Check for duplicate product name (case-insensitive)
    let exists: bool = db.conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM products WHERE LOWER(TRIM(name)) = LOWER(?1))",
        rusqlite::params![name],
        |r| r.get(0),
    ).unwrap_or(false);
    if exists {
        return Err("A product with this name already exists. Please choose a different name.".to_string());
    }
    
    // Generate product code
    let product_code = generate_product_code(&db.conn)?;
    
    let gst_on = gst_enabled.unwrap_or(false);
    let gst_pct = gst_percentage_x100.unwrap_or(0);
    let is_restock = is_restockable.unwrap_or(false);
    let buying_rate = buying_price_paise.unwrap_or(0).max(0);
    let count = initial_stock.unwrap_or(0).max(0);
    
    db.conn.execute(
        "INSERT INTO products (product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, image_path, is_restockable, buying_price_paise)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![product_code, name, category_id, selling_price_paise, gst_on as i32, gst_pct, image_path, is_restock as i32, buying_rate],
    ).map_err(|e| format!("Failed to create product: {}", e))?;
    
    let id = db.conn.last_insert_rowid();

    // If restockable, initialize stock count in inventory table
    if is_restock {
        db.conn.execute(
            "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(product_id) DO UPDATE SET current_stock = ?2, updated_at = datetime('now')",
            rusqlite::params![id, count],
        ).map_err(|e| format!("Failed to initialize inventory: {}", e))?;

        if count > 0 {
            // Record opening stock movement
            db.conn.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, notes) VALUES (?1, ?2, 'opening', 'Initial stock purchase')",
                rusqlite::params![id, count],
            ).map_err(|e| format!("Failed to record stock movement: {}", e))?;

            // Auto-create Expense if buying_rate > 0
            if buying_rate > 0 {
                let _ = record_stock_purchase_expense(
                    &db.conn,
                    Some(id),
                    &name,
                    &product_code,
                    count,
                    buying_rate,
                    None,
                    None,
                );
            }
        }
    }
    
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
    is_restockable: Option<bool>,
    buying_price_paise: Option<i64>,
) -> Result<Product, String> {
    crate::commands::auth::require_screen_access("products")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward update to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/products/{}", host_ip, host_port, id);
        let payload = crate::network::server::UpdateProductPayload {
            name,
            category_id,
            selling_price_paise,
            gst_enabled,
            gst_percentage_x100,
            is_active,
            image_path,
            is_restockable,
            buying_price_paise,
        };
        let resp = client.put(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;
        if !resp.status().is_success() {
            let err = resp.text().unwrap_or_else(|_| "Host error updating product".to_string());
            return Err(err);
        }
        return resp.json::<Product>().map_err(|e| format!("Invalid response from Host: {}", e));
    }
    
    if let Some(ref n) = name {
        let n = n.trim();
        if n.is_empty() {
            return Err("Product name cannot be empty".to_string());
        }
        // Check for duplicate product name on another product
        let exists: bool = db.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM products WHERE LOWER(TRIM(name)) = LOWER(?1) AND id != ?2)",
            rusqlite::params![n, id],
            |r| r.get(0),
        ).unwrap_or(false);
        if exists {
            return Err("A product with this name already exists. Please choose a different name.".to_string());
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
    if let Some(restock) = is_restockable {
        db.conn.execute(
            "UPDATE products SET is_restockable = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![restock as i32, id],
        ).map_err(|e| format!("Update failed: {}", e))?;
    }
    if let Some(buying_price) = buying_price_paise {
        db.conn.execute(
            "UPDATE products SET buying_price_paise = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![buying_price.max(0), id],
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
pub fn restock_product(
    state: State<'_, AppState>,
    product_id: i64,
    quantity: i32,
    buying_price_paise: i64,
    selling_price_paise: Option<i64>,
    payment_method: Option<String>,
    notes: Option<String>,
) -> Result<Product, String> {
    crate::commands::auth::require_screen_access("products")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    if quantity <= 0 {
        return Err("Restock quantity must be greater than zero".to_string());
    }
    if buying_price_paise < 0 {
        return Err("Buying rate cannot be negative".to_string());
    }

    let product = get_product_by_id(&db.conn, product_id)?;

    // 1. Update product buying price and optionally selling price, and make sure it's marked restockable
    if let Some(sell_price) = selling_price_paise {
        if sell_price > 0 {
            db.conn.execute(
                "UPDATE products SET buying_price_paise = ?1, selling_price_paise = ?2, is_restockable = 1, updated_at = datetime('now') WHERE id = ?3",
                rusqlite::params![buying_price_paise, sell_price, product_id],
            ).map_err(|e| format!("Failed to update product: {}", e))?;
        } else {
            db.conn.execute(
                "UPDATE products SET buying_price_paise = ?1, is_restockable = 1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![buying_price_paise, product_id],
            ).map_err(|e| format!("Failed to update product: {}", e))?;
        }
    } else {
        db.conn.execute(
            "UPDATE products SET buying_price_paise = ?1, is_restockable = 1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![buying_price_paise, product_id],
        ).map_err(|e| format!("Failed to update product: {}", e))?;
    }

    // 2. Increase stock in inventory
    db.conn.execute(
        "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(product_id) DO UPDATE SET current_stock = current_stock + ?2, updated_at = datetime('now')",
        rusqlite::params![product_id, quantity],
    ).map_err(|e| format!("Failed to update inventory: {}", e))?;

    // 3. Record stock movement
    let movement_notes = notes.clone().unwrap_or_else(|| format!("Restocked {} units", quantity));
    db.conn.execute(
        "INSERT INTO stock_movements (product_id, quantity_change, movement_type, notes) VALUES (?1, ?2, 'purchase', ?3)",
        rusqlite::params![product_id, quantity, movement_notes],
    ).map_err(|e| format!("Failed to record stock movement: {}", e))?;

    // 4. Record expense if total amount > 0
    if buying_price_paise > 0 {
        record_stock_purchase_expense(
            &db.conn,
            Some(product_id),
            &product.name,
            &product.product_code,
            quantity,
            buying_price_paise,
            payment_method.as_deref(),
            None,
        )?;
    }

    // 5. Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details_json) VALUES ('restock', 'product', ?1, ?2)",
        rusqlite::params![product_id, format!("{{\"name\":\"{}\",\"qty\":{},\"rate\":{}}}", product.name, quantity, buying_price_paise)],
    );

    get_product_by_id(&db.conn, product_id)
}

#[tauri::command]
pub fn delete_product(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    crate::commands::auth::require_screen_access("products")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward delete to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();
        let url = format!("http://{}:{}/api/products/{}", host_ip, host_port, id);
        let resp = client.delete(&url)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;
        if !resp.status().is_success() {
            let err = resp.text().unwrap_or_else(|_| "Host error deleting product".to_string());
            return Err(err);
        }
        return Ok(());
    }
    
    // Unlink any bill item references so foreign keys don't restrict deletion
    let _ = db.conn.execute(
        "UPDATE bill_items SET product_id = NULL WHERE product_id = ?1",
        rusqlite::params![id],
    );
    
    // Cancel active stock purchase expenses for this product code
    if let Ok(code) = db.conn.query_row("SELECT product_code FROM products WHERE id = ?1", rusqlite::params![id], |r| r.get::<_, String>(0)) {
        let _ = db.conn.execute(
            "UPDATE expenses SET status = 'cancelled', cancelled_reason = 'Product deleted from catalog', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE reference_number = ?1 AND status = 'active'",
            rusqlite::params![code],
        );
    }

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
    
    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(cat_id) = category_id {
        (
            "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                    p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                    p.barcode, p.is_active, COALESCE(p.is_restockable, 0), COALESCE(p.buying_price_paise, 0),
                    COALESCE(i.current_stock, 0), p.created_at, p.updated_at
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN inventory i ON p.id = i.product_id
             WHERE p.is_active = 1 AND p.category_id = ?1
               AND (p.name LIKE ?2 OR p.product_code LIKE ?2)
             ORDER BY p.name ASC
             LIMIT 50".to_string(),
            vec![Box::new(cat_id), Box::new(search)],
        )
    } else {
        (
            "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                    p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                    p.barcode, p.is_active, COALESCE(p.is_restockable, 0), COALESCE(p.buying_price_paise, 0),
                    COALESCE(i.current_stock, 0), p.created_at, p.updated_at
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN inventory i ON p.id = i.product_id
             WHERE p.is_active = 1
               AND (p.name LIKE ?1 OR p.product_code LIKE ?1)
             ORDER BY p.name ASC
             LIMIT 50".to_string(),
            vec![Box::new(search)],
        )
    };
    
    let mut stmt = db.conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;
    let products: Vec<Product> = stmt.query_map(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
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
    crate::commands::auth::require_screen_access("products")?;
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

pub fn generate_product_code(conn: &rusqlite::Connection) -> Result<String, String> {
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

pub fn get_product_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Product, String> {
    conn.query_row(
        "SELECT p.id, p.product_code, p.name, p.category_id, c.name as category_name,
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                p.barcode, p.is_active, COALESCE(p.is_restockable, 0), COALESCE(p.buying_price_paise, 0),
                COALESCE(i.current_stock, 0), p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id = ?1",
        rusqlite::params![id],
        |row| map_product_row(row),
    ).map_err(|_| "Product not found".to_string())
}

pub fn map_product_row(row: &rusqlite::Row) -> rusqlite::Result<Product> {
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
        is_restockable: row.get::<_, i32>(11)? == 1,
        buying_price_paise: row.get(12)?,
        current_stock: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

pub fn record_stock_purchase_expense(
    conn: &rusqlite::Connection,
    product_id: Option<i64>,
    product_name: &str,
    product_code: &str,
    quantity: i32,
    buying_price_paise: i64,
    payment_method: Option<&str>,
    user_id: Option<i64>,
) -> Result<(), String> {
    if quantity <= 0 || buying_price_paise <= 0 {
        return Ok(());
    }

    let total_amount_paise = (quantity as i64) * buying_price_paise;
    if total_amount_paise <= 0 {
        return Ok(());
    }

    // 1. Get or create category 'Inventory & Supplies'
    let cat_id: i64 = match conn.query_row(
        "SELECT id FROM expense_categories WHERE LOWER(name) LIKE '%inventory%' AND is_active = 1 LIMIT 1",
        [],
        |r| r.get(0),
    ) {
        Ok(id) => id,
        Err(_) => {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO expense_categories (name, description, sort_order) VALUES ('Inventory & Supplies', 'Goods, inventory, and stock purchases', 4)",
                [],
            );
            conn.query_row(
                "SELECT id FROM expense_categories WHERE name = 'Inventory & Supplies' LIMIT 1",
                [],
                |r| r.get(0),
            ).unwrap_or(1)
        }
    };

    // 2. Next atomic expense number
    let next_number: i32 = conn.query_row(
        "UPDATE expense_number_seq SET last_number = last_number + 1 WHERE id = 1 RETURNING last_number",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| {
        let max_num: i32 = conn.query_row(
            "SELECT COALESCE(MAX(expense_number), 0) FROM expenses",
            [],
            |r| r.get(0),
        ).unwrap_or(0);
        let n = max_num + 1;
        let _ = conn.execute("INSERT OR REPLACE INTO expense_number_seq (id, last_number) VALUES (1, ?1)", rusqlite::params![n]);
        n
    });

    let current_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let title = format!("Stock Purchase: {} ({} units)", product_name, quantity);
    let desc = format!("Stock restock for {} ({}) - {} units @ ₹{:.2}", product_name, product_code, quantity, (buying_price_paise as f64) / 100.0);
    let pid_str = product_id.map(|id| id.to_string()).unwrap_or_default();
    let notes = format!("STOCK_PURCHASE|pid:{}|qty:{}|code:{} - Automatic stock purchase expense for item {}", pid_str, quantity, product_code, product_code);
    let method = payment_method.unwrap_or("cash");
    let uid = user_id.unwrap_or(1);

    conn.execute(
        "INSERT INTO expenses (
            expense_number, expense_date, category_id, title, description,
            amount_paise, payment_method, paid_by_user_id, payee, reference_number,
            notes, status, created_by
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active', ?12)",
        rusqlite::params![
            next_number,
            current_date,
            cat_id,
            title,
            desc,
            total_amount_paise,
            method,
            uid,
            "Supplier / Restock",
            product_code,
            notes,
            uid,
        ],
    ).map_err(|e| format!("Failed to record restock expense: {}", e))?;

    Ok(())
}

// ========== DEMO DATA COMMANDS ==========

#[tauri::command]
pub fn seed_demo_products(state: State<'_, AppState>) -> Result<usize, String> {
    crate::commands::auth::require_admin()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    crate::db::demo_data::seed_demo_data(&db.conn)
}

#[tauri::command]
pub fn clear_demo_products(state: State<'_, AppState>) -> Result<usize, String> {
    crate::commands::auth::require_admin()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    crate::db::demo_data::clear_demo_data(&db.conn)
}

// ========== PRODUCT EXPORT & IMPORT ==========

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProductExportResult {
    pub file_path: String,
    pub total_count: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProductCsvExportResult {
    pub file_path: String,
    pub csv_content: String,
    pub total_count: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProductImportSummary {
    pub total_rows: usize,
    pub created_count: usize,
    pub updated_count: usize,
    pub new_categories_count: usize,
    pub errors: Vec<String>,
}

fn get_downloads_dir() -> std::path::PathBuf {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let dl = std::path::PathBuf::from(profile).join("Downloads");
        if dl.exists() {
            return dl;
        }
    }
    std::env::current_dir().unwrap_or_default().join("reports")
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

#[tauri::command]
pub fn export_products_excel(state: State<'_, AppState>) -> Result<ProductExportResult, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let sql = "
        SELECT 
            p.product_code, p.name, COALESCE(c.name, 'General') as category_name,
            p.selling_price_paise, COALESCE(p.buying_price_paise, 0),
            COALESCE(i.current_stock, 0), COALESCE(p.is_restockable, 0),
            p.gst_enabled, p.gst_percentage_x100,
            COALESCE(p.barcode, ''), p.is_active,
            COALESCE(p.image_path, '')
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY c.sort_order ASC, p.name ASC
    ";

    let mut stmt = db.conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, i64, i64, i32, i32, i32, i32, String, i32, String)> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
                r.get(9)?,
                r.get(10)?,
                r.get(11)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    use rust_xlsxwriter::{Workbook, Format, FormatBorder, FormatAlign, Color};

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Products Catalog").map_err(|e| e.to_string())?;

    let header_format = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0x1e293b))
        .set_font_color(Color::RGB(0xffffff))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin);

    let currency_format = Format::new()
        .set_num_format("₹#,##0.00")
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin);

    let int_format = Format::new()
        .set_num_format("#,##0")
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin);

    let cell_format = Format::new().set_border(FormatBorder::Thin);
    let center_format = Format::new().set_align(FormatAlign::Center).set_border(FormatBorder::Thin);

    let headers = [
        "Product Code", "Product Name", "Category", "Selling Price (₹)", "Buying Rate (₹)",
        "Current Stock", "Restockable", "GST Enabled", "GST Rate %", "Barcode", "Active", "Image Path"
    ];

    for (col, h) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *h, &header_format)
            .map_err(|e| e.to_string())?;
    }

    for (idx, row) in rows.iter().enumerate() {
        let r_idx = (idx + 1) as u32;
        worksheet.write_string_with_format(r_idx, 0, &row.0, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 1, &row.1, &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 2, &row.2, &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_number_with_format(r_idx, 3, (row.3 as f64) / 100.0, &currency_format).map_err(|e| e.to_string())?;
        worksheet.write_number_with_format(r_idx, 4, (row.4 as f64) / 100.0, &currency_format).map_err(|e| e.to_string())?;
        worksheet.write_number_with_format(r_idx, 5, row.5 as f64, &int_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 6, if row.6 == 1 { "Yes" } else { "No" }, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 7, if row.7 == 1 { "Yes" } else { "No" }, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_number_with_format(r_idx, 8, (row.8 as f64) / 100.0, &int_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 9, &row.9, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 10, if row.10 == 1 { "Yes" } else { "No" }, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(r_idx, 11, &row.11, &cell_format).map_err(|e| e.to_string())?;
    }

    worksheet.set_column_width(0, 16).map_err(|e| e.to_string())?;
    worksheet.set_column_width(1, 32).map_err(|e| e.to_string())?;
    worksheet.set_column_width(2, 22).map_err(|e| e.to_string())?;
    worksheet.set_column_width(3, 18).map_err(|e| e.to_string())?;
    worksheet.set_column_width(4, 18).map_err(|e| e.to_string())?;
    worksheet.set_column_width(5, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(6, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(7, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(8, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(9, 16).map_err(|e| e.to_string())?;
    worksheet.set_column_width(10, 12).map_err(|e| e.to_string())?;
    worksheet.set_column_width(11, 24).map_err(|e| e.to_string())?;

    let downloads_dir = get_downloads_dir();
    let _ = std::fs::create_dir_all(&downloads_dir);
    let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    let filename = format!("Products_Catalog_{}.xlsx", now_str);
    let output_path = downloads_dir.join(&filename);
    let path_str = output_path.to_string_lossy().to_string();

    workbook.save(&output_path).map_err(|e| format!("Failed to save Excel file to Downloads: {}", e))?;

    Ok(ProductExportResult {
        file_path: path_str,
        total_count: rows.len(),
    })
}

#[tauri::command]
pub fn export_products_csv(state: State<'_, AppState>) -> Result<ProductCsvExportResult, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let sql = "
        SELECT 
            p.product_code, p.name, COALESCE(c.name, 'General') as category_name,
            p.selling_price_paise, COALESCE(p.buying_price_paise, 0),
            COALESCE(i.current_stock, 0), COALESCE(p.is_restockable, 0),
            p.gst_enabled, p.gst_percentage_x100,
            COALESCE(p.barcode, ''), p.is_active,
            COALESCE(p.image_path, '')
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY c.sort_order ASC, p.name ASC
    ";

    let mut stmt = db.conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, i64, i64, i32, i32, i32, i32, String, i32, String)> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
                r.get(9)?,
                r.get(10)?,
                r.get(11)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut csv_lines = Vec::new();
    csv_lines.push("Product Code,Product Name,Category,Selling Price (₹),Buying Rate (₹),Current Stock,Restockable,GST Enabled,GST Rate %,Barcode,Active,Image Path".to_string());

    for r in &rows {
        let line = format!(
            "{},{},{},{:.2},{:.2},{},{},{},{:.0},{},{},{}",
            csv_escape(&r.0),
            csv_escape(&r.1),
            csv_escape(&r.2),
            (r.3 as f64) / 100.0,
            (r.4 as f64) / 100.0,
            r.5,
            if r.6 == 1 { "Yes" } else { "No" },
            if r.7 == 1 { "Yes" } else { "No" },
            (r.8 as f64) / 100.0,
            csv_escape(&r.9),
            if r.10 == 1 { "Yes" } else { "No" },
            csv_escape(&r.11),
        );
        csv_lines.push(line);
    }

    let csv_content = csv_lines.join("\r\n");

    let downloads_dir = get_downloads_dir();
    let _ = std::fs::create_dir_all(&downloads_dir);
    let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    let filename = format!("Products_Catalog_{}.csv", now_str);
    let output_path = downloads_dir.join(&filename);
    let path_str = output_path.to_string_lossy().to_string();

    let _ = std::fs::write(&output_path, &csv_content);

    Ok(ProductCsvExportResult {
        file_path: path_str,
        csv_content,
        total_count: rows.len(),
    })
}

fn normalize_column_header(raw: &str) -> Option<&'static str> {
    let lower = raw.trim().to_lowercase().replace(['_', '-', ' ', '.', '₹', '%', '(', ')', '[', ']'], "");
    if lower.contains("code") || lower == "sku" {
        Some("code")
    } else if lower.contains("name") || lower == "item" || lower == "title" || lower == "product" {
        Some("name")
    } else if lower.contains("cat") || lower == "group" {
        Some("category")
    } else if lower.contains("sell") || lower == "mrp" || (lower.contains("price") && !lower.contains("buy") && !lower.contains("cost")) || (lower.contains("rate") && !lower.contains("buy") && !lower.contains("cost") && !lower.contains("tax") && !lower.contains("gst")) {
        Some("selling_price")
    } else if lower.contains("buy") || lower.contains("cost") || lower.contains("purchase") {
        Some("buying_rate")
    } else if lower.contains("stock") || lower == "qty" || lower == "quantity" || lower.contains("invent") {
        Some("stock")
    } else if lower.contains("restock") {
        Some("restockable")
    } else if lower.contains("gstenabled") || lower.contains("taxenabled") {
        Some("gst_enabled")
    } else if lower.contains("gstrate") || lower.contains("gstpct") || lower.contains("taxrate") || lower == "gst" || lower == "tax" {
        Some("gst_rate")
    } else if lower.contains("barcode") || lower == "upc" || lower == "ean" {
        Some("barcode")
    } else if lower.contains("active") || lower == "status" {
        Some("active")
    } else if lower.contains("image") || lower.contains("photo") || lower.contains("pic") {
        Some("image")
    } else {
        None
    }
}

fn parse_csv_rows(content: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut current_row = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = content.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                chars.next();
                current_field.push('"');
            } else {
                in_quotes = !in_quotes;
            }
        } else if c == ',' && !in_quotes {
            current_row.push(current_field.trim().to_string());
            current_field = String::new();
        } else if (c == '\n' || c == '\r') && !in_quotes {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            current_row.push(current_field.trim().to_string());
            if !current_row.iter().all(|f| f.is_empty()) {
                rows.push(current_row);
            }
            current_row = Vec::new();
            current_field = String::new();
        } else {
            current_field.push(c);
        }
    }

    if !current_field.is_empty() || !current_row.is_empty() {
        current_row.push(current_field.trim().to_string());
        if !current_row.iter().all(|f| f.is_empty()) {
            rows.push(current_row);
        }
    }

    rows
}

pub fn execute_product_import(
    conn: &mut rusqlite::Connection,
    raw_rows: Vec<Vec<String>>,
) -> Result<ProductImportSummary, String> {
    if raw_rows.is_empty() {
        return Err("The file contains no data rows.".to_string());
    }

    let header_row = &raw_rows[0];
    let mut col_map: std::collections::HashMap<usize, &'static str> = std::collections::HashMap::new();

    for (idx, h) in header_row.iter().enumerate() {
        if let Some(key) = normalize_column_header(h) {
            col_map.insert(idx, key);
        }
    }

    if !col_map.values().any(|&k| k == "name") {
        return Err("The file must contain a 'Product Name' column.".to_string());
    }

    // Pre-load existing categories
    let mut cat_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT id, LOWER(TRIM(name)) FROM categories").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
        for r in rows.flatten() {
            cat_map.insert(r.1, r.0);
        }
    }

    let mut created_count = 0;
    let mut updated_count = 0;
    let mut new_categories_count = 0;
    let mut errors = Vec::new();

    let tx = conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    for (row_idx, row) in raw_rows.iter().skip(1).enumerate() {
        let mut row_dict: std::collections::HashMap<&'static str, String> = std::collections::HashMap::new();
        for (col_idx, val) in row.iter().enumerate() {
            if let Some(&key) = col_map.get(&col_idx) {
                row_dict.insert(key, val.trim().to_string());
            }
        }

        let name = row_dict.get("name").cloned().unwrap_or_default();
        if name.is_empty() {
            continue; // Skip empty product names
        }

        let code = row_dict.get("code").cloned().unwrap_or_default();
        let cat_name = row_dict.get("category").cloned().unwrap_or_else(|| "General".to_string());
        let cat_clean = if cat_name.is_empty() { "General".to_string() } else { cat_name };

        // 1. Resolve Category
        let cat_key = cat_clean.to_lowercase();
        let category_id = match cat_map.get(&cat_key) {
            Some(&id) => id,
            None => {
                let cat_svg = crate::db::demo_data::generate_category_svg(&cat_clean);
                let _ = tx.execute(
                    "INSERT INTO categories (name, sort_order, image_path, is_active)
                     VALUES (?1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?2, 1)",
                    rusqlite::params![cat_clean, cat_svg],
                );
                let new_id = tx.last_insert_rowid();
                cat_map.insert(cat_key, new_id);
                new_categories_count += 1;
                new_id
            }
        };

        // 2. Parse numbers
        let selling_price_paise = {
            let s = row_dict.get("selling_price").cloned().unwrap_or_default()
                .replace(['₹', ',', ' '], "");
            (s.parse::<f64>().unwrap_or(0.0) * 100.0).round() as i64
        };

        let is_restockable = {
            if let Some(r) = row_dict.get("restockable") {
                let rl = r.to_lowercase();
                rl == "yes" || rl == "y" || rl == "true" || rl == "1"
            } else {
                true // default to true
            }
        };

        let buying_price_paise = {
            let s = row_dict.get("buying_rate").cloned().unwrap_or_default()
                .replace(['₹', ',', ' '], "");
            let parsed = (s.parse::<f64>().unwrap_or(0.0) * 100.0).round() as i64;
            if parsed > 0 {
                parsed
            } else if is_restockable && selling_price_paise > 0 {
                (selling_price_paise as f64 * 0.6).round() as i64
            } else {
                0
            }
        };

        let stock_count = {
            let s = row_dict.get("stock").cloned().unwrap_or_default()
                .replace([',', ' '], "");
            s.parse::<i32>().unwrap_or(0)
        };

        let gst_enabled = {
            if let Some(g) = row_dict.get("gst_enabled") {
                let gl = g.to_lowercase();
                gl == "yes" || gl == "y" || gl == "true" || gl == "1"
            } else {
                false
            }
        };

        let gst_percentage_x100 = {
            let s = row_dict.get("gst_rate").cloned().unwrap_or_default()
                .replace(['%', ' '], "");
            (s.parse::<f64>().unwrap_or(0.0) * 100.0).round() as i32
        };

        let barcode = row_dict.get("barcode").cloned().unwrap_or_default();
        let is_active = {
            if let Some(a) = row_dict.get("active") {
                let al = a.to_lowercase();
                al != "no" && al != "0" && al != "false" && al != "inactive"
            } else {
                true
            }
        };

        let image_path = row_dict.get("image").cloned().unwrap_or_default();

        // 3. Check if product already exists (by code or by name)
        let existing_prod: Option<(i64, String, Option<String>)> = if !code.is_empty() {
            tx.query_row(
                "SELECT id, product_code, image_path FROM products WHERE product_code = ?1 LIMIT 1",
                rusqlite::params![code],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            ).ok()
        } else {
            tx.query_row(
                "SELECT id, product_code, image_path FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?1)) LIMIT 1",
                rusqlite::params![name],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            ).ok()
        };

        if let Some((existing_id, _prod_code, cur_img)) = existing_prod {
            // Update existing product
            let final_img = if !image_path.is_empty() {
                image_path
            } else {
                cur_img.unwrap_or_else(|| crate::db::demo_data::generate_product_svg(&name, &cat_clean, "general"))
            };

            let res = tx.execute(
                "UPDATE products SET
                    name = ?1, category_id = ?2, selling_price_paise = ?3, buying_price_paise = ?4,
                    is_restockable = ?5, gst_enabled = ?6, gst_percentage_x100 = ?7, barcode = ?8,
                    is_active = ?9, image_path = ?10, updated_at = datetime('now')
                 WHERE id = ?11",
                rusqlite::params![
                    name,
                    category_id,
                    selling_price_paise,
                    buying_price_paise,
                    if is_restockable { 1 } else { 0 },
                    if gst_enabled { 1 } else { 0 },
                    gst_percentage_x100,
                    barcode,
                    if is_active { 1 } else { 0 },
                    final_img,
                    existing_id,
                ],
            );

            if let Err(e) = res {
                errors.push(format!("Row {}: Failed to update '{}': {}", row_idx + 2, name, e));
                continue;
            }

            // Update inventory
            let _ = tx.execute(
                "INSERT INTO inventory (product_id, current_stock, low_stock_threshold, updated_at)
                 VALUES (?1, ?2, 5, datetime('now'))
                 ON CONFLICT(product_id) DO UPDATE SET current_stock = ?2, updated_at = datetime('now')",
                rusqlite::params![existing_id, stock_count],
            );

            // Record movement
            let _ = tx.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, notes)
                 VALUES (?1, ?2, 'adjustment', 'Catalog Import update')",
                rusqlite::params![existing_id, stock_count],
            );

            updated_count += 1;
        } else {
            // Create new product
            let prod_code = if !code.is_empty() {
                code
            } else {
                match generate_product_code(&tx) {
                    Ok(c) => c,
                    Err(_) => format!("PRD-{:06}", row_idx + 100),
                }
            };

            let final_img = if !image_path.is_empty() {
                image_path
            } else {
                crate::db::demo_data::generate_product_svg(&name, &cat_clean, "general")
            };

            let res = tx.execute(
                "INSERT INTO products (
                    product_code, name, category_id, image_path, selling_price_paise, buying_price_paise,
                    is_restockable, gst_enabled, gst_percentage_x100, barcode, is_active
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    prod_code,
                    name,
                    category_id,
                    final_img,
                    selling_price_paise,
                    buying_price_paise,
                    if is_restockable { 1 } else { 0 },
                    if gst_enabled { 1 } else { 0 },
                    gst_percentage_x100,
                    barcode,
                    if is_active { 1 } else { 0 },
                ],
            );

            if let Err(e) = res {
                errors.push(format!("Row {}: Failed to create '{}': {}", row_idx + 2, name, e));
                continue;
            }

            let new_id = tx.last_insert_rowid();

            // Insert inventory
            let _ = tx.execute(
                "INSERT INTO inventory (product_id, current_stock, low_stock_threshold, updated_at)
                 VALUES (?1, ?2, 5, datetime('now'))
                 ON CONFLICT(product_id) DO UPDATE SET current_stock = ?2, updated_at = datetime('now')",
                rusqlite::params![new_id, stock_count],
            );

            // Record opening stock
            let _ = tx.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, notes)
                 VALUES (?1, ?2, 'opening', 'Catalog Import new product')",
                rusqlite::params![new_id, stock_count],
            );

            created_count += 1;
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit product import: {}", e))?;

    Ok(ProductImportSummary {
        total_rows: raw_rows.len().saturating_sub(1),
        created_count,
        updated_count,
        new_categories_count,
        errors,
    })
}

#[tauri::command]
pub fn import_products_csv(state: State<'_, AppState>, csv_content: String) -> Result<ProductImportSummary, String> {
    crate::commands::auth::require_screen_access("products")?;
    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let raw_rows = parse_csv_rows(&csv_content);
    execute_product_import(&mut db.conn, raw_rows)
}

#[tauri::command]
pub fn import_products_excel(state: State<'_, AppState>, file_path: String) -> Result<ProductImportSummary, String> {
    crate::commands::auth::require_screen_access("products")?;
    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    if file_path.ends_with(".csv") {
        let content = std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read CSV file: {}", e))?;
        let raw_rows = parse_csv_rows(&content);
        return execute_product_import(&mut db.conn, raw_rows);
    }

    use calamine::Reader;
    let mut workbook: calamine::Xlsx<_> = calamine::open_workbook(&file_path)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let sheet_name = workbook.sheet_names()
        .into_iter()
        .next()
        .ok_or_else(|| "Workbook has no sheets.".to_string())?;

    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet '{}': {}", sheet_name, e))?;

    let mut raw_rows = Vec::new();
    for row in range.rows() {
        let string_cells: Vec<String> = row.iter().map(|c| c.to_string().trim().to_string()).collect();
        if !string_cells.iter().all(|s| s.is_empty()) {
            raw_rows.push(string_cells);
        }
    }

    execute_product_import(&mut db.conn, raw_rows)
}
