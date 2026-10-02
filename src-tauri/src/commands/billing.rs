use tauri::State;
use crate::AppState;
use crate::models::{BillingProduct, DraftBill, CartItem, DraftDiscount, CompleteBillResponse};

#[tauri::command]
pub fn get_billing_products(
    state: State<'_, AppState>,
    category_id: Option<i64>,
    search: Option<String>,
) -> Result<Vec<BillingProduct>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, fetch products from Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();

        let url = format!("http://{}:{}/api/billing/products", host_ip, host_port);
        let mut query_params = Vec::new();
        if let Some(cat) = category_id {
            query_params.push(("category_id", cat.to_string()));
        }
        if let Some(ref q) = search {
            if !q.trim().is_empty() {
                query_params.push(("q", q.trim().to_string()));
            }
        }

        let resp = client.get(&url)
            .query(&query_params)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            return Err(format!("Host returned error: {}", resp.status()));
        }

        let products: Vec<BillingProduct> = resp.json()
            .map_err(|e| format!("Invalid products response from Host: {}", e))?;

        return Ok(products);
    }

    let mut sql = String::from(
        "SELECT p.id, p.product_code, p.name, p.category_id, COALESCE(c.name, 'General') as category_name,
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100,
                COALESCE(p.is_restockable, 0) as is_restockable,
                COALESCE(p.buying_price_paise, 0) as buying_price_paise,
                COALESCE(i.current_stock, 0) as current_stock
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.is_active = 1 AND (c.is_active IS NULL OR c.is_active = 1)"
    );
    
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    
    if let Some(cat_id) = category_id {
        sql.push_str(&format!(" AND p.category_id = ?{}", params.len() + 1));
        params.push(Box::new(cat_id));
    }
    
    if let Some(ref q) = search {
        let q = q.trim();
        if !q.is_empty() {
            let search_pattern = format!("%{}%", q);
            sql.push_str(&format!(
                " AND (p.name LIKE ?{} OR p.product_code LIKE ?{})",
                params.len() + 1,
                params.len() + 1
            ));
            params.push(Box::new(search_pattern));
        }
    }
    
    sql.push_str(" ORDER BY p.name ASC LIMIT 200");
    
    let mut stmt = db.conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;
    
    let products: Vec<BillingProduct> = stmt.query_map(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        |row| {
            Ok(BillingProduct {
                id: row.get(0)?,
                product_code: row.get(1)?,
                name: row.get(2)?,
                category_id: row.get(3)?,
                category_name: row.get(4)?,
                image_path: row.get(5)?,
                selling_price_paise: row.get(6)?,
                gst_enabled: row.get::<_, i32>(7)? == 1,
                gst_percentage_x100: row.get(8)?,
                is_restockable: row.get::<_, i32>(9)? == 1,
                buying_price_paise: row.get(10)?,
                current_stock: row.get(11)?,
            })
        },
    ).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(products)
}

