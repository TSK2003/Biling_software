use tauri::State;
use crate::AppState;
use crate::models::{PrinterInfo, PrintReceiptRequest};
use crate::services::printer_service::PrinterService;

#[tauri::command]
pub fn get_printers() -> Result<Vec<PrinterInfo>, String> {
    Ok(PrinterService::get_installed_printers())
}

#[tauri::command]
pub fn get_default_printer() -> Result<Option<String>, String> {
    Ok(PrinterService::get_default_printer_name())
}

#[tauri::command]
pub fn test_print(
    state: State<'_, AppState>,
    printer_name: Option<String>,
    paper_size: Option<String>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let shop_name: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_name'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "Billing Software".to_string());

    let target_printer = printer_name
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            db.conn.query_row(
                "SELECT value FROM settings WHERE key = 'printer_name' OR key = 'printer_default'",
                [],
                |r| r.get(0),
            ).ok().filter(|s: &String| !s.trim().is_empty())
        })
        .or_else(PrinterService::get_default_printer_name)
        .ok_or_else(|| "No printer found or configured. Please connect a printer or check Settings.".to_string())?;

    let target_paper = paper_size
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            db.conn.query_row(
                "SELECT value FROM settings WHERE key = 'printer_paper_size'",
                [],
                |r| r.get(0),
            ).ok().filter(|s: &String| !s.trim().is_empty())
        })
        .unwrap_or_else(|| "Thermal80".to_string());

    let test_bytes = PrinterService::build_test_receipt_bytes(&shop_name, &target_printer, &target_paper);

    PrinterService::send_raw_to_printer(&target_printer, "Test_Receipt", &test_bytes)?;

    Ok(format!("Test page sent successfully to '{}'", target_printer))
}

