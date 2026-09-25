use tauri::State;
use crate::AppState;
use crate::models::{DashboardStats, Bill, SalesTrendItem};

#[tauri::command]
pub fn get_dashboard_stats(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> Result<DashboardStats, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let stats = db.conn.query_row(
        "SELECT
            COALESCE(SUM(b.grand_total_paise), 0) as total_sales,
            COUNT(b.id) as total_bills,
            COALESCE(SUM(b.discount_amount_paise), 0) as total_discount,
            COALESCE(SUM(b.gst_total_paise), 0) as total_gst,
            COALESCE(SUM(p.cash_amount_paise), 0) as cash_sales,
            COALESCE(SUM(p.upi_amount_paise), 0) as upi_sales,
            COALESCE(SUM(p.card_amount_paise), 0) as card_sales
         FROM bills b
         LEFT JOIN payments p ON b.id = p.bill_id
         WHERE b.status IN ('completed', 'returned')
           AND b.business_date >= ?1 AND b.business_date <= ?2",
        rusqlite::params![date_from, date_to],
        |row| {
            let total_sales: i64 = row.get(0)?;
            let total_bills: i64 = row.get(1)?;
            Ok(DashboardStats {
                total_sales_paise: total_sales,
                total_bills,
                total_items_sold: 0, // Will be filled below
                cash_sales_paise: row.get(4)?,
                upi_sales_paise: row.get(5)?,
                card_sales_paise: row.get(6)?,
                total_discount_paise: row.get(2)?,
                total_gst_paise: row.get(3)?,
                avg_bill_paise: if total_bills > 0 { total_sales / total_bills } else { 0 },
            })
        },
    ).map_err(|e| format!("Stats query error: {}", e))?;
    
    // Get total items sold
    let total_items: i64 = db.conn.query_row(
        "SELECT COALESCE(SUM(bi.quantity), 0)
         FROM bill_items bi
         JOIN bills b ON bi.bill_id = b.id
         WHERE b.status IN ('completed', 'returned')
           AND b.business_date >= ?1 AND b.business_date <= ?2",
        rusqlite::params![date_from, date_to],
        |row| row.get(0),
    ).unwrap_or(0);
    
    Ok(DashboardStats {
        total_items_sold: total_items,
        ..stats
    })
}

#[tauri::command]
pub fn get_recent_bills(state: State<'_, AppState>, limit: Option<i32>) -> Result<Vec<Bill>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let limit = limit.unwrap_or(10);
    
    let mut stmt = db.conn.prepare(
        "SELECT b.id, b.bill_uuid, b.bill_number, b.business_date, b.bill_time,
                b.user_id, u.display_name, b.subtotal_paise, b.discount_type,
                b.discount_value_x100, b.discount_amount_paise, b.gst_total_paise,
                b.grand_total_paise, b.status, b.void_reason,
                p.payment_method, b.created_at
         FROM bills b
         LEFT JOIN users u ON b.user_id = u.id
         LEFT JOIN payments p ON b.id = p.bill_id
         ORDER BY b.created_at DESC
         LIMIT ?1"
    ).map_err(|e| format!("Query error: {}", e))?;
    
    let bills: Vec<Bill> = stmt.query_map(rusqlite::params![limit], |row| {
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
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(bills)
}

#[tauri::command]
pub fn get_sales_trend(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> Result<Vec<SalesTrendItem>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let mut stmt = db.conn.prepare(
        "SELECT business_date,
                COALESCE(SUM(grand_total_paise), 0) as total_sales,
                COUNT(id) as bill_count
         FROM bills
         WHERE status IN ('completed', 'returned')
           AND business_date >= ?1 AND business_date <= ?2
         GROUP BY business_date
         ORDER BY business_date ASC"
    ).map_err(|e| format!("Query error: {}", e))?;
    
    let trend: Vec<SalesTrendItem> = stmt.query_map(
        rusqlite::params![date_from, date_to],
        |row| {
            Ok(SalesTrendItem {
                date: row.get(0)?,
                total_sales_paise: row.get(1)?,
                bill_count: row.get(2)?,
            })
        },
    ).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(trend)
}