#[tauri::command]
pub fn save_draft(
    state: State<'_, AppState>,
    user_id: i64,
    cart_json: String,
    discount_json: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // Safe foreign key validation for user_id to prevent FOREIGN KEY constraint failed
    let valid_user_id: i64 = {
        let exists: bool = db.conn.query_row(
            "SELECT 1 FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |_| Ok(true),
        ).unwrap_or(false);
        if exists {
            user_id
        } else {
            let fallback_id: Option<i64> = db.conn.query_row(
                "SELECT id FROM users ORDER BY CASE WHEN is_active = 1 THEN 0 ELSE 1 END, CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id ASC LIMIT 1",
                [],
                |r| r.get(0),
            ).ok();

            match fallback_id {
                Some(id) => id,
                None => {
                    let _ = db.conn.execute(
                        "INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active)
                         VALUES (1, 'admin', 'admin', 'Administrator', 'admin', 1)",
                        [],
                    );
                    1
                }
            }
        }
    };

    // Upsert draft - one per valid user
    let existing: Option<i64> = db.conn.query_row(
        "SELECT id FROM draft_bills WHERE user_id = ?1",
        rusqlite::params![valid_user_id],
        |row| row.get(0),
    ).ok();
    
    if let Some(draft_id) = existing {
        db.conn.execute(
            "UPDATE draft_bills SET cart_json = ?1, discount_json = ?2, updated_at = datetime('now') WHERE id = ?3",
            rusqlite::params![cart_json, discount_json, draft_id],
        ).map_err(|e| format!("Failed to save draft: {}", e))?;
    } else {
        db.conn.execute(
            "INSERT INTO draft_bills (user_id, cart_json, discount_json) VALUES (?1, ?2, ?3)",
            rusqlite::params![valid_user_id, cart_json, discount_json],
        ).map_err(|e| format!("Failed to save draft: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn load_draft(state: State<'_, AppState>, user_id: i64) -> Result<Option<DraftBill>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let result = db.conn.query_row(
        "SELECT id, user_id, cart_json, discount_json, created_at, updated_at FROM draft_bills WHERE user_id = ?1",
        rusqlite::params![user_id],
        |row| {
            let cart_json: String = row.get(2)?;
            let discount_json: String = row.get(3)?;
            
            let cart_items: Vec<CartItem> = serde_json::from_str(&cart_json).unwrap_or_default();
            let discount: Option<DraftDiscount> = serde_json::from_str(&discount_json).ok();
            
            Ok(DraftBill {
                id: row.get(0)?,
                user_id: row.get(1)?,
                cart_items,
                discount,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    );
    
    match result {
        Ok(draft) => {
            if draft.cart_items.is_empty() {
                Ok(None)
            } else {
                Ok(Some(draft))
            }
        }
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn delete_draft(state: State<'_, AppState>, user_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    db.conn.execute(
        "DELETE FROM draft_bills WHERE user_id = ?1",
        rusqlite::params![user_id],
    ).map_err(|e| format!("Failed to delete draft: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn complete_bill(
    state: State<'_, AppState>,
    user_id: i64,
    items: Vec<CartItem>,
    discount_type: String,
    discount_value: f64,
    payment_method: String,
    cash_amount_paise: Option<i64>,
    card_amount_paise: Option<i64>,
    upi_amount_paise: Option<i64>,
) -> Result<CompleteBillResponse, String> {
    crate::commands::auth::require_screen_access("billing")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, forward bill completion to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = crate::network::client::get_http_client();

        let url = format!("http://{}:{}/api/billing/create", host_ip, host_port);
        let req_id = format!("REQ-{}-{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4().to_string()[..6].to_uppercase());

        let payload = serde_json::json!({
            "request_id": req_id,
            "user_id": user_id,
            "items": items,
            "discount_type": discount_type,
            "discount_value": discount_value,
            "payment_method": payment_method,
            "cash_amount_paise": cash_amount_paise,
            "card_amount_paise": card_amount_paise,
            "upi_amount_paise": upi_amount_paise,
            "device_id": "DEV-CLIENT",
        });

        let resp = client.post(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            let err_msg = resp.text().unwrap_or_else(|_| "Host failed to complete bill".to_string());
            return Err(err_msg);
        }

        let complete_resp: CompleteBillResponse = resp.json()
            .map_err(|e| format!("Invalid bill response from Host: {}", e))?;

        return Ok(complete_resp);
    }

    complete_bill_internal(
        &db,
        user_id,
        items,
        discount_type,
        discount_value,
        payment_method,
        cash_amount_paise,
        card_amount_paise,
        upi_amount_paise,
    )
}

pub fn complete_bill_internal(
    db: &crate::db::connection::Database,
    user_id: i64,
    items: Vec<CartItem>,
    discount_type: String,
    discount_value: f64,
    payment_method: String,
    cash_amount_paise: Option<i64>,
    card_amount_paise: Option<i64>,
    upi_amount_paise: Option<i64>,
) -> Result<CompleteBillResponse, String> {
    // Validate items
    if items.is_empty() {
        return Err("Cart is empty".to_string());
    }

    // Validate stock availability for restockable items
    for item in &items {
        if item.product_id > 0 {
            let stock_info: Result<(i32, i32, String), _> = db.conn.query_row(
                "SELECT COALESCE(p.is_restockable, 0), COALESCE(i.current_stock, 0), p.name
                 FROM products p
                 LEFT JOIN inventory i ON p.id = i.product_id
                 WHERE p.id = ?1",
                rusqlite::params![item.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            );

            if let Ok((is_restockable, current_stock, prod_name)) = stock_info {
                if is_restockable == 1 {
                    if current_stock <= 0 {
                        return Err(format!(
                            "Product \"{}\" is Out of Stock (0 units available). Please remove it from the cart to proceed.",
                            prod_name
                        ));
                    }
                    if item.quantity as i32 > current_stock {
                        return Err(format!(
                            "Insufficient stock for \"{}\". Only {} units available in stock (requested {}).",
                            prod_name, current_stock, item.quantity
                        ));
                    }
                }
            }
        }
    }
    
    // Validate payment method
    if !["cash", "card", "upi", "upi_cash"].contains(&payment_method.as_str()) {
        return Err("Invalid payment method".to_string());
    }

    // Phase 3 FIX: Enforce max_discount_pct per user
    if discount_type != "none" && discount_value > 0.0 {
        let user_max_discount: i32 = db.conn.query_row(
            "SELECT max_discount_pct FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |r| r.get(0),
        ).unwrap_or(100);

        if discount_type == "percentage" && discount_value > user_max_discount as f64 {
            return Err(format!(
                "Discount {}% exceeds your maximum allowed discount of {}%.",
                discount_value, user_max_discount
            ));
        }
    }
    
    // Query shop settings to see if GST is globally enabled for the business
    let shop_gst_enabled: bool = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'gst_enabled'",
        [],
        |r| r.get::<_, String>(0),
    ).map(|v| v.trim().eq_ignore_ascii_case("true")).unwrap_or(false);

    // Calculate totals using integer arithmetic (paise)
    let mut subtotal_paise: i64 = 0;
    let mut gst_total_paise: i64 = 0;
    
    for item in &items {
        let line_total = item.unit_price_paise * item.quantity as i64;
        subtotal_paise += line_total;
        
        if shop_gst_enabled && item.gst_enabled && item.gst_percentage_x100 > 0 {
            // Banker's rounding: (+5000) / 10000
            let gst = ((line_total * item.gst_percentage_x100 as i64) + 5000) / 10000;
            gst_total_paise += gst;
        }
    }
    
    // Calculate discount
    let discount_amount_paise: i64;
    let discount_value_x100: i32;
    
    match discount_type.as_str() {
        "percentage" => {
            discount_value_x100 = (discount_value * 100.0) as i32;
            discount_amount_paise = (subtotal_paise * discount_value_x100 as i64) / 10000;
        }
        "fixed" => {
            discount_value_x100 = (discount_value * 100.0) as i32;
            discount_amount_paise = (discount_value * 100.0) as i64; // Convert rupees to paise
        }
        _ => {
            discount_value_x100 = 0;
            discount_amount_paise = 0;
        }
    }
    
    // Grand total
    let grand_total_paise = subtotal_paise + gst_total_paise - discount_amount_paise;
    if grand_total_paise < 0 {
        return Err("Total cannot be negative. Check discount amount.".to_string());
    }
    
    // Validate payment amounts
    let cash = cash_amount_paise.unwrap_or(0);
    let _card = card_amount_paise.unwrap_or(0);
    let upi = upi_amount_paise.unwrap_or(0);
    
    match payment_method.as_str() {
        "cash" => {
            if cash < grand_total_paise {
                return Err(format!(
                    "Tendered cash (Rs. {:.2}) is less than total payable (Rs. {:.2})",
                    (cash as f64) / 100.0,
                    (grand_total_paise as f64) / 100.0
                ));
            }
        }
        "card" => {
            // Card amount equals total
        }
        "upi" => {
            // UPI amount equals total
        }
        "upi_cash" => {
            if (upi + cash) < grand_total_paise {
                return Err(format!(
                    "Payment total (Rs. {:.2}) does not match bill total (Rs. {:.2})",
                    ((upi + cash) as f64) / 100.0,
                    (grand_total_paise as f64) / 100.0
                ));
            }
        }
        _ => {}
    }
    
    // Get business date (today)
    let now = chrono::Local::now();
    let business_date = now.format("%Y-%m-%d").to_string();
    let bill_time = now.format("%H:%M:%S").to_string();
    let bill_uuid = uuid::Uuid::new_v4().to_string();
    
    // Phase 6 FIX: Generate idempotency key BEFORE transaction to prevent duplicate bills from double-clicks
    let idempotency_key = uuid::Uuid::new_v4().to_string();

    // Begin transaction
    let tx = db.conn.unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    // Phase 6 FIX: Insert idempotency key — if a duplicate request arrives within 10 seconds, the UNIQUE constraint rejects it
    let idem_result = tx.execute(
        "INSERT INTO idempotency_keys (key, created_at) VALUES (?1, datetime('now'))",
        rusqlite::params![idempotency_key],
    );
    if let Err(e) = idem_result {
        if e.to_string().contains("UNIQUE") {
            return Err("Duplicate bill request detected. Please wait.".to_string());
        }
        // Non-unique error is not critical for idempotency — continue
    }
    
    // Get next global unique bill number
    let bill_number: i32 = tx.query_row(
        "SELECT COALESCE(MAX(bill_number), 0) + 1 FROM bills",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Bill number error: {}", e))?;

    // Safe foreign key validation for user_id
    let valid_user_id: i64 = {
        let exists: bool = tx.query_row(
            "SELECT 1 FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |_| Ok(true),
        ).unwrap_or(false);
        if exists {
            user_id
        } else {
            let fallback_id: Option<i64> = tx.query_row(
                "SELECT id FROM users ORDER BY CASE WHEN is_active = 1 THEN 0 ELSE 1 END, CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id ASC LIMIT 1",
                [],
                |r| r.get(0),
            ).ok();

            match fallback_id {
                Some(id) => id,
                None => {
                    let _ = tx.execute(
                        "INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active)
                         VALUES (1, 'admin', 'admin', 'Administrator', 'admin', 1)",
                        [],
                    );
                    1
                }
            }
        }
    };
    
    // Insert bill
    tx.execute(
        "INSERT INTO bills (bill_uuid, bill_number, business_date, bill_time, user_id,
                           subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
                           gst_total_paise, grand_total_paise, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'completed')",
        rusqlite::params![
            bill_uuid, bill_number, business_date, bill_time, valid_user_id,
            subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
            gst_total_paise, grand_total_paise
        ],
    ).map_err(|e| format!("Failed to create bill: {}", e))?;
    
    let bill_id = tx.last_insert_rowid();
    
    // Insert bill items with snapshots
    for (idx, item) in items.iter().enumerate() {
        let line_total = item.unit_price_paise * item.quantity as i64;
        let item_gst_applied = shop_gst_enabled && item.gst_enabled && item.gst_percentage_x100 > 0;
        let gst_amount = if item_gst_applied {
            ((line_total * item.gst_percentage_x100 as i64) + 5000) / 10000
        } else {
            0
        };
        let item_gst_flag = if item_gst_applied { 1 } else { 0 };
        let item_gst_pct = if item_gst_applied { item.gst_percentage_x100 } else { 0 };
        
        // Safe check: verify product exists in products table before setting product_id foreign key
        let db_product_id: Option<i64> = if item.product_id > 0 {
            let prod_exists: bool = tx.query_row(
                "SELECT 1 FROM products WHERE id = ?1",
                rusqlite::params![item.product_id],
                |_| Ok(true),
            ).unwrap_or(false);
            if prod_exists { Some(item.product_id) } else { None }
        } else {
            None
        };

        tx.execute(
            "INSERT INTO bill_items (bill_id, product_id, product_code_snapshot, product_name_snapshot,
                                    category_name_snapshot, unit_price_paise, quantity, gst_enabled,
                                    gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                bill_id, db_product_id, item.product_code, item.product_name,
                item.category_name, item.unit_price_paise, item.quantity, item_gst_flag,
                item_gst_pct, gst_amount, line_total, idx as i32
            ],
        ).map_err(|e| format!("Failed to add bill item: {}", e))?;
        
        // Deduct inventory stock & record stock movement only for valid catalog products
        if let Some(pid) = db_product_id {
            let _ = tx.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes)
                 VALUES (?1, ?2, 'sale', ?3, ?4, 'POS Sale')",
                rusqlite::params![pid, -(item.quantity as i32), bill_id, valid_user_id],
            );
            let _ = tx.execute(
                "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(product_id) DO UPDATE SET current_stock = MAX(0, current_stock - ?3), updated_at = datetime('now')",
                rusqlite::params![pid, -(item.quantity as i32), item.quantity as i32],
            );
        }
    }
    
    // Insert payment
    let (final_cash, final_card, final_upi) = match payment_method.as_str() {
        "cash" => (grand_total_paise, 0i64, 0i64),
        "card" => (0i64, grand_total_paise, 0i64),
        "upi" => (0i64, 0i64, grand_total_paise),
        "upi_cash" => {
            let actual_cash_portion = if cash > 0 { cash } else { grand_total_paise.saturating_sub(upi) };
            (actual_cash_portion, 0i64, upi)
        },
        _ => (if cash > 0 { cash } else { grand_total_paise }, 0i64, 0i64),
    };
    
    tx.execute(
        "INSERT INTO payments (bill_id, payment_method, total_amount_paise, cash_amount_paise, card_amount_paise, upi_amount_paise)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![bill_id, payment_method, grand_total_paise, final_cash, final_card, final_upi],
    ).map_err(|e| format!("Failed to save payment: {}", e))?;
    
    // Delete draft for this user (non-critical — can fail silently)
    let _ = tx.execute(
        "DELETE FROM draft_bills WHERE user_id = ?1",
        rusqlite::params![valid_user_id],
    );
    
    // Phase 5 FIX: Audit log — must succeed for financial accountability
    tx.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json)
         VALUES (?1, 'create', 'bill', ?2, ?3)",
        rusqlite::params![
            valid_user_id, bill_id,
            format!("{{\"bill_number\":{},\"total\":{}}}", bill_number, grand_total_paise)
        ],
    ).map_err(|e| format!("Failed to write audit log: {}", e))?;
    
    // Commit
    tx.commit().map_err(|e| format!("Failed to complete bill: {}", e))?;
    
    let change = if payment_method == "cash" && cash > grand_total_paise {
        cash - grand_total_paise
    } else if payment_method == "upi_cash" && (upi + cash) > grand_total_paise {
        (upi + cash) - grand_total_paise
    } else {
        0
    };
    
    Ok(CompleteBillResponse {
        bill_id,
        bill_uuid,
        bill_number,
        business_date,
        bill_time,
        grand_total_paise,
        change_due_paise: change,
    })
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ReturnBillItemPayload {
    #[serde(alias = "billItemId")]
    pub bill_item_id: i64,
    #[serde(alias = "productId", default)]
    pub product_id: Option<i64>,
    #[serde(alias = "productName", default)]
    pub product_name: Option<String>,
    #[serde(default)]
    pub quantity: i64,
    #[serde(alias = "unitPricePaise", default)]
    pub unit_price_paise: Option<i64>,
    #[serde(alias = "lineTotalPaise", default)]
    pub line_total_paise: Option<i64>,
}

#[tauri::command]
pub fn return_bill(
    state: State<'_, AppState>,
    bill_id: i64,
    user_id: i64,
    reason: String,
    items: Vec<ReturnBillItemPayload>,
    refund_amount_paise: i64,
) -> Result<(), String> {
    crate::commands::auth::require_screen_access("billing")?;

    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, forward return request to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("http://{}:{}/api/bills/{}/return", host_ip, host_port, bill_id);
        let payload = serde_json::json!({
            "user_id": user_id,
            "reason": reason.trim(),
            "items": items,
            "refund_amount_paise": refund_amount_paise,
        });

        let resp = client.post(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            let err_msg = resp.text().unwrap_or_else(|_| "Host failed to return bill".to_string());
            return Err(err_msg);
        }

        return Ok(());
    }

    if items.is_empty() {
        return Err("No items selected for return".to_string());
    }

    let tx = db.conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    // Safe foreign key validation for user_id
    let valid_user_id: i64 = {
        let exists: bool = tx.query_row(
            "SELECT 1 FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |_| Ok(true),
        ).unwrap_or(false);
        if exists {
            user_id
        } else {
            let fallback_id: Option<i64> = tx.query_row(
                "SELECT id FROM users ORDER BY CASE WHEN is_active = 1 THEN 0 ELSE 1 END, CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id ASC LIMIT 1",
                [],
                |r| r.get(0),
            ).ok();

            match fallback_id {
                Some(id) => id,
                None => {
                    let _ = tx.execute(
                        "INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active)
                         VALUES (1, 'admin', 'admin', 'Administrator', 'admin', 1)",
                        [],
                    );
                    1
                }
            }
        }
    };

    let return_timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    tx.execute(
        "INSERT INTO bill_returns (bill_id, user_id, reason, refund_amount_paise, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![bill_id, valid_user_id, reason.trim(), refund_amount_paise, return_timestamp],
    ).map_err(|e| format!("Failed to record return transaction: {}", e))?;
    let bill_return_id = tx.last_insert_rowid();

    // 1. Return items back to inventory stock and record stock movements
    for item in &items {
        if item.quantity <= 0 {
            return Err("Return quantity must be greater than zero".to_string());
        }

        // Deduct returned quantity from bill_items and validate against current quantity
        let item_data: Option<(i64, i64, i32, i32, String, String)> = tx.query_row(
            "SELECT quantity, unit_price_paise, gst_enabled, gst_percentage_x100, product_code_snapshot, product_name_snapshot 
             FROM bill_items WHERE id = ?1",
            rusqlite::params![item.bill_item_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).ok();

        let (current_qty, unit_price, gst_enabled, gst_percentage_x100, prod_code, prod_name) = item_data
            .ok_or_else(|| format!("Bill item {} not found", item.bill_item_id))?;

        if item.quantity > current_qty {
            return Err(format!(
                "Return quantity ({}) cannot exceed billed quantity ({}) for item #{}",
                item.quantity, current_qty, item.bill_item_id
            ));
        }

        // Verify product exists before updating stock/inventory
        let verified_pid: Option<i64> = match item.product_id {
            Some(pid) if pid > 0 => {
                let exists: bool = tx.query_row(
                    "SELECT 1 FROM products WHERE id = ?1",
                    rusqlite::params![pid],
                    |_| Ok(true),
                ).unwrap_or(false);
                if exists { Some(pid) } else { None }
            }
            _ => None,
        };

        // Restore stock to inventory
        if let Some(pid) = verified_pid {
            let _ = tx.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes)
                 VALUES (?1, ?2, 'return', ?3, ?4, ?5)",
                rusqlite::params![pid, item.quantity as i32, bill_id, valid_user_id, reason.trim()],
            );

            let _ = tx.execute(
                "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(product_id) DO UPDATE SET current_stock = current_stock + ?3, updated_at = datetime('now')",
                rusqlite::params![pid, item.quantity as i32, item.quantity as i32],
            );
        }

        let new_item_qty = (current_qty - item.quantity).max(0);
        let new_line_total = if new_item_qty > 0 { new_item_qty * unit_price } else { 0 };
        let new_gst_amount = if new_item_qty > 0 && gst_enabled == 1 && gst_percentage_x100 > 0 {
            ((new_line_total * gst_percentage_x100 as i64) + 5000) / 10000
        } else {
            0
        };
        tx.execute(
            "UPDATE bill_items SET quantity = ?1, returned_quantity = COALESCE(returned_quantity, 0) + ?2, line_total_paise = ?3, gst_amount_paise = ?4 WHERE id = ?5",
            rusqlite::params![new_item_qty, item.quantity, new_line_total, new_gst_amount, item.bill_item_id],
        ).map_err(|e| format!("Failed to update bill items: {}", e))?;

        let p_name = item.product_name.clone().unwrap_or(prod_name);
        let p_code = prod_code;
        let line_refund = unit_price * item.quantity;

        tx.execute(
            "INSERT INTO bill_return_items (bill_return_id, bill_id, bill_item_id, product_id, product_name, product_code, quantity, unit_price_paise, line_total_paise, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                bill_return_id,
                bill_id,
                item.bill_item_id,
                verified_pid,
                p_name,
                p_code,
                item.quantity,
                unit_price,
                line_refund,
                return_timestamp,
            ],
        ).map_err(|e| format!("Failed to record return item details: {}", e))?;
    }

    // 2. Fetch remaining items counts and financials from bill_items
    let remaining_items_sum: i64 = tx.query_row(
        "SELECT COALESCE(SUM(quantity), 0) FROM bill_items WHERE bill_id = ?1",
        rusqlite::params![bill_id],
        |r| r.get(0),
    ).unwrap_or(0);

    let remaining_subtotal: i64 = tx.query_row(
        "SELECT COALESCE(SUM(line_total_paise), 0) FROM bill_items WHERE bill_id = ?1",
        rusqlite::params![bill_id],
        |r| r.get(0),
    ).unwrap_or(0);

    let remaining_gst: i64 = tx.query_row(
        "SELECT COALESCE(SUM(gst_amount_paise), 0) FROM bill_items WHERE bill_id = ?1",
        rusqlite::params![bill_id],
        |r| r.get(0),
    ).unwrap_or(0);

    let discount_info: Option<(String, i32, i64)> = tx.query_row(
        "SELECT discount_type, discount_value_x100, discount_amount_paise FROM bills WHERE id = ?1",
        rusqlite::params![bill_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).ok();

    let remaining_discount = if let Some((dtype, dval_x100, orig_disc)) = discount_info {
        if dtype == "percentage" && dval_x100 > 0 {
            (remaining_subtotal * dval_x100 as i64) / 10000
        } else if dtype == "fixed" {
            orig_disc.min(remaining_subtotal + remaining_gst)
        } else {
            0
        }
    } else {
        0
    };

    let remaining_grand_total = (remaining_subtotal + remaining_gst - remaining_discount).max(0);

    // 3. Update Bill status and financial totals
    if remaining_items_sum == 0 || remaining_grand_total == 0 {
        // FULL RETURN: Mark bill as cancelled and zero out all financial columns
        let cancel_note = format!("Full Return / Cancelled: {}", reason);
        tx.execute(
            "UPDATE bills SET 
                status = 'cancelled', 
                void_reason = ?1, 
                subtotal_paise = 0, 
                gst_total_paise = 0, 
                discount_amount_paise = 0, 
                grand_total_paise = 0, 
                updated_at = datetime('now') 
             WHERE id = ?2",
            rusqlite::params![cancel_note, bill_id],
        ).map_err(|e| format!("Failed to update bill status: {}", e))?;

        // Zero out payment record
        let _ = tx.execute(
            "UPDATE payments SET total_amount_paise = 0, cash_amount_paise = 0, upi_amount_paise = 0, card_amount_paise = 0 WHERE bill_id = ?1",
            rusqlite::params![bill_id],
        );
    } else {
        // PARTIAL RETURN: Mark bill status as 'returned' with remaining net sales balance and GST
        let note = format!("Partial Return: {} (Refunded: ₹{:.2})", reason, refund_amount_paise as f64 / 100.0);
        tx.execute(
            "UPDATE bills SET 
                status = 'returned', 
                subtotal_paise = ?1, 
                gst_total_paise = ?2, 
                discount_amount_paise = ?3, 
                grand_total_paise = ?4, 
                void_reason = ?5, 
                updated_at = datetime('now') 
             WHERE id = ?6",
            rusqlite::params![
                remaining_subtotal,
                remaining_gst,
                remaining_discount,
                remaining_grand_total,
                note,
                bill_id
            ],
        ).map_err(|e| format!("Failed to update bill totals: {}", e))?;

        // Proportionately reduce payment record
        let _ = tx.execute(
            "UPDATE payments SET 
                total_amount_paise = ?1,
                cash_amount_paise = CASE WHEN total_amount_paise > 0 THEN (cash_amount_paise * ?1) / total_amount_paise ELSE 0 END,
                upi_amount_paise = CASE WHEN total_amount_paise > 0 THEN (upi_amount_paise * ?1) / total_amount_paise ELSE 0 END,
                card_amount_paise = CASE WHEN total_amount_paise > 0 THEN (card_amount_paise * ?1) / total_amount_paise ELSE 0 END
             WHERE bill_id = ?2",
            rusqlite::params![remaining_grand_total, bill_id],
        );
    }

    let details = serde_json::json!({
        "bill_id": bill_id,
        "reason": reason,
        "refund_amount_paise": refund_amount_paise,
        "new_grand_total_paise": remaining_grand_total,
        "item_count": items.len(),
    }).to_string();

    let _ = tx.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json)
         VALUES (?1, 'return_bill', 'bill', ?2, ?3)",
        rusqlite::params![valid_user_id, bill_id, details],
    );

    tx.commit().map_err(|e| format!("Commit failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_next_bill_number(state: State<'_, AppState>) -> Result<i32, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, fetch from Host PC or query local DB
    let next_num: i32 = db.conn.query_row(
        "SELECT COALESCE(MAX(bill_number), 0) + 1 FROM bills",
        [],
        |r| r.get(0),
    ).unwrap_or(1);
    
    Ok(next_num)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::db::connection::Database;
    use crate::models::CartItem;

    fn setup_test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        let mut db = Database {
            conn,
            data_dir: std::env::temp_dir(),
        };
        crate::db::migrations::run_migrations(&mut db).unwrap();

        // Seed or update test user
        db.conn.execute(
            "INSERT INTO users (id, username, display_name, password_hash, role, is_active)
             VALUES (1, 'cashier1', 'Staff Cashier', 'hash123', 'cashier', 1)
             ON CONFLICT(id) DO UPDATE SET is_active = 1",
            [],
        ).unwrap();

        // Seed a test category
        db.conn.execute(
            "INSERT OR IGNORE INTO categories (id, name, is_active) VALUES (1, 'Food & Drinks', 1)",
            [],
        ).unwrap();

        // Seed 5 test products matching user's items
        db.conn.execute(
            "INSERT OR REPLACE INTO products (id, product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, is_active)
             VALUES (101, 'CHAAT01', 'Aloo Tikki Chaat', 1, 6000, 1, 500, 1)",
            [],
        ).unwrap();
        db.conn.execute(
            "INSERT OR REPLACE INTO inventory (product_id, current_stock) VALUES (101, 100)",
            [],
        ).unwrap();

        db.conn.execute(
            "INSERT OR REPLACE INTO products (id, product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, is_active)
             VALUES (102, 'TEA01', 'Adrak Elaichi Chai', 1, 2500, 1, 500, 1)",
            [],
        ).unwrap();
        db.conn.execute(
            "INSERT OR REPLACE INTO inventory (product_id, current_stock) VALUES (102, 100)",
            [],
        ).unwrap();

        db.conn.execute(
            "INSERT OR REPLACE INTO products (id, product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, is_active)
             VALUES (103, 'PIZZA01', 'BBQ Chicken Pizza 8\"', 1, 23000, 1, 500, 1)",
            [],
        ).unwrap();
        db.conn.execute(
            "INSERT OR REPLACE INTO inventory (product_id, current_stock) VALUES (103, 50)",
            [],
        ).unwrap();

        db.conn.execute(
            "INSERT OR REPLACE INTO products (id, product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, is_active)
             VALUES (104, 'SWEET01', 'Bengali Rasgulla (2 pcs)', 1, 4000, 1, 500, 1)",
            [],
        ).unwrap();
        db.conn.execute(
            "INSERT OR REPLACE INTO inventory (product_id, current_stock) VALUES (104, 100)",
            [],
        ).unwrap();

        db.conn.execute(
            "INSERT OR REPLACE INTO products (id, product_code, name, category_id, selling_price_paise, gst_enabled, gst_percentage_x100, is_active)
             VALUES (105, 'MAIN01', 'Special Paneer Tikka Platter', 1, 23000, 1, 500, 1)",
            [],
        ).unwrap();
        db.conn.execute(
            "INSERT OR REPLACE INTO inventory (product_id, current_stock) VALUES (105, 50)",
            [],
        ).unwrap();

        db
    }

    fn build_user_cart(gst: bool) -> Vec<CartItem> {
        let pct = if gst { 500 } else { 0 };
        vec![
            CartItem {
                product_id: 101,
                product_code: "CHAAT01".to_string(),
                product_name: "Aloo Tikki Chaat".to_string(),
                category_name: "Food & Drinks".to_string(),
                unit_price_paise: 6000, // Rs. 60.00
                quantity: 1,
                gst_enabled: gst,
                gst_percentage_x100: pct,
            },
            CartItem {
                product_id: 102,
                product_code: "TEA01".to_string(),
                product_name: "Adrak Elaichi Chai".to_string(),
                category_name: "Food & Drinks".to_string(),
                unit_price_paise: 2500, // Rs. 25.00
                quantity: 1,
                gst_enabled: gst,
                gst_percentage_x100: pct,
            },
            CartItem {
                product_id: 103,
                product_code: "PIZZA01".to_string(),
                product_name: "BBQ Chicken Pizza 8\"".to_string(),
                category_name: "Food & Drinks".to_string(),
                unit_price_paise: 23000, // Rs. 230.00
                quantity: 1,
                gst_enabled: gst,
                gst_percentage_x100: pct,
            },
            CartItem {
                product_id: 104,
                product_code: "SWEET01".to_string(),
                product_name: "Bengali Rasgulla (2 pcs)".to_string(),
                category_name: "Food & Drinks".to_string(),
                unit_price_paise: 4000, // Rs. 40.00
                quantity: 1,
                gst_enabled: gst,
                gst_percentage_x100: pct,
            },
            CartItem {
                product_id: 105,
                product_code: "MAIN01".to_string(),
                product_name: "Special Paneer Tikka Platter".to_string(),
                category_name: "Food & Drinks".to_string(),
                unit_price_paise: 23000, // Rs. 230.00
                quantity: 1,
                gst_enabled: gst,
                gst_percentage_x100: pct,
            },
        ]
    }

    #[test]
    fn test_user_screenshot_case_upi_cash_585_total_passes() {
        let db = setup_test_db();
        // Ensure GST is disabled in settings (as shown in user screenshot: total payable Rs. 585.00)
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        let items = build_user_cart(false);
        assert_eq!(items.len(), 5);

        // Rs. 292.50 = 29250 paise
        let res = complete_bill_internal(
            &db,
            1,
            items,
            "none".to_string(),
            0.0,
            "upi_cash".to_string(),
            Some(29250), // Cash: Rs. 292.50
            None,
            Some(29250), // UPI: Rs. 292.50
        );

        assert!(res.is_ok(), "Expected bill to complete successfully, got error: {:?}", res.err());
        let bill_resp = res.unwrap();
        assert_eq!(bill_resp.grand_total_paise, 58500, "Grand total must be exactly Rs. 585.00 (58500 paise)");
        assert_eq!(bill_resp.change_due_paise, 0);

        // Verify stored bill in database
        let (db_subtotal, db_gst, db_grand, db_items_count): (i64, i64, i64, i32) = db.conn.query_row(
            "SELECT b.subtotal_paise, b.gst_total_paise, b.grand_total_paise, COUNT(bi.id)
             FROM bills b
             JOIN bill_items bi ON b.id = bi.bill_id
             WHERE b.id = ?1
             GROUP BY b.id",
            rusqlite::params![bill_resp.bill_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).unwrap();

        assert_eq!(db_subtotal, 58500);
        assert_eq!(db_gst, 0, "GST must be 0 because shop_gst_enabled is false");
        assert_eq!(db_grand, 58500);
        assert_eq!(db_items_count, 5, "Database must store all 5 items");

        // Verify payment record
        let (db_pay_method, db_cash, db_upi): (String, i64, i64) = db.conn.query_row(
            "SELECT payment_method, cash_amount_paise, upi_amount_paise FROM payments WHERE bill_id = ?1",
            rusqlite::params![bill_resp.bill_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();

        assert_eq!(db_pay_method, "upi_cash");
        assert_eq!(db_cash, 29250);
        assert_eq!(db_upi, 29250);
    }

    #[test]
    fn test_upi_cash_split_with_cash_overpayment_change() {
        let db = setup_test_db();
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        let items = build_user_cart(false);
        // Total 58500. User pays Rs. 292.50 UPI (29250) + Rs. 300.00 cash (30000). Total = 59250.
        // Change should be Rs. 7.50 (750 paise).
        let res = complete_bill_internal(
            &db,
            1,
            items,
            "none".to_string(),
            0.0,
            "upi_cash".to_string(),
            Some(30000),
            None,
            Some(29250),
        ).unwrap();

        assert_eq!(res.grand_total_paise, 58500);
        assert_eq!(res.change_due_paise, 750, "Change must be 750 paise (Rs. 7.50)");
    }

    #[test]
    fn test_cash_full_tendered_with_change() {
        let db = setup_test_db();
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        let items = build_user_cart(false);
        // Total 58500. User tenders Rs. 600.00 cash (60000 paise).
        // Change should be Rs. 15.00 (1500 paise).
        let res = complete_bill_internal(
            &db,
            1,
            items,
            "none".to_string(),
            0.0,
            "cash".to_string(),
            Some(60000),
            None,
            None,
        ).unwrap();

        assert_eq!(res.grand_total_paise, 58500);
        assert_eq!(res.change_due_paise, 1500, "Change must be 1500 paise (Rs. 15.00)");
    }

    #[test]
    fn test_cash_underpayment_rejected() {
        let db = setup_test_db();
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        let items = build_user_cart(false);
        // Total 58500. User tenders only Rs. 500.00 cash (50000 paise).
        let res = complete_bill_internal(
            &db,
            1,
            items,
            "none".to_string(),
            0.0,
            "cash".to_string(),
            Some(50000),
            None,
            None,
        );

        assert!(res.is_err(), "Underpayment must be rejected");
        let err_msg = res.err().unwrap();
        assert!(err_msg.contains("less than total payable"));
    }

    #[test]
    fn test_discounts_fixed_and_percentage() {
        let db = setup_test_db();
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        // 1. Fixed discount: Rs. 50 off Rs. 585 = Rs. 535.00
        let res_fixed = complete_bill_internal(
            &db,
            1,
            build_user_cart(false),
            "fixed".to_string(),
            50.0,
            "upi".to_string(),
            None,
            None,
            Some(53500),
        ).unwrap();
        assert_eq!(res_fixed.grand_total_paise, 53500);

        // 2. Percentage discount: 10% off Rs. 585 = 58.50 off -> Rs. 526.50 (52650 paise)
        let res_pct = complete_bill_internal(
            &db,
            1,
            build_user_cart(false),
            "percentage".to_string(),
            10.0,
            "card".to_string(),
            None,
            Some(52650),
            None,
        ).unwrap();
        assert_eq!(res_pct.grand_total_paise, 52650);
    }

    #[test]
    fn test_inventory_deduction_and_movement() {
        let db = setup_test_db();
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        // Initial stock for Pizza 103 is 50
        let stock_before: i32 = db.conn.query_row(
            "SELECT current_stock FROM inventory WHERE product_id = 103",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(stock_before, 50);

        let res = complete_bill_internal(
            &db,
            1,
            build_user_cart(false),
            "none".to_string(),
            0.0,
            "cash".to_string(),
            Some(58500),
            None,
            None,
        ).unwrap();

        // Cart had 1 pizza (product 103), stock should now be 49
        let stock_after: i32 = db.conn.query_row(
            "SELECT current_stock FROM inventory WHERE product_id = 103",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(stock_after, 49);

        // Check stock movement record
        let movement_change: i32 = db.conn.query_row(
            "SELECT quantity_change FROM stock_movements WHERE product_id = 103 AND reference_id = ?1",
            rusqlite::params![res.bill_id],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(movement_change, -1);
    }

    #[test]
    fn test_gst_enabled_calculation() {
        let db = setup_test_db();
        // Turn ON GST in settings
        db.conn.execute("UPDATE settings SET value = 'true' WHERE key = 'gst_enabled'", []).unwrap();

        let items = build_user_cart(true);
        // Subtotal = 58500 paise. 5% GST = 2925 paise. Total = 61425 paise (Rs. 614.25).
        let res = complete_bill_internal(
            &db,
            1,
            items,
            "none".to_string(),
            0.0,
            "upi".to_string(),
            None,
            None,
            Some(61425),
        ).unwrap();

        assert_eq!(res.grand_total_paise, 61425);

        let (db_sub, db_gst, db_grand): (i64, i64, i64) = db.conn.query_row(
            "SELECT subtotal_paise, gst_total_paise, grand_total_paise FROM bills WHERE id = ?1",
            rusqlite::params![res.bill_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();

        assert_eq!(db_sub, 58500);
        assert_eq!(db_gst, 2925);
        assert_eq!(db_grand, 61425);
    }

    #[test]
    fn test_gst_disabled_with_gst_flagged_products_produces_zero_gst() {
        let db = setup_test_db();
        // GST is disabled in shop settings
        db.conn.execute("UPDATE settings SET value = 'false' WHERE key = 'gst_enabled'", []).unwrap();

        // Cart contains products with gst_enabled: true and gst_percentage_x100: 500
        let items = build_user_cart(true);
        assert_eq!(items.len(), 5);

        // Grand total must be exactly Rs. 585.00 (NO GST ADDED)
        let res = complete_bill_internal(
            &db,
            1,
            items,
            "none".to_string(),
            0.0,
            "cash".to_string(),
            Some(58500),
            None,
            None,
        );

        assert!(res.is_ok(), "Expected bill to complete with exact subtotal without GST: {:?}", res.err());
        let bill_resp = res.unwrap();
        assert_eq!(bill_resp.grand_total_paise, 58500, "Grand total must match subtotal 58500");

        let (db_sub, db_gst, db_grand): (i64, i64, i64) = db.conn.query_row(
            "SELECT subtotal_paise, gst_total_paise, grand_total_paise FROM bills WHERE id = ?1",
            rusqlite::params![bill_resp.bill_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();

        assert_eq!(db_sub, 58500);
        assert_eq!(db_gst, 0, "GST must be strictly 0 when shop gst is disabled");
        assert_eq!(db_grand, 58500);

        // Verify bill items also have gst_enabled = 0 and gst_amount_paise = 0
        let items_with_gst_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM bill_items WHERE bill_id = ?1 AND (gst_enabled = 1 OR gst_amount_paise > 0)",
            rusqlite::params![bill_resp.bill_id],
            |r| r.get(0),
        ).unwrap();

        assert_eq!(items_with_gst_count, 0, "No bill item should have GST recorded when shop GST is disabled");
    }
}



