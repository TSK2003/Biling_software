use std::path::Path;
use std::collections::{HashMap, HashSet};
use calamine::{Reader, Xlsx, open_workbook, Data};
use rusqlite::params;
use chrono::NaiveDate;
use crate::db::connection::Database;
use crate::models::ImportPreview;

#[derive(Debug, Clone)]
struct ParsedExcelItem {
    business_date: String,
    bill_number: i32,
    bill_time: String,
    cashier_name: String,
    product_code: String,
    product_name: String,
    category_name: String,
    quantity: i32,
    unit_price_paise: i64,
    subtotal_paise: i64,
    discount_paise: i64,
    gst_paise: i64,
    total_paise: i64,
    payment_method: String,
    cash_paise: i64,
    upi_paise: i64,
    card_paise: i64,
    status: String,
}

pub struct ImportService;

impl ImportService {
    /// Validate Excel file structure and detect duplicates against existing SQLite records
    pub fn validate_excel_file(db: &Database, file_path: &str) -> Result<ImportPreview, String> {
        let items = Self::parse_excel_file(file_path)?;
        if items.is_empty() {
            return Err("The uploaded Excel workbook contains no valid sales records.".to_string());
        }

        let mut bill_map: HashMap<(String, i32), Vec<&ParsedExcelItem>> = HashMap::new();
        let mut dates_set: HashSet<String> = HashSet::new();
        let mut total_sales_paise: i64 = 0;

        for item in &items {
            bill_map.entry((item.business_date.clone(), item.bill_number)).or_default().push(item);
            dates_set.insert(item.business_date.clone());
        }

        let valid_bills_count = bill_map.len();
        let mut duplicate_bills_count = 0;

        for (date, num) in bill_map.keys() {
            let exists: bool = db.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM bills WHERE business_date = ?1 AND bill_number = ?2)",
                params![date, num],
                |row| row.get(0),
            ).unwrap_or(false);

