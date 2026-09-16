use tauri::State;
use crate::AppState;
use crate::models::{Bill, BillDetail, BillItem, Payment, PaginatedResponse};

#[tauri::command]
pub fn get_bills(
    state: State<'_, AppState>,
    business_date: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    status: Option<String>,
    search: Option<String>,
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
        let resp = client.get(&url)
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
            user_name: Some(b["cashier_name"].as_str().unwrap_or("Host Admin").to_string()),
            subtotal_paise: b["grand_total_paise"].as_i64().unwrap_or(0),
            discount_type: "none".to_string(),
            discount_value_x100: 0,
            discount_amount_paise: 0,
            gst_total_paise: 0,
            grand_total_paise: b["grand_total_paise"].as_i64().unwrap_or(0),
            status: b["status"].as_str().unwrap_or("completed").to_string(),
            void_reason: None,
            payment_method: Some(b["payment_method"].as_str().unwrap_or("cash").to_string()),
            created_at: b["business_date"].as_str().unwrap_or("").to_string(),
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
    
    if let Some(ref date) = business_date {
        conditions.push(format!("b.business_date = ?{}", params.len() + 1));
        params.push(Box::new(date.clone()));
    }
    if let Some(ref from) = date_from {
        conditions.push(format!("b.business_date >= ?{}", params.len() + 1));
        params.push(Box::new(from.clone()));
    }
    if let Some(ref to) = date_to {
        conditions.push(format!("b.business_date <= ?{}", params.len() + 1));
        params.push(Box::new(to.clone()));
    }
    if let Some(ref s) = status {
        conditions.push(format!("b.status = ?{}", params.len() + 1));
        params.push(Box::new(s.clone()));
    }
    if let Some(ref q) = search {
        let q = q.trim();
        if !q.is_empty() {
            conditions.push(format!("(CAST(b.bill_number AS TEXT) LIKE ?{} OR u.display_name LIKE ?{})", params.len() + 1, params.len() + 1));
            params.push(Box::new(format!("%{}%", q)));
        }
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
        "SELECT id, bill_id, product_id, product_code_snapshot, product_name_snapshot,
                category_name_snapshot, unit_price_paise, quantity, gst_enabled,
                gst_percentage_x100, gst_amount_paise, line_total_paise
         FROM bill_items WHERE bill_id = ?1 ORDER BY sort_order"
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
    
    Ok(BillDetail { bill, items, payment })
}

#[tauri::command]
pub fn void_bill(
    state: State<'_, AppState>,
    bill_id: i64,
    user_id: i64,
    reason: String,
) -> Result<(), String> {
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
    
    if status != "completed" {
        return Err(format!("Bill is already {}", status));
    }
    
    if reason.trim().is_empty() {
        return Err("Void reason is required".to_string());
    }
    
    db.conn.execute(
        "UPDATE bills SET status = 'voided', void_reason = ?1, voided_by_user_id = ?2, voided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![reason.trim(), user_id, bill_id],
    ).map_err(|e| format!("Failed to void bill: {}", e))?;
    
    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json) VALUES (?1, 'void', 'bill', ?2, ?3)",
        rusqlite::params![user_id, bill_id, format!("{{\"reason\":\"{}\"}}", reason.trim())],
    );
    
    Ok(())
}
