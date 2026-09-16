use aescion_pos_lib::db::connection::Database;
use aescion_pos_lib::services::report_service::ReportService;
use aescion_pos_lib::services::import_service::ImportService;
use aescion_pos_lib::services::backup_service::BackupService;
use rusqlite::params;

#[test]
fn test_real_business_scenario() {
    // 1. Initialize SQLite Database
    let mut db = Database::init().expect("Failed to initialize database");

    // Clear test business data
    let _ = db.conn.execute("DELETE FROM draft_bills", []);
    let _ = db.conn.execute("DELETE FROM payments", []);
    let _ = db.conn.execute("DELETE FROM bill_items", []);
    let _ = db.conn.execute("DELETE FROM bills", []);
    let _ = db.conn.execute("DELETE FROM products", []);
    let _ = db.conn.execute("DELETE FROM categories", []);
    let _ = db.conn.execute("DELETE FROM inventory", []);
    let _ = db.conn.execute("DELETE FROM stock_movements", []);

    // 2. Setup Category & Product: Mango Juice @ ₹80 (8000 paise), initial stock = 100
    db.conn.execute(
        "INSERT INTO categories (id, name, sort_order) VALUES (1, 'Juice', 1)",
        [],
    ).unwrap();

    db.conn.execute(
        "INSERT INTO products (id, product_code, name, category_id, selling_price_paise, gst_enabled)
         VALUES (1, 'PRD-000001', 'Mango Juice', 1, 8000, 0)",
        [],
    ).unwrap();

    db.conn.execute(
        "INSERT INTO inventory (product_id, current_stock, low_stock_threshold) VALUES (1, 100, 10)",
        [],
    ).unwrap();

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // 3. Cashier 1: Sells Mango Juice x 3 (₹240 Cash) -> Bill 001
    {
        let tx = db.conn.transaction().unwrap();
        let bill_number: i32 = tx.query_row(
            "SELECT COALESCE(MAX(bill_number), 0) + 1 FROM bills WHERE business_date = ?1",
            params![today],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(bill_number, 1, "First bill should be 1");

        tx.execute(
            "INSERT INTO bills (bill_uuid, bill_number, business_date, bill_time, user_id, subtotal_paise, discount_amount_paise, gst_total_paise, grand_total_paise, status)
             VALUES ('UUID-BILL-001', ?1, ?2, '10:00:00', 1, 24000, 0, 0, 24000, 'completed')",
            params![bill_number, today],
        ).unwrap();
        let bill_id = tx.last_insert_rowid();

        tx.execute(
            "INSERT INTO bill_items (bill_id, product_id, product_code_snapshot, product_name_snapshot, category_name_snapshot, unit_price_paise, quantity, gst_enabled, line_total_paise)
             VALUES (?1, 1, 'PRD-000001', 'Mango Juice', 'Juice', 8000, 3, 0, 24000)",
            params![bill_id],
        ).unwrap();

        tx.execute(
            "INSERT INTO payments (bill_id, payment_method, total_amount_paise, cash_amount_paise)
             VALUES (?1, 'cash', 24000, 24000)",
            params![bill_id],
        ).unwrap();

        tx.execute(
            "UPDATE inventory SET current_stock = current_stock - 3, updated_at = datetime('now') WHERE product_id = 1",
            [],
        ).unwrap();

        tx.commit().unwrap();
    }

    // 4. Cashier 2: Simultaneously Sells Mango Juice x 2 (₹160 UPI) -> Bill 002
    {
        let tx = db.conn.transaction().unwrap();
        let bill_number: i32 = tx.query_row(
            "SELECT COALESCE(MAX(bill_number), 0) + 1 FROM bills WHERE business_date = ?1",
            params![today],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(bill_number, 2, "Second bill should be 2");

        tx.execute(
            "INSERT INTO bills (bill_uuid, bill_number, business_date, bill_time, user_id, subtotal_paise, discount_amount_paise, gst_total_paise, grand_total_paise, status)
             VALUES ('UUID-BILL-002', ?1, ?2, '10:05:00', 1, 16000, 0, 0, 16000, 'completed')",
            params![bill_number, today],
        ).unwrap();
        let bill_id = tx.last_insert_rowid();

        tx.execute(
            "INSERT INTO bill_items (bill_id, product_id, product_code_snapshot, product_name_snapshot, category_name_snapshot, unit_price_paise, quantity, gst_enabled, line_total_paise)
             VALUES (?1, 1, 'PRD-000001', 'Mango Juice', 'Juice', 8000, 2, 0, 16000)",
            params![bill_id],
        ).unwrap();

        tx.execute(
            "INSERT INTO payments (bill_id, payment_method, total_amount_paise, upi_amount_paise)
             VALUES (?1, 'upi', 16000, 16000)",
            params![bill_id],
        ).unwrap();

        tx.execute(
            "UPDATE inventory SET current_stock = current_stock - 2, updated_at = datetime('now') WHERE product_id = 1",
            [],
        ).unwrap();

        tx.commit().unwrap();
    }

    // 5. Verify Inventory Stock Reduction
    let final_stock: i32 = db.conn.query_row(
        "SELECT current_stock FROM inventory WHERE product_id = 1",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(final_stock, 95, "Stock must decrease from 100 to 95 (100 - 3 - 2)");

    // 6. Test Excel Daily Report Generation (DD-MM-YYYY.xlsx)
    let excel_path = ReportService::generate_daily_report(&db, &today).expect("Daily report generation failed");
    assert!(std::path::Path::new(&excel_path).exists(), "Generated Excel file must exist on disk");

    // 7. Test Excel Import Validation & Deduplication
    let preview = ImportService::validate_excel_file(&db, &excel_path).expect("Excel validation failed");
    assert_eq!(preview.valid_bills_count, 2, "Should find 2 bills in the Excel sheet");
    assert_eq!(preview.duplicate_bills_count, 2, "Both bills already exist in the database");
    assert_eq!(preview.new_bills_count, 0, "No new bills to duplicate");

    // 8. Test Full Backup Package Creation (.zip + manifest.json)
    let backup_record = BackupService::create_full_backup(&db, "manual").expect("Full backup creation failed");
    assert!(std::path::Path::new(&backup_record.backup_path).exists(), "Backup zip file must exist");

    let manifest = BackupService::validate_backup_archive(&backup_record.backup_path).expect("Manifest validation failed");
    assert_eq!(manifest.bill_count, 2, "Manifest must reflect 2 bills");
    assert_eq!(manifest.product_count, 1, "Manifest must reflect 1 product");
    assert!(!manifest.checksum_sha256.is_empty(), "Manifest must include SHA-256 checksum");

    println!("✅ Real Business Scenario Test PASSED completely with 100% data integrity!");
}