            if exists {
                duplicate_bills_count += 1;
            }
        }

        // Calculate total sales from unique bills
        for items_in_bill in bill_map.values() {
            if let Some(first) = items_in_bill.first() {
                total_sales_paise += first.total_paise;
            }
        }

        let new_bills_count = valid_bills_count.saturating_sub(duplicate_bills_count);
        let mut business_dates: Vec<String> = dates_set.into_iter().collect();
        business_dates.sort();

        let file_name = Path::new(file_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "report.xlsx".to_string());

        let mut warnings = Vec::new();
        if duplicate_bills_count > 0 {
            warnings.push(format!(
                "{} bills already exist in the database and will be preserved without duplicate creation.",
                duplicate_bills_count
            ));
        }

        Ok(ImportPreview {
            file_name,
            total_rows: items.len(),
            valid_bills_count,
            duplicate_bills_count,
            new_bills_count,
            total_sales_paise,
            business_dates,
            warnings,
        })
    }

    /// Execute atomic import into SQLite with full rollback on error
    pub fn execute_excel_import(db: &mut Database, file_path: &str) -> Result<String, String> {
        let items = Self::parse_excel_file(file_path)?;
        if items.is_empty() {
            return Err("No sales records found in Excel file.".to_string());
        }

        // Group items by (business_date, bill_number)
        let mut bill_map: HashMap<(String, i32), Vec<ParsedExcelItem>> = HashMap::new();
        for item in items {
            bill_map.entry((item.business_date.clone(), item.bill_number)).or_default().push(item);
        }

        let tx = db.conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;
        let mut imported_count = 0;
        let mut skipped_count = 0;

        for ((date, num), bill_items) in bill_map {
            // Check duplicate
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM bills WHERE business_date = ?1 AND bill_number = ?2)",
                params![date, num],
                |row| row.get(0),
            ).unwrap_or(false);

            if exists {
                skipped_count += 1;
                continue;
            }

            let first = &bill_items[0];
            let bill_uuid = uuid::Uuid::new_v4().to_string();

            // Match or create default user for cashier
            let user_id: i64 = tx.query_row(
                "SELECT id FROM users WHERE display_name = ?1 OR username = ?1 LIMIT 1",
                params![first.cashier_name],
                |row| row.get(0),
            ).unwrap_or(1); // Default to admin user (id=1)

            // Insert bill
            tx.execute(
                "INSERT INTO bills (
                    bill_uuid, bill_number, business_date, bill_time, user_id,
                    subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
                    gst_total_paise, grand_total_paise, status, import_source
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'fixed', 0, ?7, ?8, ?9, ?10, ?11)",
                params![
                    bill_uuid,
                    num,
                    date,
                    first.bill_time,
                    user_id,
                    first.subtotal_paise,
                    first.discount_paise,
                    first.gst_paise,
                    first.total_paise,
                    first.status,
                    Path::new(file_path).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(),
                ],
            ).map_err(|e| format!("Failed to insert bill #{}: {}", num, e))?;

            let bill_id = tx.last_insert_rowid();

            // Insert items
            for (idx, item) in bill_items.iter().enumerate() {
                // Ensure category exists
                let category_id: i64 = match tx.query_row(
                    "SELECT id FROM categories WHERE name = ?1 COLLATE NOCASE",
                    params![item.category_name],
                    |row| row.get(0),
                ) {
                    Ok(id) => id,
                    Err(_) => {
                        tx.execute(
                            "INSERT INTO categories (name, sort_order) VALUES (?1, 10)",
                            params![item.category_name],
                        ).map_err(|e| format!("Failed to create category: {}", e))?;
                        tx.last_insert_rowid()
                    }
                };

                // Ensure product exists
                let product_id: i64 = match tx.query_row(
                    "SELECT id FROM products WHERE product_code = ?1 OR name = ?2 COLLATE NOCASE",
                    params![item.product_code, item.product_name],
                    |row| row.get(0),
                ) {
                    Ok(id) => id,
                    Err(_) => {
                        tx.execute(
                            "INSERT INTO products (product_code, name, category_id, selling_price_paise, gst_enabled)
                             VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![
                                item.product_code,
                                item.product_name,
                                category_id,
                                item.unit_price_paise,
                                if item.gst_paise > 0 { 1 } else { 0 },
                            ],
                        ).map_err(|e| format!("Failed to auto-create product: {}", e))?;
                        tx.last_insert_rowid()
                    }
                };

                // Insert bill item snapshot
                tx.execute(
                    "INSERT INTO bill_items (
                        bill_id, product_id, product_code_snapshot, product_name_snapshot,
                        category_name_snapshot, unit_price_paise, quantity, gst_enabled,
                        gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10, ?11)",
                    params![
                        bill_id,
                        product_id,
                        item.product_code,
                        item.product_name,
                        item.category_name,
                        item.unit_price_paise,
                        item.quantity,
                        if item.gst_paise > 0 { 1 } else { 0 },
                        item.gst_paise,
                        item.unit_price_paise * (item.quantity as i64),
                        idx as i32,
                    ],
                ).map_err(|e| format!("Failed to insert bill item: {}", e))?;
            }

            // Insert payment
            tx.execute(
                "INSERT INTO payments (
                    bill_id, payment_method, total_amount_paise,
                    cash_amount_paise, card_amount_paise, upi_amount_paise
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    bill_id,
                    first.payment_method,
                    first.total_paise,
                    first.cash_paise,
                    first.card_paise,
                    first.upi_paise,
                ],
            ).map_err(|e| format!("Failed to insert payment: {}", e))?;

            imported_count += 1;
        }

        // Record in audit log
        let _ = tx.execute(
            "INSERT INTO audit_logs (action, entity_type, details_json)
             VALUES ('excel_import', 'database', ?1)",
            params![format!("{{\"imported\":{},\"skipped\":{}}}", imported_count, skipped_count)],
        );

        tx.commit().map_err(|e| format!("Commit error: {}", e))?;

        Ok(format!(
            "Successfully imported {} new bills ({} duplicates skipped).",
            imported_count, skipped_count
        ))
    }

    /// Parse workbook and extract standardized item rows
    fn parse_excel_file(file_path: &str) -> Result<Vec<ParsedExcelItem>, String> {
        let mut workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|e| format!("Failed to open Excel workbook: {}", e))?;

        let sheet_name = workbook.sheet_names()
            .into_iter()
            .next()
            .ok_or_else(|| "Workbook has no sheets.".to_string())?;

        let range = workbook.worksheet_range(&sheet_name)
            .map_err(|e| format!("Failed to read sheet '{}': {}", sheet_name, e))?;

        let mut items = Vec::new();
        let mut table_started = false;

        for row in range.rows() {
            if row.is_empty() {
                continue;
            }

            // Detect table header row
            let first_cell = row[0].to_string();
            if first_cell.eq_ignore_ascii_case("Date") {
                table_started = true;
                continue;
            }

            if !table_started {
                continue;
            }

            // Stop if empty row encountered after table
            if first_cell.trim().is_empty() {
                continue;
            }

            // Extract fields safely
            let date_raw = first_cell.trim();
            let date_str = Self::normalize_date(date_raw);

            let bill_num_raw = row.get(1).map(|d| d.to_string()).unwrap_or_default();
            let bill_number = Self::parse_bill_number(&bill_num_raw);

            let bill_time = row.get(2).map(|d| d.to_string()).unwrap_or_else(|| "12:00:00".to_string());
            let cashier_name = row.get(3).map(|d| d.to_string()).unwrap_or_else(|| "Admin".to_string());
            let product_code = row.get(5).map(|d| d.to_string()).unwrap_or_else(|| "PRD-000001".to_string());
            let product_name = row.get(6).map(|d| d.to_string()).unwrap_or_else(|| "Unknown Item".to_string());
            let category_name = row.get(7).map(|d| d.to_string()).unwrap_or_else(|| "Others".to_string());

            let quantity = Self::cell_to_i32(row.get(8)).max(1);
            let unit_price_paise = (Self::cell_to_f64(row.get(9)) * 100.0).round() as i64;
            let subtotal_paise = (Self::cell_to_f64(row.get(10)) * 100.0).round() as i64;
            let discount_paise = (Self::cell_to_f64(row.get(11)) * 100.0).round() as i64;
            let gst_paise = (Self::cell_to_f64(row.get(12)) * 100.0).round() as i64;
            let total_paise = (Self::cell_to_f64(row.get(13)) * 100.0).round() as i64;

            let payment_method = row.get(14).map(|d| d.to_string().to_lowercase()).unwrap_or_else(|| "cash".to_string());
            let cash_paise = (Self::cell_to_f64(row.get(15)) * 100.0).round() as i64;
            let upi_paise = (Self::cell_to_f64(row.get(16)) * 100.0).round() as i64;
            let card_paise = (Self::cell_to_f64(row.get(17)) * 100.0).round() as i64;
            let status = row.get(18).map(|d| d.to_string().to_lowercase()).unwrap_or_else(|| "completed".to_string());

            items.push(ParsedExcelItem {
                business_date: date_str,
                bill_number,
                bill_time,
                cashier_name,
                product_code,
                product_name,
                category_name,
                quantity,
                unit_price_paise,
                subtotal_paise,
                discount_paise,
                gst_paise,
                total_paise,
                payment_method,
                cash_paise,
                upi_paise,
                card_paise,
                status,
            });
        }

        Ok(items)
    }

    /// Normalize date from DD-MM-YYYY or YYYY-MM-DD to YYYY-MM-DD
    fn normalize_date(input: &str) -> String {
        if let Ok(d) = NaiveDate::parse_from_str(input, "%d-%m-%Y") {
            d.format("%Y-%m-%d").to_string()
        } else if let Ok(d) = NaiveDate::parse_from_str(input, "%Y-%m-%d") {
            d.format("%Y-%m-%d").to_string()
        } else {
            input.to_string()
        }
    }

    /// Parse bill number from string like "#001" or "1"
    fn parse_bill_number(input: &str) -> i32 {
        let digits: String = input.chars().filter(|c| c.is_ascii_digit()).collect();
        digits.parse::<i32>().unwrap_or(1)
    }

    fn cell_to_f64(cell: Option<&Data>) -> f64 {
        match cell {
            Some(Data::Float(f)) => *f,
            Some(Data::Int(i)) => *i as f64,
            Some(Data::String(s)) => s.trim().replace('₹', "").replace(',', "").trim().parse::<f64>().unwrap_or(0.0),
            _ => 0.0,
        }
    }

    fn cell_to_i32(cell: Option<&Data>) -> i32 {
        match cell {
            Some(Data::Int(i)) => *i as i32,
            Some(Data::Float(f)) => *f as i32,
            Some(Data::String(s)) => s.trim().parse::<i32>().unwrap_or(0),
            _ => 0,
        }
    }
}
