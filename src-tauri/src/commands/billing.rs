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
                p.image_path, p.selling_price_paise, p.gst_enabled, p.gst_percentage_x100
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_active = 1"
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
    
    // Upsert draft - one per user
    let existing: Option<i64> = db.conn.query_row(
        "SELECT id FROM draft_bills WHERE user_id = ?1",
        rusqlite::params![user_id],
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
            rusqlite::params![user_id, cart_json, discount_json],
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

    // Validate items
    if items.is_empty() {
        return Err("Cart is empty".to_string());
    }
    
    // Validate payment method
    if !["cash", "card", "upi", "upi_cash"].contains(&payment_method.as_str()) {
        return Err("Invalid payment method".to_string());
    }
    
    // Calculate totals using integer arithmetic (paise)
    let mut subtotal_paise: i64 = 0;
    let mut gst_total_paise: i64 = 0;
    
    for item in &items {
        let line_total = item.unit_price_paise * item.quantity as i64;
        subtotal_paise += line_total;
        
        if item.gst_enabled && item.gst_percentage_x100 > 0 {
            let gst = (line_total * item.gst_percentage_x100 as i64) / 10000;
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
                // Allow overpayment (change)
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
                return Err("Payment total does not match bill total".to_string());
            }
        }
        _ => {}
    }
    
    // Get business date (today)
    let now = chrono::Local::now();
    let business_date = now.format("%Y-%m-%d").to_string();
    let bill_time = now.format("%H:%M:%S").to_string();
    let bill_uuid = uuid::Uuid::new_v4().to_string();
    
    // Begin transaction
    let tx = db.conn.unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;
    
    // Get next global unique bill number
    let bill_number: i32 = tx.query_row(
        "SELECT COALESCE(MAX(bill_number), 0) + 1 FROM bills",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Bill number error: {}", e))?;
    
    // Insert bill
    tx.execute(
        "INSERT INTO bills (bill_uuid, bill_number, business_date, bill_time, user_id,
                           subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
                           gst_total_paise, grand_total_paise, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'completed')",
        rusqlite::params![
            bill_uuid, bill_number, business_date, bill_time, user_id,
            subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
            gst_total_paise, grand_total_paise
        ],
    ).map_err(|e| format!("Failed to create bill: {}", e))?;
    
    let bill_id = tx.last_insert_rowid();
    
    // Insert bill items with snapshots
    for (idx, item) in items.iter().enumerate() {
        let line_total = item.unit_price_paise * item.quantity as i64;
        let gst_amount = if item.gst_enabled && item.gst_percentage_x100 > 0 {
            (line_total * item.gst_percentage_x100 as i64) / 10000
        } else {
            0
        };
        
        let db_product_id: Option<i64> = if item.product_id > 0 { Some(item.product_id) } else { None };

        tx.execute(
            "INSERT INTO bill_items (bill_id, product_id, product_code_snapshot, product_name_snapshot,
                                    category_name_snapshot, unit_price_paise, quantity, gst_enabled,
                                    gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                bill_id, db_product_id, item.product_code, item.product_name,
                item.category_name, item.unit_price_paise, item.quantity, item.gst_enabled as i32,
                item.gst_percentage_x100, gst_amount, line_total, idx as i32
            ],
        ).map_err(|e| format!("Failed to add bill item: {}", e))?;
        
        // Deduct inventory stock & record stock movement only for real catalog products
        if let Some(pid) = db_product_id {
            let _ = tx.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes)
                 VALUES (?1, ?2, 'sale', ?3, ?4, 'POS Sale')",
                rusqlite::params![pid, -(item.quantity as i32), bill_id, user_id],
            );
            let _ = tx.execute(
                "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(product_id) DO UPDATE SET current_stock = current_stock - ?3, updated_at = datetime('now')",
                rusqlite::params![pid, -(item.quantity as i32), item.quantity as i32],
            );
        }
    }
    
    // Insert payment
    let (final_cash, final_card, final_upi) = match payment_method.as_str() {
        "cash" => (grand_total_paise, 0i64, 0i64),
        "card" => (0i64, grand_total_paise, 0i64),
        "upi" => (0i64, 0i64, grand_total_paise),
        "upi_cash" => (cash, 0i64, upi),
        _ => (grand_total_paise, 0i64, 0i64),
    };
    
    tx.execute(
        "INSERT INTO payments (bill_id, payment_method, total_amount_paise, cash_amount_paise, card_amount_paise, upi_amount_paise)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![bill_id, payment_method, grand_total_paise, final_cash, final_card, final_upi],
    ).map_err(|e| format!("Failed to save payment: {}", e))?;
    
    // Delete draft for this user
    let _ = tx.execute(
        "DELETE FROM draft_bills WHERE user_id = ?1",
        rusqlite::params![user_id],
    );
    
    // Audit log
    let _ = tx.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json)
         VALUES (?1, 'create', 'bill', ?2, ?3)",
        rusqlite::params![
            user_id, bill_id,
            format!("{{\"bill_number\":{},\"total\":{}}}", bill_number, grand_total_paise)
        ],
    );
    
    // Commit
    tx.commit().map_err(|e| format!("Failed to complete bill: {}", e))?;
    
    let change = if payment_method == "cash" && cash > grand_total_paise {
        cash - grand_total_paise
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

    let tx = db.conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    // 1. Return items back to inventory stock and record stock movements
    for item in &items {
        // Restore stock to inventory
        if let Some(pid) = item.product_id {
            if pid > 0 {
                let _ = tx.execute(
                    "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes)
                     VALUES (?1, ?2, 'return', ?3, ?4, ?5)",
                    rusqlite::params![pid, item.quantity as i32, bill_id, user_id, reason],
                );
                let _ = tx.execute(
                    "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
                     ON CONFLICT(product_id) DO UPDATE SET current_stock = current_stock + ?3, updated_at = datetime('now')",
                    rusqlite::params![pid, item.quantity as i32, item.quantity as i32],
                );
            }
        }

        // Deduct returned quantity from bill_items
        let item_data: Option<(i64, i64, i32, i32)> = tx.query_row(
            "SELECT quantity, unit_price_paise, gst_enabled, gst_percentage_x100 FROM bill_items WHERE id = ?1",
            rusqlite::params![item.bill_item_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).ok();

        if let Some((current_qty, unit_price, gst_enabled, gst_percentage_x100)) = item_data {
            let new_item_qty = (current_qty - item.quantity).max(0);
            if new_item_qty <= 0 {
                // If entire quantity returned, remove from active bill items so it does not show in bill details/history
                let _ = tx.execute(
                    "DELETE FROM bill_items WHERE id = ?1",
                    rusqlite::params![item.bill_item_id],
                );
            } else {
                let new_line_total = new_item_qty * unit_price;
                let new_gst_amount = if gst_enabled == 1 && gst_percentage_x100 > 0 {
                    (new_line_total * gst_percentage_x100 as i64) / 10000
                } else {
                    0
                };
                let _ = tx.execute(
                    "UPDATE bill_items SET quantity = ?1, line_total_paise = ?2, gst_amount_paise = ?3 WHERE id = ?4",
                    rusqlite::params![new_item_qty, new_line_total, new_gst_amount, item.bill_item_id],
                );
            }
        }
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
        rusqlite::params![user_id, bill_id, details],
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