#[tauri::command]
pub fn print_receipt(
    state: State<'_, AppState>,
    request: PrintReceiptRequest,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    // Load shop branding settings from database
    let shop_name: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_name'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "Billing Software".to_string());

    let shop_phone: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_phone'",
        [],
        |r| r.get(0),
    ).unwrap_or_default();

    let shop_address: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_address'",
        [],
        |r| r.get(0),
    ).unwrap_or_default();

    let shop_email: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_email'",
        [],
        |r| r.get(0),
    ).unwrap_or_default();

    let shop_gst_enabled: bool = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'gst_enabled'",
        [],
        |r| r.get::<_, String>(0),
    ).map(|v| v.trim().eq_ignore_ascii_case("true")).unwrap_or(false);

    let gst_number: String = if shop_gst_enabled {
        db.conn.query_row(
            "SELECT value FROM settings WHERE key = 'gst_number'",
            [],
            |r| r.get(0),
        ).unwrap_or_default()
    } else {
        String::new()
    };

    let fssai_number: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'fssai_number'",
        [],
        |r| r.get(0),
    ).unwrap_or_default();

    let shop_logo: String = request.shop_logo.clone()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            db.conn.query_row(
                "SELECT value FROM settings WHERE key = 'shop_logo'",
                [],
                |r| r.get(0),
            ).ok().filter(|s: &String| !s.trim().is_empty())
        })
        .unwrap_or_default();

    let receipt_footer: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'receipt_footer_note'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "Thank you for shopping with us! Please visit again.".to_string());

    // Resolve target printer
    let target_printer = request.printer_name
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            db.conn.query_row(
                "SELECT value FROM settings WHERE key = 'printer_name' OR key = 'printer_default'",
                [],
                |r| r.get(0),
            ).ok().filter(|s: &String| !s.trim().is_empty())
        })
        .or_else(PrinterService::get_default_printer_name)
        .ok_or_else(|| "No printer configured. Please select your printer in Settings.".to_string())?;

    // Resolve paper size (default Thermal80)
    let target_paper = request.paper_size
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            db.conn.query_row(
                "SELECT value FROM settings WHERE key = 'printer_paper_size'",
                [],
                |r| r.get(0),
            ).ok().filter(|s: &String| !s.trim().is_empty())
        })
        .unwrap_or_else(|| "Thermal80".to_string());

    // Resolve number of copies
    let configured_copies: i32 = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'printer_copies'",
        [],
        |r| r.get::<_, String>(0),
    ).ok().and_then(|s| s.parse().ok()).unwrap_or(1);

    let copies = request.copies.unwrap_or(configured_copies).max(1).min(5);

    // Resolve bill data: if bill_id provided, fetch exact stored values from DB for read-only accuracy
    let (bill_number, business_date, bill_time, cashier_name, items, subtotal, discount, gst, grand_total, payment_method, tendered, change) =
        if let Some(bid) = request.bill_id {
            let bill_res = db.conn.query_row(
                "SELECT b.bill_number, b.business_date, b.bill_time, COALESCE(u.display_name, 'Staff'),
                        b.subtotal_paise, b.discount_amount_paise, b.gst_total_paise, b.grand_total_paise,
                        COALESCE(p.payment_method, 'cash'), COALESCE(p.cash_amount_paise, 0)
                 FROM bills b
                 LEFT JOIN users u ON b.user_id = u.id
                 LEFT JOIN payments p ON b.id = p.bill_id
                 WHERE b.id = ?1",
                rusqlite::params![bid],
                |r| {
                    Ok((
                        r.get::<_, i32>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?,
                        r.get::<_, i64>(5)?,
                        r.get::<_, i64>(6)?,
                        r.get::<_, i64>(7)?,
                        r.get::<_, String>(8)?,
                        r.get::<_, i64>(9)?,
                    ))
                },
            );

            if let Ok((b_num, b_date, b_time, c_name, sub, disc, gst_t, g_tot, pay_m, cash_paid)) = bill_res {
                // Fetch items from bill_items
                let mut stmt = db.conn.prepare(
                    "SELECT product_name_snapshot, quantity, unit_price_paise, line_total_paise
                     FROM bill_items WHERE bill_id = ?1 ORDER BY sort_order ASC, id ASC"
                ).map_err(|e| e.to_string())?;

                let db_items: Vec<(String, i32, i64, i64)> = stmt.query_map(rusqlite::params![bid], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                }).map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

                let tender_val = request.tendered_cash_paise.or_else(|| {
                    if cash_paid > 0 { Some(cash_paid) } else { None }
                });
                let change_val = request.change_due_paise.or_else(|| {
                    if cash_paid > g_tot { Some(cash_paid - g_tot) } else { Some(0) }
                });

                (b_num, b_date, b_time, c_name, db_items, sub, disc, gst_t, g_tot, pay_m, tender_val, change_val)
            } else {
                return Err(format!("Bill ID #{} not found in records.", bid));
            }
        } else {
            // Use provided request payload
            let b_num = request.bill_number.unwrap_or(1);
            let b_date = request.business_date.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
            let b_time = request.bill_time.unwrap_or_else(|| chrono::Local::now().format("%H:%M:%S").to_string());
            let c_name = request.cashier_name.unwrap_or_else(|| "Staff".to_string());
            let items: Vec<(String, i32, i64, i64)> = request.items.unwrap_or_default().into_iter().map(|i| {
                (i.name, i.quantity, i.unit_price_paise, i.line_total_paise)
            }).collect();

            let sub = request.subtotal_paise.unwrap_or(0);
            let disc = request.discount_amount_paise.unwrap_or(0);
            let gst = request.gst_total_paise.unwrap_or(0);
            let g_tot = request.grand_total_paise.unwrap_or(sub);
            let pay_m = request.payment_method.unwrap_or_else(|| "cash".to_string());
            let tendered = request.tendered_cash_paise;
            let change = request.change_due_paise;

            (b_num, b_date, b_time, c_name, items, sub, disc, gst, g_tot, pay_m, tendered, change)
        };

    if items.is_empty() {
        return Err("Cannot print receipt: No items in bill.".to_string());
    }

    let (final_gst, final_grand_total) = if shop_gst_enabled {
        (gst, grand_total)
    } else {
        (0i64, (subtotal - discount).max(0))
    };

    // Build raw ESC/POS payload
    let receipt_bytes = PrinterService::build_receipt_bytes(
        &shop_logo,
        &shop_name,
        &shop_phone,
        &shop_address,
        &shop_email,
        &gst_number,
        &fssai_number,
        &receipt_footer,
        bill_number,
        &business_date,
        &bill_time,
        &cashier_name,
        &items,
        subtotal,
        discount,
        final_gst,
        final_grand_total,
        &payment_method,
        tendered,
        change,
        &target_paper,
    );

    let doc_title = format!("Receipt_#{}", bill_number);

    // Send copy(ies) to printer
    for copy_idx in 1..=copies {
        let copy_title = if copies > 1 {
            format!("{}_Copy{}", doc_title, copy_idx)
        } else {
            doc_title.clone()
        };

        PrinterService::send_raw_to_printer(&target_printer, &copy_title, &receipt_bytes)?;
    }

    Ok(format!("Receipt #{} printed successfully to '{}'", bill_number, target_printer))
}
