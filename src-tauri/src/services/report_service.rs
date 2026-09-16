use std::fs;
use rusqlite::params;
use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Color, Workbook};
use chrono::NaiveDate;
use crate::db::connection::Database;

#[derive(Debug, Clone)]
pub struct ReportItemRow {
    pub business_date: String,
    pub bill_number: i32,
    pub bill_time: String,
    pub user_name: String,
    pub device_name: String,
    pub product_code: String,
    pub product_name: String,
    pub category_name: String,
    pub quantity: i32,
    pub unit_price_paise: i64,
    pub subtotal_paise: i64,
    pub discount_amount_paise: i64,
    pub gst_amount_paise: i64,
    pub total_paise: i64,
    pub payment_method: String,
    pub cash_amount_paise: i64,
    pub upi_amount_paise: i64,
    pub card_amount_paise: i64,
    pub status: String,
}

#[derive(Debug, Clone, Default)]
pub struct ReportSummary {
    pub total_bills: i64,
    pub total_items: i64,
    pub gross_sales_paise: i64,
    pub total_discount_paise: i64,
    pub total_gst_paise: i64,
    pub net_sales_paise: i64,
    pub cash_paise: i64,
    pub upi_paise: i64,
    pub card_paise: i64,
}

pub struct ReportService;

impl ReportService {
    /// Generate daily Excel sales report (DD-MM-YYYY.xlsx)
    pub fn generate_daily_report(db: &Database, date: &str) -> Result<String, String> {
        Self::generate_date_range_report(db, date, date)
    }

    /// Generate Excel report for a single date or date range
    pub fn generate_date_range_report(
        db: &Database,
        date_from: &str,
        date_to: &str,
    ) -> Result<String, String> {
        // Fetch rows
        let (rows, summary) = Self::query_report_data(db, date_from, date_to)?;

        // Determine destination folder and filename
        let parsed_date = NaiveDate::parse_from_str(date_from, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Local::now().date_naive());
        
        let year_str = parsed_date.format("%Y").to_string();
        let month_str = parsed_date.format("%B").to_string();
        
        let reports_base = db.reports_dir().join(&year_str).join(&month_str);
        fs::create_dir_all(&reports_base).map_err(|e| format!("Failed to create reports directory: {}", e))?;

        let filename = if date_from == date_to {
            let day_month_year = parsed_date.format("%d-%m-%Y").to_string();
            format!("{}.xlsx", day_month_year)
        } else {
            let from_dmy = NaiveDate::parse_from_str(date_from, "%Y-%m-%d")
                .map(|d| d.format("%d-%m-%Y").to_string())
                .unwrap_or_else(|_| date_from.to_string());
            let to_dmy = NaiveDate::parse_from_str(date_to, "%Y-%m-%d")
                .map(|d| d.format("%d-%m-%Y").to_string())
                .unwrap_or_else(|_| date_to.to_string());
            format!("Report_{}_to_{}.xlsx", from_dmy, to_dmy)
        };

        let file_path = reports_base.join(&filename);

        // Build Excel Workbook
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("Sales Report").map_err(|e| e.to_string())?;

        // Setup styles
        let title_format = Format::new()
            .set_bold()
            .set_font_size(14)
            .set_font_color(Color::RGB(0x0f172a))
            .set_align(FormatAlign::Left);

        let subtitle_format = Format::new()
            .set_italic()
            .set_font_size(9)
            .set_font_color(Color::RGB(0x64748b));

        let header_format = Format::new()
            .set_bold()
            .set_font_size(9)
            .set_font_color(Color::RGB(0xffffff))
            .set_background_color(Color::RGB(0x0284c7))
            .set_align(FormatAlign::Center)
            .set_border(FormatBorder::Thin);

        let summary_header_format = Format::new()
            .set_bold()
            .set_font_size(9)
            .set_font_color(Color::RGB(0xffffff))
            .set_background_color(Color::RGB(0x0f172a))
            .set_border(FormatBorder::Thin);

        let summary_val_format = Format::new()
            .set_bold()
            .set_font_size(10)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right);

        let data_format = Format::new()
            .set_font_size(9)
            .set_border(FormatBorder::Thin);

