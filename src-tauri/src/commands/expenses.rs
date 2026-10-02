use tauri::State;
use rusqlite::params;
use crate::AppState;
use crate::models::{
    Expense, ExpenseCategory, ExpenseSummary, CategoryExpenseTotal,
    CreateExpenseRequest, UpdateExpenseRequest, ExpensesFilterRequest,
    PaginatedResponse,
};
use crate::commands::auth;

// ========== EXPENSE CATEGORIES ==========

#[tauri::command]
pub fn get_expense_categories(
    state: State<'_, AppState>,
    active_only: Option<bool>,
) -> Result<Vec<ExpenseCategory>, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let sql = if active_only.unwrap_or(false) {
        "SELECT id, name, description, is_active, sort_order, created_at, updated_at
         FROM expense_categories
         WHERE is_active = 1
         ORDER BY sort_order ASC, name ASC"
    } else {
        "SELECT id, name, description, is_active, sort_order, created_at, updated_at
         FROM expense_categories
         ORDER BY sort_order ASC, name ASC"
    };

    let mut stmt = db.conn.prepare(sql).map_err(|e| e.to_string())?;
    let categories: Vec<ExpenseCategory> = stmt
        .query_map([], |row| {
            Ok(ExpenseCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                is_active: row.get::<_, i32>(3)? == 1,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(categories)
}

#[tauri::command]
pub fn create_expense_category(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    sort_order: Option<i32>,
) -> Result<ExpenseCategory, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Category name cannot be empty".to_string());
    }

    let sort = sort_order.unwrap_or(0);

    db.conn.execute(
        "INSERT INTO expense_categories (name, description, sort_order) VALUES (?1, ?2, ?3)",
        params![name, description, sort],
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "An expense category with this name already exists".to_string()
        } else {
            format!("Failed to create category: {}", e)
        }
    })?;

    let id = db.conn.last_insert_rowid();

    db.conn.query_row(
        "SELECT id, name, description, is_active, sort_order, created_at, updated_at
         FROM expense_categories WHERE id = ?1",
        params![id],
        |row| {
            Ok(ExpenseCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                is_active: row.get::<_, i32>(3)? == 1,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_expense_category(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    sort_order: Option<i32>,
    is_active: Option<bool>,
) -> Result<ExpenseCategory, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    if let Some(ref n) = name {
        let trimmed = n.trim();
        if trimmed.is_empty() {
            return Err("Category name cannot be empty".to_string());
        }
        db.conn.execute(
            "UPDATE expense_categories SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![trimmed, id],
        ).map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "An expense category with this name already exists".to_string()
            } else {
                e.to_string()
            }
        })?;
    }

    if let Some(desc) = description {
        db.conn.execute(
            "UPDATE expense_categories SET description = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![desc, id],
        ).map_err(|e| e.to_string())?;
    }

    if let Some(sort) = sort_order {
        db.conn.execute(
            "UPDATE expense_categories SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![sort, id],
        ).map_err(|e| e.to_string())?;
    }

    if let Some(active) = is_active {
        db.conn.execute(
            "UPDATE expense_categories SET is_active = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![if active { 1 } else { 0 }, id],
        ).map_err(|e| e.to_string())?;
    }

    db.conn.query_row(
        "SELECT id, name, description, is_active, sort_order, created_at, updated_at
         FROM expense_categories WHERE id = ?1",
        params![id],
        |row| {
            Ok(ExpenseCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                is_active: row.get::<_, i32>(3)? == 1,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_expense_category(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // Check if any expenses use this category
    let count: i64 = db.conn.query_row(
        "SELECT COUNT(*) FROM expenses WHERE category_id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap_or(0);

    if count > 0 {
        // Soft delete by deactivating so historical records are preserved
        db.conn.execute(
            "UPDATE expense_categories SET is_active = 0, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        ).map_err(|e| e.to_string())?;
        return Ok(());
    }

    db.conn.execute(
        "DELETE FROM expense_categories WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ========== EXPENSES CRUD & WORKFLOW ==========

#[tauri::command]
pub fn create_expense(
    state: State<'_, AppState>,
    request: CreateExpenseRequest,
) -> Result<Expense, String> {
    auth::require_screen_access("expenses")?;
    let current_user = auth::get_authenticated_user()?;
    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    if request.title.trim().is_empty() {
        return Err("Expense title is required".to_string());
    }
    if request.amount_paise <= 0 {
        return Err("Expense amount must be greater than zero".to_string());
    }

    let tx = db.conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    // 1. Increment atomic sequence number
    let next_number: i32 = tx.query_row(
        "UPDATE expense_number_seq SET last_number = last_number + 1 WHERE id = 1 RETURNING last_number",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| {
        let max_num: i32 = tx.query_row(
            "SELECT COALESCE(MAX(expense_number), 0) FROM expenses",
            [],
            |r| r.get(0),
        ).unwrap_or(0);
        let n = max_num + 1;
        let _ = tx.execute("INSERT OR REPLACE INTO expense_number_seq (id, last_number) VALUES (1, ?1)", params![n]);
        n
    });

    let paid_by = request.paid_by_user_id.unwrap_or(current_user.id);
    let payment_method = match request.payment_method.to_lowercase().as_str() {
        "cash" | "card" | "upi" | "bank_transfer" | "cheque" => request.payment_method.to_lowercase(),
        _ => "cash".to_string(),
    };

    let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    tx.execute(
        "INSERT INTO expenses (
            expense_number, expense_date, category_id, title, description,
            amount_paise, payment_method, paid_by_user_id, payee, reference_number,
            notes, status, created_by, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active', ?12, ?13, ?13)",
        params![
            next_number,
            request.expense_date,
            request.category_id,
            request.title.trim(),
            request.description,
            request.amount_paise,
            payment_method,
            paid_by,
            request.payee,
            request.reference_number,
            request.notes,
            current_user.id,
            now_str,
        ],
    ).map_err(|e| format!("Failed to record expense: {}", e))?;

    let expense_id = tx.last_insert_rowid();

    let _ = tx.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json)
         VALUES (?1, 'create', 'expense', ?2, ?3)",
        params![
            current_user.id,
            expense_id,
            format!("{{\"title\":\"{}\",\"amount\":{},\"expense_number\":{}}}", request.title.trim().replace('"', "\\\""), request.amount_paise, next_number)
        ],
    );

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    get_expense_detail_internal(&db.conn, expense_id)
}

#[tauri::command]
pub fn update_expense(
    state: State<'_, AppState>,
    request: UpdateExpenseRequest,
) -> Result<Expense, String> {
    auth::require_screen_access("expenses")?;
    let current_user = auth::get_authenticated_user()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // Check status first
    let current_status: String = db.conn.query_row(
        "SELECT status FROM expenses WHERE id = ?1",
        params![request.id],
        |r| r.get(0),
    ).map_err(|_| "Expense not found".to_string())?;

    if current_status == "cancelled" {
        return Err("Cannot modify a cancelled expense".to_string());
    }

    if let Some(ref date) = request.expense_date {
        db.conn.execute("UPDATE expenses SET expense_date = ?1 WHERE id = ?2", params![date, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(cat_id) = request.category_id {
        db.conn.execute("UPDATE expenses SET category_id = ?1 WHERE id = ?2", params![cat_id, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref title) = request.title {
        let t = title.trim();
        if t.is_empty() { return Err("Title cannot be empty".to_string()); }
        db.conn.execute("UPDATE expenses SET title = ?1 WHERE id = ?2", params![t, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref desc) = request.description {
        db.conn.execute("UPDATE expenses SET description = ?1 WHERE id = ?2", params![desc, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(amount) = request.amount_paise {
        if amount <= 0 { return Err("Amount must be greater than zero".to_string()); }
        db.conn.execute("UPDATE expenses SET amount_paise = ?1 WHERE id = ?2", params![amount, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref method) = request.payment_method {
        db.conn.execute("UPDATE expenses SET payment_method = ?1 WHERE id = ?2", params![method, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(paid_by) = request.paid_by_user_id {
        db.conn.execute("UPDATE expenses SET paid_by_user_id = ?1 WHERE id = ?2", params![paid_by, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref payee) = request.payee {
        db.conn.execute("UPDATE expenses SET payee = ?1 WHERE id = ?2", params![payee, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref ref_no) = request.reference_number {
        db.conn.execute("UPDATE expenses SET reference_number = ?1 WHERE id = ?2", params![ref_no, request.id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref notes) = request.notes {
        db.conn.execute("UPDATE expenses SET notes = ?1 WHERE id = ?2", params![notes, request.id]).map_err(|e| e.to_string())?;
    }

    db.conn.execute(
        "UPDATE expenses SET updated_by = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![current_user.id, request.id],
    ).map_err(|e| e.to_string())?;

    let _ = db.conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json)
         VALUES (?1, 'update', 'expense', ?2, ?3)",
        params![current_user.id, request.id, format!("{{\"id\":{}}}", request.id)],
    );

    get_expense_detail_internal(&db.conn, request.id)
}

#[tauri::command]
pub fn cancel_expense(
    state: State<'_, AppState>,
    id: i64,
    reason: String,
) -> Result<(), String> {
    auth::require_screen_access("expenses")?;
    let current_user = auth::get_authenticated_user()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let reason = reason.trim().to_string();
    if reason.is_empty() {
        return Err("Cancellation reason is required".to_string());
    }

    let (status, exp_ref, exp_notes, exp_title, exp_number): (String, Option<String>, Option<String>, String, i32) = db.conn.query_row(
        "SELECT status, reference_number, notes, title, expense_number FROM expenses WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    ).map_err(|_| "Expense not found".to_string())?;

    if status == "cancelled" {
        return Err("Expense is already cancelled".to_string());
    }

    // Check if this expense is linked to a stock purchase / restock
    let mut stock_qty_to_revert: Option<i32> = None;
    let mut target_product_id: Option<i64> = None;

    if let Some(ref note_str) = exp_notes {
        if note_str.starts_with("STOCK_PURCHASE|") {
            let prefix = note_str.split(" - ").next().unwrap_or("");
            for part in prefix.split('|') {
                if let Some(pid_val) = part.strip_prefix("pid:") {
                    if let Ok(p) = pid_val.parse::<i64>() {
                        target_product_id = Some(p);
                    }
                } else if let Some(qty_val) = part.strip_prefix("qty:") {
                    if let Ok(q) = qty_val.parse::<i32>() {
                        stock_qty_to_revert = Some(q);
                    }
                }
            }
        }
    }

    // Fallback: If not found via structured note (older records), detect via reference_number (product_code) and title
    if target_product_id.is_none() || stock_qty_to_revert.is_none() {
        if let Some(ref code) = exp_ref {
            if let Ok(pid) = db.conn.query_row("SELECT id FROM products WHERE product_code = ?1", params![code], |r| r.get::<_, i64>(0)) {
                target_product_id = Some(pid);
                // Extract quantity from title "Stock Purchase: Name (10 units)"
                if let Some(start) = exp_title.rfind('(') {
                    if let Some(end) = exp_title.rfind(" units)") {
                        if start < end {
                            if let Ok(q) = exp_title[start + 1..end].trim().parse::<i32>() {
                                stock_qty_to_revert = Some(q);
                            }
                        }
                    }
                }
            }
        }
    }

    db.conn.execute(
        "UPDATE expenses SET 
            status = 'cancelled',
            cancelled_reason = ?1,
            cancelled_by = ?2,
            cancelled_at = ?3,
            updated_at = ?3
         WHERE id = ?4",
        params![reason, current_user.id, chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), id],
    ).map_err(|e| format!("Failed to cancel expense: {}", e))?;

    let _ = db.conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json)
         VALUES (?1, 'cancel', 'expense', ?2, ?3)",
        params![current_user.id, id, format!("{{\"expense_number\":{},\"reason\":\"{}\"}}", exp_number, reason.replace('"', "\\\""))],
    );

    // If it's a stock purchase, reduce the product's inventory!
    if let (Some(pid), Some(revert_qty)) = (target_product_id, stock_qty_to_revert) {
        if revert_qty > 0 {
            db.conn.execute(
                "UPDATE inventory SET current_stock = MAX(0, current_stock - ?1), updated_at = datetime('now') WHERE product_id = ?2",
                params![revert_qty, pid],
            ).map_err(|e| format!("Failed to reverse inventory: {}", e))?;

            let movement_note = format!("Stock reversed (-{} units) due to cancelled Expense #EXP-{:04}: {}", revert_qty, exp_number, reason);
            let _ = db.conn.execute(
                "INSERT INTO stock_movements (product_id, quantity_change, movement_type, user_id, notes) VALUES (?1, ?2, 'adjustment', ?3, ?4)",
                params![pid, -revert_qty, current_user.id, movement_note],
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_expense_detail(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Expense, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    get_expense_detail_internal(&db.conn, id)
}

fn get_expense_detail_internal(conn: &rusqlite::Connection, id: i64) -> Result<Expense, String> {
    let sql = "
        SELECT 
            e.id, e.expense_number, e.expense_date, e.category_id, c.name,
            e.title, e.description, e.amount_paise, e.payment_method,
            e.paid_by_user_id, u_paid.display_name, e.payee, e.reference_number,
            e.notes, e.status, e.cancelled_reason, e.cancelled_by, u_canc.display_name,
            e.cancelled_at, e.created_by, u_create.display_name, e.created_at,
            e.updated_by, e.updated_at
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        LEFT JOIN users u_paid ON e.paid_by_user_id = u_paid.id
        LEFT JOIN users u_canc ON e.cancelled_by = u_canc.id
        LEFT JOIN users u_create ON e.created_by = u_create.id
        WHERE e.id = ?1
    ";

    conn.query_row(sql, params![id], |row| {
        Ok(Expense {
            id: row.get(0)?,
            expense_number: row.get(1)?,
            expense_date: row.get(2)?,
            category_id: row.get(3)?,
            category_name: row.get(4)?,
            title: row.get(5)?,
            description: row.get(6)?,
            amount_paise: row.get(7)?,
            payment_method: row.get(8)?,
            paid_by_user_id: row.get(9)?,
            paid_by_name: row.get(10)?,
            payee: row.get(11)?,
            reference_number: row.get(12)?,
            notes: row.get(13)?,
            status: row.get(14)?,
            cancelled_reason: row.get(15)?,
            cancelled_by: row.get(16)?,
            cancelled_by_name: row.get(17)?,
            cancelled_at: row.get(18)?,
            created_by: row.get(19)?,
            created_by_name: row.get(20)?,
            created_at: row.get(21)?,
            updated_by: row.get(22)?,
            updated_at: row.get(23)?,
        })
    }).map_err(|e| format!("Expense not found: {}", e))
}

#[tauri::command]
pub fn get_expenses(
    state: State<'_, AppState>,
    filter: Option<ExpensesFilterRequest>,
) -> Result<PaginatedResponse<Expense>, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let filter = filter.unwrap_or(ExpensesFilterRequest {
        date_from: None,
        date_to: None,
        category_id: None,
        payment_method: None,
        status: None,
        search: None,
        page: None,
        page_size: None,
    });

    let page = filter.page.unwrap_or(1).max(1);
    let page_size = filter.page_size.unwrap_or(20).max(1).min(200);
    let offset = (page - 1) * page_size;

    let mut conditions = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref from) = filter.date_from {
        if !from.is_empty() {
            conditions.push("e.expense_date >= ?".to_string());
            params_vec.push(Box::new(from.clone()));
        }
    }

    if let Some(ref to) = filter.date_to {
        if !to.is_empty() {
            conditions.push("e.expense_date <= ?".to_string());
            params_vec.push(Box::new(to.clone()));
        }
    }

    if let Some(cat_id) = filter.category_id {
        if cat_id > 0 {
            conditions.push("e.category_id = ?".to_string());
            params_vec.push(Box::new(cat_id));
        }
    }

    if let Some(ref method) = filter.payment_method {
        if !method.is_empty() && method != "all" {
            conditions.push("e.payment_method = ?".to_string());
            params_vec.push(Box::new(method.clone()));
        }
    }

    if let Some(ref status) = filter.status {
        if !status.is_empty() && status != "all" {
            conditions.push("e.status = ?".to_string());
            params_vec.push(Box::new(status.clone()));
        }
    }

    if let Some(ref search) = filter.search {
        let s = search.trim();
        if !s.is_empty() {
            let pattern = format!("%{}%", s);
            conditions.push("(e.title LIKE ? OR e.payee LIKE ? OR e.reference_number LIKE ? OR e.notes LIKE ? OR e.description LIKE ? OR CAST(e.expense_number AS TEXT) LIKE ? OR ('EXP-' || printf('%04d', e.expense_number)) LIKE ?)".to_string());
            for _ in 0..7 {
                params_vec.push(Box::new(pattern.clone()));
            }
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Count query
    let count_sql = format!("SELECT COUNT(*) FROM expenses e {}", where_clause);
    let total: i64 = {
        let mut stmt = db.conn.prepare(&count_sql).map_err(|e| e.to_string())?;
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        stmt.query_row(rusqlite_params.as_slice(), |r| r.get(0)).unwrap_or(0)
    };

    // Data query
    let data_sql = format!(
        "SELECT 
            e.id, e.expense_number, e.expense_date, e.category_id, c.name,
            e.title, e.description, e.amount_paise, e.payment_method,
            e.paid_by_user_id, u_paid.display_name, e.payee, e.reference_number,
            e.notes, e.status, e.cancelled_reason, e.cancelled_by, u_canc.display_name,
            e.cancelled_at, e.created_by, u_create.display_name, e.created_at,
            e.updated_by, e.updated_at
         FROM expenses e
         LEFT JOIN expense_categories c ON e.category_id = c.id
         LEFT JOIN users u_paid ON e.paid_by_user_id = u_paid.id
         LEFT JOIN users u_canc ON e.cancelled_by = u_canc.id
         LEFT JOIN users u_create ON e.created_by = u_create.id
         {}
         ORDER BY e.expense_date DESC, e.id DESC
         LIMIT ? OFFSET ?",
        where_clause
    );

    let mut stmt = db.conn.prepare(&data_sql).map_err(|e| e.to_string())?;
    params_vec.push(Box::new(page_size));
    params_vec.push(Box::new(offset));

    let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let data: Vec<Expense> = stmt.query_map(rusqlite_params.as_slice(), |row| {
        Ok(Expense {
            id: row.get(0)?,
            expense_number: row.get(1)?,
            expense_date: row.get(2)?,
            category_id: row.get(3)?,
            category_name: row.get(4)?,
            title: row.get(5)?,
            description: row.get(6)?,
            amount_paise: row.get(7)?,
            payment_method: row.get(8)?,
            paid_by_user_id: row.get(9)?,
            paid_by_name: row.get(10)?,
            payee: row.get(11)?,
            reference_number: row.get(12)?,
            notes: row.get(13)?,
            status: row.get(14)?,
            cancelled_reason: row.get(15)?,
            cancelled_by: row.get(16)?,
            cancelled_by_name: row.get(17)?,
            cancelled_at: row.get(18)?,
            created_by: row.get(19)?,
            created_by_name: row.get(20)?,
            created_at: row.get(21)?,
            updated_by: row.get(22)?,
            updated_at: row.get(23)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let total_pages = if total == 0 { 0 } else { ((total as f64) / (page_size as f64)).ceil() as i32 };

    Ok(PaginatedResponse {
        data,
        total,
        page,
        page_size,
        total_pages,
    })
}

// ========== EXPENSE SUMMARY & METRICS ==========

#[tauri::command]
pub fn get_expense_summary(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> Result<ExpenseSummary, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let current_month_start = format!("{}-01", &today[0..7]);

    // Today total & count
    let (today_total_paise, today_count): (i64, i64) = db.conn.query_row(
        "SELECT COALESCE(SUM(amount_paise), 0), COUNT(*)
         FROM expenses
         WHERE status = 'active' AND expense_date = ?1",
        params![today],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, 0));

    // Month total & count
    let (month_total_paise, month_count): (i64, i64) = db.conn.query_row(
        "SELECT COALESCE(SUM(amount_paise), 0), COUNT(*)
         FROM expenses
         WHERE status = 'active' AND expense_date >= ?1 AND expense_date <= ?2",
        params![current_month_start, today],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, 0));

    // Filter range total & count
    let (range_total_paise, range_count): (i64, i64) = db.conn.query_row(
        "SELECT COALESCE(SUM(amount_paise), 0), COUNT(*)
         FROM expenses
         WHERE status = 'active' AND expense_date >= ?1 AND expense_date <= ?2",
        params![date_from, date_to],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, 0));

    // Cancelled in filter range
    let (cancelled_range_total_paise, cancelled_range_count): (i64, i64) = db.conn.query_row(
        "SELECT COALESCE(SUM(amount_paise), 0), COUNT(*)
         FROM expenses
         WHERE status = 'cancelled' AND expense_date >= ?1 AND expense_date <= ?2",
        params![date_from, date_to],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, 0));

    // Category breakdown for selected range
    let mut stmt = db.conn.prepare(
        "SELECT c.id, c.name, COALESCE(SUM(e.amount_paise), 0) as total, COUNT(e.id) as cnt
         FROM expense_categories c
         LEFT JOIN expenses e ON c.id = e.category_id AND e.status = 'active' 
                                AND e.expense_date >= ?1 AND e.expense_date <= ?2
         GROUP BY c.id, c.name
         HAVING total > 0
         ORDER BY total DESC"
    ).map_err(|e| e.to_string())?;

    let category_totals: Vec<CategoryExpenseTotal> = stmt.query_map(params![date_from, date_to], |r| {
        Ok(CategoryExpenseTotal {
            category_id: r.get(0)?,
            category_name: r.get(1)?,
            total_paise: r.get(2)?,
            count: r.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(ExpenseSummary {
        today_total_paise,
        today_count,
        month_total_paise,
        month_count,
        range_total_paise,
        range_count,
        cancelled_range_total_paise,
        cancelled_range_count,
        category_totals,
    })
}

// ========== EXCEL EXPORT ==========

#[tauri::command]
pub fn export_expenses_excel(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> Result<String, String> {
    auth::require_screen_access("expenses")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let sql = "
        SELECT 
            e.expense_number, e.expense_date, c.name, e.title, e.description,
            e.amount_paise, e.payment_method, u_paid.display_name, e.payee,
            e.reference_number, e.status, e.cancelled_reason, e.created_at
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        LEFT JOIN users u_paid ON e.paid_by_user_id = u_paid.id
        WHERE e.expense_date >= ?1 AND e.expense_date <= ?2
        ORDER BY e.expense_date ASC, e.expense_number ASC
    ";

    let mut stmt = db.conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, String, String, String, Option<String>, i64, String, Option<String>, Option<String>, Option<String>, String, Option<String>, String)> = stmt
        .query_map(params![date_from, date_to], |r| {
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
                r.get(12)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Create workbook
    use rust_xlsxwriter::{Workbook, Format, FormatBorder, FormatAlign, Color};

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Expenses Report").map_err(|e| e.to_string())?;

    // Formats
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

    let cell_format = Format::new()
        .set_border(FormatBorder::Thin);

    let center_format = Format::new()
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin);

    // Headers
    let headers = [
        "Expense #", "Date", "Category", "Title", "Amount (₹)",
        "Payment Method", "Paid By", "Payee / Vendor", "Ref #", "Status", "Notes"
    ];

    for (col, h) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *h, &header_format)
            .map_err(|e| e.to_string())?;
    }

    let mut row_idx = 1;
    let mut grand_total_paise = 0i64;

    for r in &rows {
        let exp_num = format!("EXP-{:04}", r.0);
        let amount = (r.5 as f64) / 100.0;
        if r.10 == "active" {
            grand_total_paise += r.5;
        }

        worksheet.write_string_with_format(row_idx, 0, &exp_num, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 1, &r.1, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 2, &r.2, &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 3, &r.3, &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_number_with_format(row_idx, 4, amount, &currency_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 5, &r.6.to_uppercase(), &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 6, r.7.as_deref().unwrap_or("-"), &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 7, r.8.as_deref().unwrap_or("-"), &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 8, r.9.as_deref().unwrap_or("-"), &cell_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 9, if r.10 == "active" { "Active" } else { "Cancelled" }, &center_format).map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row_idx, 10, r.4.as_deref().unwrap_or(""), &cell_format).map_err(|e| e.to_string())?;

        row_idx += 1;
    }

    // Total row
    let total_format = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0xf1f5f9))
        .set_border(FormatBorder::Thin);

    let total_curr_format = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0xf1f5f9))
        .set_num_format("₹#,##0.00")
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin);

    worksheet.write_string_with_format(row_idx, 3, "Total Active Expenses", &total_format).map_err(|e| e.to_string())?;
    worksheet.write_number_with_format(row_idx, 4, (grand_total_paise as f64) / 100.0, &total_curr_format).map_err(|e| e.to_string())?;

    // Auto-fit column widths
    worksheet.set_column_width(0, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(1, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(2, 22).map_err(|e| e.to_string())?;
    worksheet.set_column_width(3, 28).map_err(|e| e.to_string())?;
    worksheet.set_column_width(4, 16).map_err(|e| e.to_string())?;
    worksheet.set_column_width(5, 18).map_err(|e| e.to_string())?;
    worksheet.set_column_width(6, 18).map_err(|e| e.to_string())?;
    worksheet.set_column_width(7, 22).map_err(|e| e.to_string())?;
    worksheet.set_column_width(8, 16).map_err(|e| e.to_string())?;
    worksheet.set_column_width(9, 14).map_err(|e| e.to_string())?;
    worksheet.set_column_width(10, 30).map_err(|e| e.to_string())?;

    // Determine export path in user Downloads folder
    let downloads_dir = if let Ok(profile) = std::env::var("USERPROFILE") {
        let dl = std::path::PathBuf::from(profile).join("Downloads");
        if dl.exists() {
            dl
        } else {
            std::env::current_dir().unwrap_or_default().join("reports")
        }
    } else {
        std::env::current_dir().unwrap_or_default().join("reports")
    };
    let _ = std::fs::create_dir_all(&downloads_dir);

    let filename = format!("Expenses_{}_to_{}.xlsx", date_from, date_to);
    let output_path = downloads_dir.join(&filename);
    let path_str = output_path.to_string_lossy().to_string();

    workbook.save(&output_path).map_err(|e| format!("Failed to save Excel file to Downloads: {}", e))?;

    Ok(path_str)
}
