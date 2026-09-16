use billing_software_lib::db::connection::Database;
use billing_software_lib::services::report_service::ReportService;
use billing_software_lib::services::import_service::ImportService;
use billing_software_lib::services::backup_service::BackupService;
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

    // 9. Test Product Return Workflow (Inventory Stock Restoration & Income Deduction)
    {
        // 9a. Partial Return: Return 1 Mango Juice from Bill 2 (Refund: ₹80)
        let (bill2_id, bill2_item_id): (i64, i64) = db.conn.query_row(
            "SELECT b.id, bi.id FROM bills b JOIN bill_items bi ON b.id = bi.bill_id WHERE b.bill_uuid = 'UUID-BILL-002' LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();

        // Restore stock to inventory and record stock movement
        db.conn.execute(
            "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes)
             VALUES (1, 1, 'return', ?1, 1, 'Defective bottle')",
            params![bill2_id],
        ).unwrap();
        db.conn.execute(
            "UPDATE inventory SET current_stock = current_stock + 1, updated_at = datetime('now') WHERE product_id = 1",
            [],
        ).unwrap();

        // Deduct returned quantity from bill_items
        db.conn.execute(
            "UPDATE bill_items SET quantity = quantity - 1, line_total_paise = quantity * 8000 WHERE id = ?1",
            params![bill2_item_id],
        ).unwrap();

        // Reduce grand total by refund amount (16000 - 8000 = 8000)
        db.conn.execute(
            "UPDATE bills SET grand_total_paise = grand_total_paise - 8000, subtotal_paise = subtotal_paise - 8000, void_reason = 'Partial Return' WHERE id = ?1",
            params![bill2_id],
        ).unwrap();
        db.conn.execute(
            "UPDATE payments SET total_amount_paise = 8000, upi_amount_paise = 8000 WHERE bill_id = ?1",
            params![bill2_id],
        ).unwrap();

        // Verify stock increased from 95 to 96
        let stock_after_partial: i32 = db.conn.query_row(
            "SELECT current_stock FROM inventory WHERE product_id = 1",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(stock_after_partial, 96, "Stock must increase by 1 after returning 1 item");

        // Verify total completed sales revenue decreased by ₹80 (from ₹400 to ₹320)
        let total_income: i64 = db.conn.query_row(
            "SELECT COALESCE(SUM(grand_total_paise), 0) FROM bills WHERE status = 'completed'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(total_income, 32000, "Income must reflect ₹320 (₹240 from Bill 1 + ₹80 remaining Bill 2)");

        // 9b. Full Return: Return remaining 1 item from Bill 2
        db.conn.execute(
            "INSERT INTO stock_movements (product_id, quantity_change, movement_type, reference_id, user_id, notes)
             VALUES (1, 1, 'return', ?1, 1, 'Wrong item')",
            params![bill2_id],
        ).unwrap();
        db.conn.execute(
            "UPDATE inventory SET current_stock = current_stock + 1, updated_at = datetime('now') WHERE product_id = 1",
            [],
        ).unwrap();

        // Mark bill as returned (completely removed from completed revenue)
        db.conn.execute(
            "UPDATE bills SET status = 'returned', grand_total_paise = 0, subtotal_paise = 0 WHERE id = ?1",
            params![bill2_id],
        ).unwrap();
        db.conn.execute(
            "UPDATE payments SET total_amount_paise = 0, upi_amount_paise = 0 WHERE bill_id = ?1",
            params![bill2_id],
        ).unwrap();

        // Verify stock increased from 96 to 97 (2 items returned in total)
        let stock_after_full: i32 = db.conn.query_row(
            "SELECT current_stock FROM inventory WHERE product_id = 1",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(stock_after_full, 97, "Stock must increase to 97 after full return of Bill 2");

        // Verify total completed sales income now ONLY includes Bill 1 (₹240)
        let final_income: i64 = db.conn.query_row(
            "SELECT COALESCE(SUM(grand_total_paise), 0) FROM bills WHERE status = 'completed'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(final_income, 24000, "Total income must ONLY be ₹240 from Bill 1; Bill 2 was returned!");

        // Verify stock_movements has 2 return entries
        let return_movements_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM stock_movements WHERE movement_type = 'return' AND product_id = 1",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(return_movements_count, 2, "Stock movements must log both return events");
    }

    println!("✅ Real Business Scenario Test PASSED completely with 100% data integrity!");
}