        let num_format = Format::new()
            .set_font_size(9)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right);

        // 1. Write Header & Metadata
        worksheet.write_with_format(0, 0, "Billing APP — SALES & FINANCIAL REPORT", &title_format).map_err(|e| e.to_string())?;
        
        let subtitle = if date_from == date_to {
            format!("Business Date: {} | Generated at: {}", date_from, chrono::Local::now().format("%d-%m-%Y %H:%M:%S"))
        } else {
            format!("Period: {} to {} | Generated at: {}", date_from, date_to, chrono::Local::now().format("%d-%m-%Y %H:%M:%S"))
        };
        worksheet.write_with_format(1, 0, subtitle, &subtitle_format).map_err(|e| e.to_string())?;

        // 2. Write Summary Cards Section
        worksheet.write_with_format(3, 0, "EXECUTIVE SUMMARY", &summary_header_format).map_err(|e| e.to_string())?;
        worksheet.write_with_format(3, 1, "VALUE", &summary_header_format).map_err(|e| e.to_string())?;

        let summary_metrics = [
            ("Total Bills Completed", format!("{}", summary.total_bills)),
            ("Total Items Sold", format!("{}", summary.total_items)),
            ("Gross Sales", format!("₹{:.2}", summary.gross_sales_paise as f64 / 100.0)),
            ("Total Discounts Given", format!("₹{:.2}", summary.total_discount_paise as f64 / 100.0)),
            ("Total GST Collected", format!("₹{:.2}", summary.total_gst_paise as f64 / 100.0)),
            ("Net Total Revenue", format!("₹{:.2}", summary.net_sales_paise as f64 / 100.0)),
            ("Cash Revenue", format!("₹{:.2}", summary.cash_paise as f64 / 100.0)),
            ("UPI Revenue", format!("₹{:.2}", summary.upi_paise as f64 / 100.0)),
            ("Card Revenue", format!("₹{:.2}", summary.card_paise as f64 / 100.0)),
        ];

        for (i, (label, val)) in summary_metrics.iter().enumerate() {
            let row = 4 + i as u32;
            worksheet.write_with_format(row, 0, *label, &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(row, 1, val.as_str(), &summary_val_format).map_err(|e| e.to_string())?;
        }

        // 3. Write Detailed Itemized Table
        let table_start_row = 15;
        let headers = [
            "Date", "Bill #", "Time", "Cashier", "Device", "Product Code", "Product Name",
            "Category", "Qty", "Unit Price (₹)", "Subtotal (₹)", "Discount (₹)",
            "GST (₹)", "Total (₹)", "Payment Method", "Cash (₹)", "UPI (₹)", "Card (₹)", "Status"
        ];

        for (col, header) in headers.iter().enumerate() {
            worksheet.write_with_format(table_start_row, col as u16, *header, &header_format).map_err(|e| e.to_string())?;
        }

        for (i, row_data) in rows.iter().enumerate() {
            let current_row = table_start_row + 1 + i as u32;
            worksheet.write_with_format(current_row, 0, row_data.business_date.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 1, format!("#{:03}", row_data.bill_number), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 2, row_data.bill_time.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 3, row_data.user_name.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 4, row_data.device_name.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 5, row_data.product_code.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 6, row_data.product_name.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 7, row_data.category_name.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 8, row_data.quantity as f64, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 9, row_data.unit_price_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 10, row_data.subtotal_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 11, row_data.discount_amount_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 12, row_data.gst_amount_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 13, row_data.total_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 14, row_data.payment_method.as_str(), &data_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 15, row_data.cash_amount_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 16, row_data.upi_amount_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 17, row_data.card_amount_paise as f64 / 100.0, &num_format).map_err(|e| e.to_string())?;
            worksheet.write_with_format(current_row, 18, row_data.status.as_str(), &data_format).map_err(|e| e.to_string())?;
        }

        // Set column widths
        let widths = [12.0, 10.0, 10.0, 14.0, 12.0, 14.0, 24.0, 14.0, 8.0, 12.0, 12.0, 12.0, 12.0, 12.0, 14.0, 12.0, 12.0, 12.0, 12.0];
        for (col, w) in widths.iter().enumerate() {
            worksheet.set_column_width(col as u16, *w).map_err(|e| e.to_string())?;
        }

        // Save workbook to file
        workbook.save(&file_path).map_err(|e| format!("Failed to save Excel file: {}", e))?;

        // Queue in sync_queue for Google Drive upload
        let path_str = file_path.to_string_lossy().to_string();
        let _ = db.conn.execute(
            "INSERT INTO sync_queue (file_type, local_path, status) VALUES ('report', ?1, 'pending')",
            params![path_str],
        );

        Ok(path_str)
    }

    /// Query bills and bill_items joined for report generation
    fn query_report_data(
        db: &Database,
        date_from: &str,
        date_to: &str,
    ) -> Result<(Vec<ReportItemRow>, ReportSummary), String> {
        let mut stmt = db.conn.prepare(
            "SELECT 
                b.business_date,
                b.bill_number,
                b.bill_time,
                COALESCE(u.display_name, 'Staff') as user_name,
                'Host/POS' as device_name,
                bi.product_code_snapshot,
                bi.product_name_snapshot,
                bi.category_name_snapshot,
                bi.quantity,
                bi.unit_price_paise,
                bi.line_total_paise,
                b.discount_amount_paise,
                bi.gst_amount_paise,
                b.grand_total_paise,
                COALESCE(p.payment_method, 'cash') as payment_method,
                COALESCE(p.cash_amount_paise, 0) as cash_paise,
                COALESCE(p.upi_amount_paise, 0) as upi_paise,
                COALESCE(p.card_amount_paise, 0) as card_paise,
                b.status
             FROM bills b
             JOIN bill_items bi ON b.id = bi.bill_id
             LEFT JOIN users u ON b.user_id = u.id
             LEFT JOIN payments p ON b.id = p.bill_id
             WHERE b.business_date >= ?1 AND b.business_date <= ?2 AND b.status != 'cancelled'
             ORDER BY b.business_date ASC, b.bill_number ASC, bi.id ASC"
        ).map_err(|e| format!("Database query error: {}", e))?;

        let mut rows = Vec::new();
        let item_iter = stmt.query_map(params![date_from, date_to], |r| {
            Ok(ReportItemRow {
                business_date: r.get(0)?,
                bill_number: r.get(1)?,
                bill_time: r.get(2)?,
                user_name: r.get(3)?,
                device_name: r.get(4)?,
                product_code: r.get(5)?,
                product_name: r.get(6)?,
                category_name: r.get(7)?,
                quantity: r.get(8)?,
                unit_price_paise: r.get(9)?,
                subtotal_paise: r.get(10)?,
                discount_amount_paise: r.get(11)?,
                gst_amount_paise: r.get(12)?,
                total_paise: r.get(13)?,
                payment_method: r.get(14)?,
                cash_amount_paise: r.get(15)?,
                upi_amount_paise: r.get(16)?,
                card_amount_paise: r.get(17)?,
                status: r.get(18)?,
            })
        }).map_err(|e| format!("Query map error: {}", e))?;

        for item in item_iter {
            if let Ok(row) = item {
                rows.push(row);
            }
        }

        // Query summary
        let mut summary_stmt = db.conn.prepare(
            "SELECT 
                COUNT(DISTINCT b.id) as total_bills,
                COALESCE(SUM(bi.quantity), 0) as total_items,
                COALESCE(SUM(b.subtotal_paise), 0) as gross_sales,
                COALESCE(SUM(b.discount_amount_paise), 0) as total_discount,
                COALESCE(SUM(b.gst_total_paise), 0) as total_gst,
                COALESCE(SUM(b.grand_total_paise), 0) as net_sales,
                COALESCE(SUM(p.cash_amount_paise), 0) as total_cash,
                COALESCE(SUM(p.upi_amount_paise), 0) as total_upi,
                COALESCE(SUM(p.card_amount_paise), 0) as total_card
             FROM bills b
             LEFT JOIN bill_items bi ON b.id = bi.bill_id
             LEFT JOIN payments p ON b.id = p.bill_id
             WHERE b.business_date >= ?1 AND b.business_date <= ?2 AND b.status = 'completed'"
        ).map_err(|e| format!("Summary query error: {}", e))?;

        let summary = summary_stmt.query_row(params![date_from, date_to], |r| {
            Ok(ReportSummary {
                total_bills: r.get(0)?,
                total_items: r.get(1)?,
                gross_sales_paise: r.get(2)?,
                total_discount_paise: r.get(3)?,
                total_gst_paise: r.get(4)?,
                net_sales_paise: r.get(5)?,
                cash_paise: r.get(6)?,
                upi_paise: r.get(7)?,
                card_paise: r.get(8)?,
            })
        }).unwrap_or_default();

        Ok((rows, summary))
    }

    /// List all generated reports
    pub fn get_report_list(db: &Database) -> Result<Vec<String>, String> {
        let reports_dir = db.reports_dir();
        if !reports_dir.exists() {
            return Ok(vec![]);
        }

        let mut reports = Vec::new();
        for entry in walkdir::WalkDir::new(reports_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "xlsx" || ext == "pdf") {
                reports.push(path.to_string_lossy().to_string());
            }
        }
        reports.sort();
        reports.reverse();
        Ok(reports)
    }
}
