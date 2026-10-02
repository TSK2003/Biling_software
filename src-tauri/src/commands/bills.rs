use tauri::State;
use crate::AppState;
use crate::models::{Bill, BillDetail, BillItem, Payment, PaginatedResponse, ReturnedBillItemRecord};

#[tauri::command]
pub fn get_bills(
    state: State<'_, AppState>,
    business_date: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    status: Option<String>,
    payment_method: Option<String>,
    search: Option<String>,
    category_id: Option<i64>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<PaginatedResponse<Bill>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, fetch bills from Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("http://{}:{}/api/bills", host_ip, host_port);
        let mut req = client.get(&url);
        if let Some(ref d) = business_date {
            req = req.query(&[("business_date", d)]);
        }
        if let Some(ref from) = date_from {
            req = req.query(&[("date_from", from)]);
        }
        if let Some(ref to) = date_to {
            req = req.query(&[("date_to", to)]);
        }
        if let Some(ref s) = status {
            req = req.query(&[("status", s)]);
        }
        if let Some(ref pm) = payment_method {
            req = req.query(&[("payment_method", pm)]);
        }
        if let Some(ref q) = search {
            req = req.query(&[("search", q)]);
        }
        if let Some(cat) = category_id {
            req = req.query(&[("category_id", cat.to_string())]);
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

        let bills_json: Vec<serde_json::Value> = resp.json()
            .map_err(|e| format!("Invalid bills response from Host: {}", e))?;

        let bills: Vec<Bill> = bills_json.into_iter().map(|b| Bill {
            id: b["id"].as_i64().unwrap_or(0),
            bill_uuid: b["bill_uuid"].as_str().unwrap_or("").to_string(),
            bill_number: b["bill_number"].as_i64().unwrap_or(0) as i32,
            business_date: b["business_date"].as_str().unwrap_or("").to_string(),
            bill_time: b["bill_time"].as_str().unwrap_or("").to_string(),
            user_id: 1,
            user_name: Some(b["cashier_name"].as_str().unwrap_or("Staff").to_string()),
            subtotal_paise: b["subtotal_paise"].as_i64().unwrap_or(b["grand_total_paise"].as_i64().unwrap_or(0)),
            discount_type: b["discount_type"].as_str().unwrap_or("none").to_string(),
            discount_value_x100: b["discount_value_x100"].as_i64().unwrap_or(0) as i32,
            discount_amount_paise: b["discount_amount_paise"].as_i64().unwrap_or(0),
            gst_total_paise: b["gst_total_paise"].as_i64().unwrap_or(0),
            grand_total_paise: b["grand_total_paise"].as_i64().unwrap_or(0),
            status: b["status"].as_str().unwrap_or("completed").to_string(),
            void_reason: b["void_reason"].as_str().map(|s| s.to_string()),
            payment_method: Some(b["payment_method"].as_str().unwrap_or("cash").to_string()),
            created_at: b["created_at"].as_str().unwrap_or("").to_string(),
        }).collect();

        let total = bills.len() as i64;
        return Ok(PaginatedResponse {
            data: bills,
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
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    
    // Sanitize date_from and date_to range if both provided
    let (sanitized_from, sanitized_to) = match (&date_from, &date_to) {
        (Some(f), Some(t)) if !f.trim().is_empty() && !t.trim().is_empty() => {
            let f_t = f.trim();
            let t_t = t.trim();
            if f_t <= t_t {
                (Some(f_t.to_string()), Some(t_t.to_string()))
            } else {
                (Some(t_t.to_string()), Some(f_t.to_string()))
            }
        }
        _ => (
            date_from.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            date_to.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        ),
    };

    if let Some(ref date) = business_date {
        let d = date.trim();
        if !d.is_empty() {
            conditions.push(format!("(b.business_date = ?{0} OR substr(b.created_at, 1, 10) = ?{0})", params.len() + 1));
            params.push(Box::new(d.to_string()));
        }
    }
    if let Some(ref from) = sanitized_from {
        conditions.push(format!("(b.business_date >= ?{0} OR substr(b.created_at, 1, 10) >= ?{0})", params.len() + 1));
        params.push(Box::new(from.to_string()));
    }
    if let Some(ref to) = sanitized_to {
        conditions.push(format!("(b.business_date <= ?{0} OR substr(b.created_at, 1, 10) <= ?{0})", params.len() + 1));
        params.push(Box::new(to.to_string()));
    }
    if let Some(ref s) = status {
        let s = s.trim();
        if !s.is_empty() {
            conditions.push(format!("b.status = ?{}", params.len() + 1));
            params.push(Box::new(s.to_string()));
        }
    }
    if let Some(ref pm) = payment_method {
        let pm = pm.trim();
        if !pm.is_empty() {
            conditions.push(format!("p.payment_method = ?{}", params.len() + 1));
            params.push(Box::new(pm.to_string()));
        }
    }
    if let Some(ref q) = search {
        let q = q.trim();
        if !q.is_empty() {
            conditions.push(format!(
                "(CAST(b.bill_number AS TEXT) LIKE ?{0} OR u.display_name LIKE ?{0} OR EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id = b.id AND (bi.product_name_snapshot LIKE ?{0} OR bi.category_name_snapshot LIKE ?{0})))",
                params.len() + 1
            ));
            params.push(Box::new(format!("%{}%", q)));
        }
    }
    if let Some(cat_id) = category_id {
        conditions.push(format!(
            "EXISTS (SELECT 1 FROM bill_items bi LEFT JOIN products p ON bi.product_id = p.id WHERE bi.bill_id = b.id AND (p.category_id = ?{0} OR bi.category_name_snapshot = (SELECT name FROM categories WHERE id = ?{0})))",
            params.len() + 1
        ));
        params.push(Box::new(cat_id));
    }
    
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    
    // Count
    let count_sql = format!("SELECT COUNT(*) FROM bills b LEFT JOIN users u ON b.user_id = u.id {}", where_clause);
    let total: i64 = db.conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        |row| row.get(0),
    ).unwrap_or(0);
    
    // Data
    let data_sql = format!(
        "SELECT b.id, b.bill_uuid, b.bill_number, b.business_date, b.bill_time,
                b.user_id, u.display_name, b.subtotal_paise, b.discount_type,
                b.discount_value_x100, b.discount_amount_paise, b.gst_total_paise,
                b.grand_total_paise, b.status, b.void_reason,
                p.payment_method, b.created_at
         FROM bills b
         LEFT JOIN users u ON b.user_id = u.id
         LEFT JOIN payments p ON b.id = p.bill_id
         {}
         ORDER BY b.business_date DESC, b.bill_number DESC
         LIMIT ?{} OFFSET ?{}",
        where_clause,
        params.len() + 1,
        params.len() + 2
    );
    
    params.push(Box::new(page_size));
    params.push(Box::new(offset));
    
    let mut stmt = db.conn.prepare(&data_sql).map_err(|e| format!("Query error: {}", e))?;
    let bills: Vec<Bill> = stmt.query_map(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        |row| {
            Ok(Bill {
                id: row.get(0)?,
                bill_uuid: row.get(1)?,
                bill_number: row.get(2)?,
                business_date: row.get(3)?,
                bill_time: row.get(4)?,
                user_id: row.get(5)?,
                user_name: row.get(6)?,
                subtotal_paise: row.get(7)?,
                discount_type: row.get(8)?,
                discount_value_x100: row.get(9)?,
                discount_amount_paise: row.get(10)?,
                gst_total_paise: row.get(11)?,
                grand_total_paise: row.get(12)?,
                status: row.get(13)?,
                void_reason: row.get(14)?,
                payment_method: row.get(15)?,
                created_at: row.get(16)?,
            })
        },
    ).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(PaginatedResponse {
        data: bills,
        total,
        page,
        page_size,
        total_pages: ((total as f64) / (page_size as f64)).ceil() as i32,
    })
}

#[tauri::command]
pub fn get_bill_detail(state: State<'_, AppState>, bill_id: i64) -> Result<BillDetail, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // If in Client mode, fetch bill detail from Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("http://{}:{}/api/bills/{}", host_ip, host_port, bill_id);
        let resp = client.get(&url)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            return Err(format!("Host returned error: {}", resp.status()));
        }

        let detail: BillDetail = resp.json()
            .map_err(|e| format!("Invalid bill detail from Host: {}", e))?;
        return Ok(detail);
    }
    
    let bill = db.conn.query_row(
        "SELECT b.id, b.bill_uuid, b.bill_number, b.business_date, b.bill_time,
                b.user_id, u.display_name, b.subtotal_paise, b.discount_type,
                b.discount_value_x100, b.discount_amount_paise, b.gst_total_paise,
                b.grand_total_paise, b.status, b.void_reason,
                p.payment_method, b.created_at
         FROM bills b
         LEFT JOIN users u ON b.user_id = u.id
         LEFT JOIN payments p ON b.id = p.bill_id
         WHERE b.id = ?1",
        rusqlite::params![bill_id],
        |row| {
            Ok(Bill {
                id: row.get(0)?,
                bill_uuid: row.get(1)?,
                bill_number: row.get(2)?,
                business_date: row.get(3)?,
                bill_time: row.get(4)?,
                user_id: row.get(5)?,
                user_name: row.get(6)?,
                subtotal_paise: row.get(7)?,
                discount_type: row.get(8)?,
                discount_value_x100: row.get(9)?,
                discount_amount_paise: row.get(10)?,
                gst_total_paise: row.get(11)?,
                grand_total_paise: row.get(12)?,
                status: row.get(13)?,
                void_reason: row.get(14)?,
                payment_method: row.get(15)?,
                created_at: row.get(16)?,
            })
        },
    ).map_err(|_| "Bill not found".to_string())?;
    
    // Get items
    let mut stmt = db.conn.prepare(
        "SELECT bi.id, bi.bill_id, bi.product_id,
                COALESCE(NULLIF(bi.product_code_snapshot, ''), p.product_code, 'N/A') as product_code_snapshot,
                COALESCE(NULLIF(bi.product_name_snapshot, ''), p.name, 'Item') as product_name_snapshot,
                COALESCE(NULLIF(bi.category_name_snapshot, ''), c.name, 'General') as category_name_snapshot,
                bi.unit_price_paise, bi.quantity, bi.gst_enabled,
                bi.gst_percentage_x100, bi.gst_amount_paise, bi.line_total_paise,
                COALESCE(bi.returned_quantity, 0) as returned_quantity
         FROM bill_items bi
         LEFT JOIN products p ON bi.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE bi.bill_id = ?1
         ORDER BY bi.sort_order ASC, bi.id ASC"
    ).map_err(|e| format!("Query error: {}", e))?;
    
    let items: Vec<BillItem> = stmt.query_map(rusqlite::params![bill_id], |row| {
        Ok(BillItem {
            id: row.get(0)?,
            bill_id: row.get(1)?,
            product_id: row.get(2)?,
            product_code_snapshot: row.get(3)?,
            product_name_snapshot: row.get(4)?,
            category_name_snapshot: row.get(5)?,
            unit_price_paise: row.get(6)?,
            quantity: row.get(7)?,
            gst_enabled: row.get::<_, i32>(8)? == 1,
            gst_percentage_x100: row.get(9)?,
            gst_amount_paise: row.get(10)?,
            line_total_paise: row.get(11)?,
            returned_quantity: row.get(12).unwrap_or(0),
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    // Get payment
    let payment = db.conn.query_row(
        "SELECT id, bill_id, payment_method, total_amount_paise, cash_amount_paise, card_amount_paise, upi_amount_paise, created_at
         FROM payments WHERE bill_id = ?1",
        rusqlite::params![bill_id],
        |row| {
            Ok(Payment {
                id: row.get(0)?,
                bill_id: row.get(1)?,
                payment_method: row.get(2)?,
                total_amount_paise: row.get(3)?,
                cash_amount_paise: row.get(4)?,
                card_amount_paise: row.get(5)?,
                upi_amount_paise: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    ).map_err(|_| "Payment record not found".to_string())?;

    // Get returned items history
    let mut returned_items: Vec<ReturnedBillItemRecord> = {
        let ret_stmt = db.conn.prepare(
            "SELECT bri.id, bri.bill_id, bri.bill_item_id, bri.product_id, bri.product_name,
                    bri.product_code, bri.quantity, bri.unit_price_paise, bri.line_total_paise,
                    COALESCE(br.reason, 'Customer Return'), bri.created_at, u.display_name
             FROM bill_return_items bri
             LEFT JOIN bill_returns br ON bri.bill_return_id = br.id
             LEFT JOIN users u ON br.user_id = u.id
             WHERE bri.bill_id = ?1
             ORDER BY bri.id ASC"
        ).ok();

        if let Some(mut stmt) = ret_stmt {
            stmt.query_map(rusqlite::params![bill_id], |row| {
                Ok(ReturnedBillItemRecord {
                    id: row.get(0)?,
                    bill_id: row.get(1)?,
                    bill_item_id: row.get(2)?,
                    product_id: row.get(3)?,
                    product_name: row.get(4)?,
                    product_code: row.get(5)?,
                    quantity: row.get(6)?,
                    unit_price_paise: row.get(7)?,
                    line_total_paise: row.get(8)?,
                    reason: row.get(9)?,
                    returned_at: row.get(10)?,
                    returned_by_name: row.get(11)?,
                })
            }).map(|mapped| mapped.filter_map(|r| r.ok()).collect()).unwrap_or_default()
        } else {
            Vec::new()
        }
    };

    // Fallback: If no bill_return_items rows exist yet, but items have returned_quantity > 0
    if returned_items.is_empty() {
        for it in &items {
            if it.returned_quantity > 0 {
                returned_items.push(ReturnedBillItemRecord {
                    id: it.id,
                    bill_id: it.bill_id,
                    bill_item_id: it.id,
                    product_id: it.product_id,
                    product_name: it.product_name_snapshot.clone(),
                    product_code: it.product_code_snapshot.clone(),
                    quantity: it.returned_quantity,
                    unit_price_paise: it.unit_price_paise,
                    line_total_paise: it.unit_price_paise * (it.returned_quantity as i64),
                    reason: bill.void_reason.clone().unwrap_or_else(|| "Customer Return".to_string()),
                    returned_at: bill.created_at.clone(),
                    returned_by_name: bill.user_name.clone(),
                });
            }
        }
    }
    
    Ok(BillDetail { bill, items, payment, returned_items })
}

#[tauri::command]
pub fn void_bill(
    state: State<'_, AppState>,
    bill_id: i64,
    user_id: i64,
    reason: String,
) -> Result<(), String> {
    // Backend authorization: require admin for voiding bills
    crate::commands::auth::require_admin()?;

    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    // If in Client mode, forward void request to Host PC
    if let Some((host_ip, host_port)) = crate::network::client::get_client_mode_host(&db.conn) {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("http://{}:{}/api/bills/{}/void", host_ip, host_port, bill_id);
        let payload = serde_json::json!({
            "user_id": user_id,
            "reason": reason.trim(),
        });

        let resp = client.post(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Cannot reach Shop Main Computer at {}: {}", host_ip, e))?;

        if !resp.status().is_success() {
            let err_msg = resp.text().unwrap_or_else(|_| "Host failed to void bill".to_string());
            return Err(err_msg);
        }

        return Ok(());
    }

    // Check if bill exists and is not already voided
    let status: String = db.conn.query_row(
        "SELECT status FROM bills WHERE id = ?1",
        rusqlite::params![bill_id],
        |row| row.get(0),
    ).map_err(|_| "Bill not found".to_string())?;
    
    if status != "completed" && status != "returned" {
        return Err(format!("Bill cannot be voided because it is already {}", status));
    }
    
    if reason.trim().is_empty() {
        return Err("Void reason is required".to_string());
    }
    
    // P0 FIX: Use a transaction for atomicity — all-or-nothing void operation
    let tx = db.conn.unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    // Safe foreign key validation for user_id to prevent FOREIGN KEY constraint failed
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

    // P0 FIX: Restore inventory stock for all bill items before zeroing financials
    {
        let mut items_stmt = tx.prepare(
            "SELECT bi.product_id, bi.quantity FROM bill_items bi WHERE bi.bill_id = ?1 AND bi.product_id IS NOT NULL AND bi.quantity > 0"
        ).map_err(|e| format!("Failed to read bill items for stock restore: {}", e))?;
        
        let items: Vec<(i64, i32)> = items_stmt.query_map(rusqlite::params![bill_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i32>(1)?))
        }).map_err(|e| format!("Query error reading bill items: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

        for (product_id, quantity) in &items {
            // Restore stock in inventory table
            tx.execute(
                "UPDATE inventory SET current_stock = current_stock + ?1, updated_at = datetime('now') WHERE product_id = ?2",
                rusqlite::params![quantity, product_id],
            ).map_err(|e| format!("Failed to restore stock for product {}: {}", product_id, e))?;
            
            // Record reversal stock movement for audit trail
            tx.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes) VALUES (?1, ?2, 'return', ?3, ?4, ?5)",
                rusqlite::params![product_id, *quantity as i32, bill_id, valid_user_id, format!("Stock restored: bill #{} voided. Reason: {}", bill_id, reason.trim())],
            ).map_err(|e| format!("Failed to record stock reversal for product {}: {}", product_id, e))?;
        }
    }

    // Update bill status and zero out financial fields
    tx.execute(
        "UPDATE bills SET status = 'voided', void_reason = ?1, voided_by_user_id = ?2, voided_at = datetime('now'), grand_total_paise = 0, subtotal_paise = 0, updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![reason.trim(), valid_user_id, bill_id],
    ).map_err(|e| format!("Failed to void bill: {}", e))?;
    
    // Zero out payment record
    tx.execute(
        "UPDATE payments SET total_amount_paise = 0, cash_amount_paise = 0, upi_amount_paise = 0, card_amount_paise = 0 WHERE bill_id = ?1",
        rusqlite::params![bill_id],
    ).map_err(|e| format!("Failed to zero payment record: {}", e))?;
    
    // Audit log — must succeed
    tx.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json) VALUES (?1, 'void', 'bill', ?2, ?3)",
        rusqlite::params![valid_user_id, bill_id, format!("{{\"reason\":\"{}\"}}", reason.trim())],
    ).map_err(|e| format!("Audit log failed: {}", e))?;

    // Commit the atomic void operation
    tx.commit().map_err(|e| format!("Failed to commit void operation: {}", e))?;
    
    Ok(())
}
