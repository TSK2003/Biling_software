use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use base64::Engine;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
    pub is_online: bool,
    pub port: Option<String>,
}

#[repr(C)]
struct DocInfo1W {
    p_doc_name: *const u16,
    p_output_file: *const u16,
    p_datatype: *const u16,
}

#[cfg(windows)]
#[link(name = "winspool")]
extern "system" {
    fn OpenPrinterW(
        p_printer_name: *const u16,
        ph_printer: *mut isize,
        p_default: *const std::ffi::c_void,
    ) -> i32;

    fn StartDocPrinterW(
        h_printer: isize,
        level: u32,
        p_doc_info: *const DocInfo1W,
    ) -> u32;

    fn StartPagePrinter(h_printer: isize) -> i32;

    fn WritePrinter(
        h_printer: isize,
        p_buf: *const u8,
        cb_buf: u32,
        pc_written: *mut u32,
    ) -> i32;

    fn EndPagePrinter(h_printer: isize) -> i32;

    fn EndDocPrinter(h_printer: isize) -> i32;

    fn ClosePrinter(h_printer: isize) -> i32;

    fn GetDefaultPrinterW(
        psz_buffer: *mut u16,
        pcch_buffer: *mut u32,
    ) -> i32;
}

pub struct PrinterService;

impl PrinterService {
    /// Get the default Windows printer name
    pub fn get_default_printer_name() -> Option<String> {
        #[cfg(windows)]
        unsafe {
            let mut size: u32 = 0;
            // First call to get required buffer size
            let _ = GetDefaultPrinterW(std::ptr::null_mut(), &mut size);
            if size == 0 {
                return Self::get_default_printer_fallback();
            }

            let mut buffer: Vec<u16> = vec![0; size as usize];
            if GetDefaultPrinterW(buffer.as_mut_ptr(), &mut size) != 0 {
                // Buffer includes null terminator
                let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
                let name = String::from_utf16_lossy(&buffer[..len]);
                if !name.trim().is_empty() {
                    return Some(name.trim().to_string());
                }
            }
        }

        Self::get_default_printer_fallback()
    }

    fn get_default_printer_fallback() -> Option<String> {
        let printers = Self::get_installed_printers();
        printers.iter().find(|p| p.is_default).map(|p| p.name.clone())
            .or_else(|| printers.first().map(|p| p.name.clone()))
    }

    /// List all installed Windows printers
    pub fn get_installed_printers() -> Vec<PrinterInfo> {
        // Query printers using PowerShell CIM / WMI which returns reliable metadata
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName, PrinterStatus | ConvertTo-Json -Compress"
            ])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let json_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !json_str.is_empty() {
                    // Could be a single object or an array of objects
                    if let Ok(printers) = serde_json::from_str::<Vec<serde_json::Value>>(&json_str) {
                        return printers.into_iter().filter_map(|val| {
                            let name = val["Name"].as_str()?.to_string();
                            let is_default = val["Default"].as_bool().unwrap_or(false);
                            let port = val["PortName"].as_str().map(|s| s.to_string());
                            Some(PrinterInfo {
                                name,
                                is_default,
                                is_online: true,
                                port,
                            })
                        }).collect();
                    } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        if let Some(name) = val["Name"].as_str() {
                            return vec![PrinterInfo {
                                name: name.to_string(),
                                is_default: val["Default"].as_bool().unwrap_or(true),
                                is_online: true,
                                port: val["PortName"].as_str().map(|s| s.to_string()),
                            }];
                        }
                    }
                }
            }
        }

        // Fallback: check default printer
        if let Some(def) = Self::get_default_printer_name() {
            vec![PrinterInfo {
                name: def,
                is_default: true,
                is_online: true,
                port: None,
            }]
        } else {
            Vec::new()
        }
    }

    /// Send raw bytes directly to a Windows printer via the Windows Print Spooler
    pub fn send_raw_to_printer(printer_name: &str, doc_title: &str, data: &[u8]) -> Result<(), String> {
        #[cfg(windows)]
        unsafe {
            let mut wide_printer: Vec<u16> = OsStr::new(printer_name).encode_wide().chain(std::iter::once(0)).collect();
            let wide_doc: Vec<u16> = OsStr::new(doc_title).encode_wide().chain(std::iter::once(0)).collect();
            let wide_datatype: Vec<u16> = OsStr::new("RAW").encode_wide().chain(std::iter::once(0)).collect();

            let mut h_printer: isize = 0;
            let open_res = OpenPrinterW(wide_printer.as_mut_ptr(), &mut h_printer, std::ptr::null());
            if open_res == 0 || h_printer == 0 {
                return Err(format!(
                    "Printer '{}' is unavailable. Please verify the printer is turned on and connected.",
                    printer_name
                ));
            }

            let doc_info = DocInfo1W {
                p_doc_name: wide_doc.as_ptr(),
                p_output_file: std::ptr::null(),
                p_datatype: wide_datatype.as_ptr(),
            };

            let print_job_id = StartDocPrinterW(h_printer, 1, &doc_info);
            if print_job_id == 0 {
                ClosePrinter(h_printer);
                return Err(format!(
                    "Unable to initiate print job on '{}'. Please check the Windows Print Spooler service.",
                    printer_name
                ));
            }

            if StartPagePrinter(h_printer) == 0 {
                EndDocPrinter(h_printer);
                ClosePrinter(h_printer);
                return Err(format!("Failed to start page on '{}'.", printer_name));
            }

            let mut bytes_written: u32 = 0;
            let write_res = WritePrinter(
                h_printer,
                data.as_ptr(),
                data.len() as u32,
                &mut bytes_written,
            );

            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);

            if write_res == 0 || bytes_written < data.len() as u32 {
                return Err(format!(
                    "Incomplete data written to '{}'. Only {} of {} bytes spooled.",
                    printer_name, bytes_written, data.len()
                ));
            }

            Ok(())
        }

        #[cfg(not(windows))]
        {
            Err("Direct hardware printing is only supported on Windows.".to_string())
        }
    }

    /// Converts a logo image (base64 data URL, raw base64, or bundled fallback icon) into ESC/POS GS v 0 raster bit image commands
    pub fn raster_image_to_esc_pos(logo_input: &str, target_width: u32) -> Option<Vec<u8>> {
        let img_bytes = if let Some(idx) = logo_input.find(";base64,") {
            let b64_str = &logo_input[idx + 8..];
            base64::engine::general_purpose::STANDARD.decode(b64_str.trim()).ok()
        } else if !logo_input.trim().is_empty() {
            base64::engine::general_purpose::STANDARD.decode(logo_input.trim()).ok()
        } else {
            None
        };

        let raw_bytes = match img_bytes {
            Some(b) if !b.is_empty() => b,
            _ => include_bytes!("../../icons/128x128.png").to_vec(),
        };

        let dyn_img = image::load_from_memory(&raw_bytes).ok()?;
        let rgba = dyn_img.to_rgba8();
        let (orig_w, orig_h) = (rgba.width(), rgba.height());
        if orig_w == 0 || orig_h == 0 {
            return None;
        }

        // Must be a multiple of 8 for ESC/POS raster byte packing
        let eff_width = ((target_width / 8) * 8).max(32);
        let eff_height = ((orig_h as f64 * eff_width as f64 / orig_w as f64).round() as u32).max(1);

        let resized = image::imageops::resize(
            &rgba,
            eff_width,
            eff_height,
            image::imageops::FilterType::Lanczos3,
        );

        let bytes_per_row = (eff_width / 8) as usize;
        let mut raster_data = vec![0u8; bytes_per_row * eff_height as usize];

        for y in 0..eff_height {
            for x in 0..eff_width {
                let pixel = resized.get_pixel(x, y);
                // Transparent pixel (>50% transparent) is paper background (white)
                if pixel[3] < 128 {
                    continue;
                }
                // Grayscale luminance
                let lum = (0.299 * pixel[0] as f64 + 0.587 * pixel[1] as f64 + 0.114 * pixel[2] as f64) as u8;
                // Dark pixels become printed black dots
                if lum < 180 {
                    let byte_idx = (y as usize * bytes_per_row) + (x as usize / 8);
                    let bit_pos = 7 - (x % 8);
                    raster_data[byte_idx] |= 1 << bit_pos;
                }
            }
        }

        let mut out = Vec::new();
        // Center alignment: ESC a 1
        out.extend_from_slice(&[0x1B, 0x61, 0x01]);

        // GS v 0 0 xL xH yL yH
        let xl = (bytes_per_row & 0xFF) as u8;
        let xh = ((bytes_per_row >> 8) & 0xFF) as u8;
        let yl = (eff_height & 0xFF) as u8;
        let yh = ((eff_height >> 8) & 0xFF) as u8;

        out.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00, xl, xh, yl, yh]);
        out.extend_from_slice(&raster_data);
        out.push(b'\n');

        Some(out)
    }

    /// Format receipt data into ESC/POS bytes for 80mm or 58mm thermal printers or plain text for A4
    pub fn build_receipt_bytes(
        shop_logo: &str,
        shop_name: &str,
        shop_phone: &str,
        shop_address: &str,
        shop_email: &str,
        gst_number: &str,
        fssai_number: &str,
        receipt_footer: &str,
        bill_number: i32,
        business_date: &str,
        bill_time: &str,
        cashier_name: &str,
        items: &[(String, i32, i64, i64)], // (name, qty, rate_paise, total_paise)
        subtotal_paise: i64,
        discount_paise: i64,
        gst_total_paise: i64,
        grand_total_paise: i64,
        payment_method: &str,
        tendered_cash_paise: Option<i64>,
        change_due_paise: Option<i64>,
        paper_size: &str, // "Thermal80", "Thermal58", "A4"
    ) -> Vec<u8> {
        let width = match paper_size {
            "Thermal58" => 32,
            "Thermal72" => 42,
            "Thermal100" => 56,
            "A4" | "Letter" => 76,
            "A5" => 52,
            "B5" => 62,
            "Continuous3Inch" => 48,
            _ => 48, // Default Thermal80
        };

        let mut buf = Vec::new();

        // 1. ESC/POS Initialize printer: ESC @ (0x1B 0x40)
        buf.extend_from_slice(&[0x1B, 0x40]);

        // 2. Select Character Code Table: PC437 (USA, Standard Europe)
        buf.extend_from_slice(&[0x1B, 0x74, 0x00]);

        // 3. Print Logo bitmap on thermal printers
        if paper_size == "Thermal80" || paper_size == "Thermal58" || paper_size == "Thermal72" || paper_size == "Thermal100" || paper_size == "Continuous3Inch" {
            let logo_target_w = match paper_size {
                "Thermal58" => 128,
                "Thermal72" => 150,
                "Thermal100" => 200,
                _ => 168,
            };
            if let Some(raster_bytes) = Self::raster_image_to_esc_pos(shop_logo, logo_target_w) {
                buf.extend_from_slice(&raster_bytes);
            }
        }

        // 4. Header: Shop Name (Center + Double Height/Width + Bold)
        // Center alignment: ESC a 1 (0x1B 0x61 0x01)
        buf.extend_from_slice(&[0x1B, 0x61, 0x01]);
        // Bold ON: ESC E 1 (0x1B 0x45 0x01)
        buf.extend_from_slice(&[0x1B, 0x45, 0x01]);
        if paper_size == "Thermal80" || paper_size == "A4" || paper_size == "Thermal100" || paper_size == "Letter" || paper_size == "Continuous3Inch" {
            // Double width & height: GS ! 0x11
            buf.extend_from_slice(&[0x1D, 0x21, 0x11]);
        } else {
            // Double height: GS ! 0x01
            buf.extend_from_slice(&[0x1D, 0x21, 0x01]);
        }
        let shop_name_upper = shop_name.to_uppercase();
        buf.extend_from_slice(shop_name_upper.as_bytes());
        buf.push(b'\n');

        // Reset text size & bold: GS ! 0x00, ESC E 0
        buf.extend_from_slice(&[0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]);

        // Shop Address
        if !shop_address.trim().is_empty() {
            for line in shop_address.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    buf.extend_from_slice(trimmed.as_bytes());
                    buf.push(b'\n');
                }
            }
        }

        // Phone
        if !shop_phone.trim().is_empty() {
            let phone_line = format!("Phone: {}", shop_phone.trim());
            buf.extend_from_slice(phone_line.as_bytes());
            buf.push(b'\n');
        }

        // Email
        if !shop_email.trim().is_empty() {
            let email_line = format!("Email: {}", shop_email.trim());
            buf.extend_from_slice(email_line.as_bytes());
            buf.push(b'\n');
        }

        // GST & FSSAI
        if !gst_number.trim().is_empty() {
            let gst_line = format!("GSTIN: {}", gst_number.trim().to_uppercase());
            buf.extend_from_slice(gst_line.as_bytes());
            buf.push(b'\n');
        }
        if !fssai_number.trim().is_empty() {
            let fssai_line = format!("FSSAI: {}", fssai_number.trim());
            buf.extend_from_slice(fssai_line.as_bytes());
            buf.push(b'\n');
        }

        // Left alignment: ESC a 0 (0x1B 0x61 0x00)
        buf.extend_from_slice(&[0x1B, 0x61, 0x00]);

        // Divider
        let divider = "-".repeat(width);
        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Invoice Metadata
        let mode_clean = match payment_method.to_lowercase().as_str() {
            "upi_cash" => "UPI + CASH".to_string(),
            other => other.replace('_', " + ").to_uppercase(),
        };

        let inv_str = format!("INVOICE: #{}", bill_number);
        let formatted_date = Self::format_date_dmy(business_date);
        let date_time_str = if bill_time.trim().is_empty() {
            formatted_date
        } else {
            format!("{} {}", formatted_date, bill_time.trim())
        };
        buf.extend_from_slice(Self::align_left_right(&inv_str, &date_time_str, width).as_bytes());
        buf.push(b'\n');

        let cashier_str = format!("Cashier: {}", cashier_name);
        let mode_str = format!("MODE: {}", mode_clean);
        buf.extend_from_slice(Self::align_left_right(&cashier_str, &mode_str, width).as_bytes());
        buf.push(b'\n');

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Table Header
        // Bold ON
        buf.extend_from_slice(&[0x1B, 0x45, 0x01]);
        if width >= 48 {
            // 80mm layout: ITEM (22) | QTY (4) | RATE (10) | TOTAL (12) = 48
            let col_header = Self::format_columns_80("ITEM", "QTY", "RATE", "TOTAL");
            buf.extend_from_slice(col_header.as_bytes());
        } else {
            // 58mm layout: ITEM (11) | QTY (3) | RATE (8) | TOTAL (10) = 32
            let col_header = Self::format_columns_58("ITEM", "QTY", "RATE", "TOTAL");
            buf.extend_from_slice(col_header.as_bytes());
        }
        buf.push(b'\n');
        // Bold OFF
        buf.extend_from_slice(&[0x1B, 0x45, 0x00]);

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Items List
        let mut total_qty: i32 = 0;
        for (name, qty, rate_paise, item_total_paise) in items {
            total_qty += *qty;
            let qty_str = qty.to_string();
            let rate_str = format!("{:.2}", (*rate_paise as f64) / 100.0);
            let total_str = format!("{:.2}", (*item_total_paise as f64) / 100.0);

            if width >= 48 {
                let lines = Self::format_item_row_80(name, &qty_str, &rate_str, &total_str);
                for line in lines {
                    buf.extend_from_slice(line.as_bytes());
                    buf.push(b'\n');
                }
            } else {
                let lines = Self::format_item_row_58(name, &qty_str, &rate_str, &total_str);
                for line in lines {
                    buf.extend_from_slice(line.as_bytes());
                    buf.push(b'\n');
                }
            }
        }

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Summary Lines
        let subtotal_label = format!("Subtotal ({} items, {} qty):", items.len(), total_qty);
        let subtotal_str = format!("Rs. {:.2}", (subtotal_paise as f64) / 100.0);
        buf.extend_from_slice(Self::align_left_right(&subtotal_label, &subtotal_str, width).as_bytes());
        buf.push(b'\n');

        if discount_paise > 0 {
            let disc_str = format!("-Rs. {:.2}", (discount_paise as f64) / 100.0);
            buf.extend_from_slice(Self::align_left_right("Discount:", &disc_str, width).as_bytes());
            buf.push(b'\n');
        }

        if gst_total_paise > 0 {
            let half_gst = (gst_total_paise as f64) / 200.0;
            let cgst_str = format!("Rs. {:.2}", half_gst);
            let sgst_str = format!("Rs. {:.2}", half_gst);
            buf.extend_from_slice(Self::align_left_right("CGST:", &cgst_str, width).as_bytes());
            buf.push(b'\n');
            buf.extend_from_slice(Self::align_left_right("SGST:", &sgst_str, width).as_bytes());
            buf.push(b'\n');
        }

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Net Grand Total (Bold + Double Height)
        buf.extend_from_slice(&[0x1B, 0x45, 0x01, 0x1D, 0x21, 0x01]);
        let total_str = format!("Rs. {:.2}", (grand_total_paise as f64) / 100.0);
        buf.extend_from_slice(Self::align_left_right("NET TOTAL:", &total_str, width).as_bytes());
        buf.push(b'\n');
        // Reset format
        buf.extend_from_slice(&[0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]);

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Payment Info
        buf.extend_from_slice(Self::align_left_right("Payment Mode:", &mode_clean, width).as_bytes());
        buf.push(b'\n');

        if let Some(tendered) = tendered_cash_paise {
            let is_cash_type = payment_method.to_lowercase() == "cash" || payment_method.to_lowercase() == "upi_cash";
            if tendered > 0 && is_cash_type {
                let tendered_str = format!("Rs. {:.2}", (tendered as f64) / 100.0);
                buf.extend_from_slice(Self::align_left_right("Tendered Cash:", &tendered_str, width).as_bytes());
                buf.push(b'\n');

                let change_val = change_due_paise.unwrap_or_else(|| {
                    if tendered > grand_total_paise {
                        tendered - grand_total_paise
                    } else {
                        0
                    }
                });
                let change_str = format!("Rs. {:.2}", (change_val as f64) / 100.0);
                buf.extend_from_slice(Self::align_left_right("Change Returned:", &change_str, width).as_bytes());
                buf.push(b'\n');
            }
        }

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Footer: Center alignment
        buf.extend_from_slice(&[0x1B, 0x61, 0x01]);

        let footer_custom = receipt_footer.trim();
        let footer_heading = if footer_custom.is_empty() {
            "THANK YOU! VISIT AGAIN".to_string()
        } else {
            footer_custom.to_uppercase()
        };

        // Bold ON for footer heading
        buf.extend_from_slice(&[0x1B, 0x45, 0x01]);
        buf.extend_from_slice(footer_heading.as_bytes());
        buf.push(b'\n');
        buf.extend_from_slice(&[0x1B, 0x45, 0x00]);

        // Feed paper (4 lines) to clear the cutter
        buf.extend_from_slice(b"\n\n\n\n");

        // ESC/POS Cut paper command: GS V 0 (0x1D 0x56 0x00 - full cut)
        buf.extend_from_slice(&[0x1D, 0x56, 0x00]);

        buf
    }

    /// Build a test print ticket for diagnostic testing
    pub fn build_test_receipt_bytes(
        shop_name: &str,
        printer_name: &str,
        paper_size: &str,
    ) -> Vec<u8> {
        let width = match paper_size {
            "Thermal58" => 32,
            "Thermal72" => 42,
            "Thermal100" => 56,
            "A4" | "Letter" => 76,
            "A5" => 52,
            "B5" => 62,
            "Continuous3Inch" => 48,
            _ => 48,
        };

        let mut buf = Vec::new();

        // 1. ESC/POS Init
        buf.extend_from_slice(&[0x1B, 0x40]);
        buf.extend_from_slice(&[0x1B, 0x74, 0x00]);

        // 2. Header
        buf.extend_from_slice(&[0x1B, 0x61, 0x01, 0x1B, 0x45, 0x01, 0x1D, 0x21, 0x01]);
        buf.extend_from_slice(b"*** PRINTER TEST TICKET ***\n");
        buf.extend_from_slice(&[0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]);

        buf.extend_from_slice(shop_name.as_bytes());
        buf.push(b'\n');

        let now = chrono::Local::now().format("%d-%m-%Y %H:%M:%S").to_string();
        buf.extend_from_slice(now.as_bytes());
        buf.push(b'\n');

        buf.extend_from_slice(&[0x1B, 0x61, 0x00]);
        let divider = "-".repeat(width);
        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        let p_line = format!("Printer: {}", printer_name);
        buf.extend_from_slice(p_line.as_bytes());
        buf.push(b'\n');

        let s_line = format!("Paper Format: {} ({} cols)", paper_size, width);
        buf.extend_from_slice(s_line.as_bytes());
        buf.push(b'\n');

        let m_line = "Mode: Direct Windows Print Spooler (RAW)";
        buf.extend_from_slice(m_line.as_bytes());
        buf.push(b'\n');

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        // Font & Alignment tests
        buf.extend_from_slice(b"Normal Text: ABCDEFGHIJKLMNOPQRSTUVWXYZ\n");
        buf.extend_from_slice(&[0x1B, 0x45, 0x01]);
        buf.extend_from_slice(b"Bold Text: 1234567890 - PASSED\n");
        buf.extend_from_slice(&[0x1B, 0x45, 0x00]);

        buf.extend_from_slice(Self::align_left_right("Left Column", "Right Column", width).as_bytes());
        buf.push(b'\n');

        buf.extend_from_slice(divider.as_bytes());
        buf.push(b'\n');

        buf.extend_from_slice(&[0x1B, 0x61, 0x01]);
        buf.extend_from_slice(b"HARDWARE PRINT VERIFIED OK\n");
        buf.extend_from_slice(b"No browser preview | Direct spool\n");

        // Feed lines & cut
        buf.extend_from_slice(b"\n\n\n\n\n");
        buf.extend_from_slice(&[0x1D, 0x56, 0x00]);

        buf
    }

    pub fn format_date_dmy(date_str: &str) -> String {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(date_str.trim(), "%Y-%m-%d") {
            d.format("%d-%m-%Y").to_string()
        } else {
            date_str.to_string()
        }
    }

    fn wrap_text(text: &str, max_len: usize) -> Vec<String> {
        let mut lines = Vec::new();
        let words = text.split_whitespace();
        let mut current_line = String::new();

        for word in words {
            if current_line.is_empty() {
                if word.chars().count() > max_len {
                    let chars: Vec<char> = word.chars().collect();
                    let mut i = 0;
                    while i < chars.len() {
                        let end = (i + max_len).min(chars.len());
                        let part: String = chars[i..end].iter().collect();
                        if end == chars.len() {
                            current_line = part;
                        } else {
                            lines.push(part);
                        }
                        i = end;
                    }
                } else {
                    current_line.push_str(word);
                }
            } else if current_line.chars().count() + 1 + word.chars().count() <= max_len {
                current_line.push(' ');
                current_line.push_str(word);
            } else {
                lines.push(std::mem::take(&mut current_line));
                if word.chars().count() > max_len {
                    let chars: Vec<char> = word.chars().collect();
                    let mut i = 0;
                    while i < chars.len() {
                        let end = (i + max_len).min(chars.len());
                        let part: String = chars[i..end].iter().collect();
                        if end == chars.len() {
                            current_line = part;
                        } else {
                            lines.push(part);
                        }
                        i = end;
                    }
                } else {
                    current_line = word.to_string();
                }
            }
        }
        if !current_line.is_empty() {
            lines.push(current_line);
        }
        if lines.is_empty() {
            lines.push(String::new());
        }
        lines
    }

    fn align_left_right(left: &str, right: &str, width: usize) -> String {
        let left_len = left.chars().count();
        let right_len = right.chars().count();

        if left_len + right_len >= width {
            let available = width.saturating_sub(right_len + 1);
            let truncated_left: String = left.chars().take(available).collect();
            format!("{} {}", truncated_left, right)
        } else {
            let spaces = width - left_len - right_len;
            format!("{}{}{}", left, " ".repeat(spaces), right)
        }
    }

    fn format_columns_80(item: &str, qty: &str, rate: &str, total: &str) -> String {
        // Total 48 cols: Item (22) + Qty (4) + Rate (10) + Total (12) = 48
        format!("{:<22}{:>4}{:>10}{:>12}", item, qty, rate, total)
    }

    fn format_item_row_80(name: &str, qty: &str, rate: &str, total: &str) -> Vec<String> {
        let name_lines = Self::wrap_text(name, 22);
        let mut lines = Vec::new();

        lines.push(Self::format_columns_80(&name_lines[0], qty, rate, total));

        for part in &name_lines[1..] {
            lines.push(format!("{:<48}", part));
        }

        lines
    }

    fn format_columns_58(item: &str, qty: &str, rate: &str, total: &str) -> String {
        // Total 32 cols: Item (11) + Qty (3) + Rate (8) + Total (10) = 32
        format!("{:<11}{:>3}{:>8}{:>10}", item, qty, rate, total)
    }

    fn format_item_row_58(name: &str, qty: &str, rate: &str, total: &str) -> Vec<String> {
        let name_lines = Self::wrap_text(name, 11);
        let mut lines = Vec::new();

        lines.push(Self::format_columns_58(&name_lines[0], qty, rate, total));

        for part in &name_lines[1..] {
            lines.push(format!("{:<32}", part));
        }

        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_80mm_receipt_generation() {
        let items = vec![
            ("Cadbury Dairy Milk Silk 150g".to_string(), 2, 17500, 35000),
            ("Nescafe Classic 50g Jar".to_string(), 1, 19000, 19000),
        ];

        let bytes = PrinterService::build_receipt_bytes(
            "",
            "My Supermarket",
            "9876543210",
            "123 Main Road, City",
            "info@mysupermarket.com",
            "33AAAAA0000A1Z5",
            "12345678901234",
            "Thank you! Visit again.",
            101,
            "2026-09-28",
            "12:30:00",
            "Karthick",
            &items,
            54000,
            4000,
            2500,
            52500,
            "cash",
            Some(60000),
            Some(7500),
            "Thermal80",
        );

        assert!(!bytes.is_empty());
        // Verify ESC/POS init command is present
        assert_eq!(&bytes[0..2], &[0x1B, 0x40]);
        // Verify Cut command is present at the end
        assert!(bytes.windows(3).any(|w| w == [0x1D, 0x56, 0x00]));

        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("MY SUPERMARKET"));
        assert!(text.contains("Email: info@mysupermarket.com"));
        assert!(text.contains("INVOICE: #101"));
        assert!(text.contains("CASH"));
        assert!(text.contains("525.00"));
        assert!(text.contains("Change Returned:"));
    }

    #[test]
    fn test_58mm_receipt_generation() {
        let items = vec![
            ("Tea Cup Special Masala".to_string(), 3, 2000, 6000),
            ("Samosa Hot and Crispy Extra Chutney".to_string(), 2, 1500, 3000),
        ];

        let bytes = PrinterService::build_receipt_bytes(
            "",
            "Tea Stall",
            "9123456780",
            "Market Gate",
            "",
            "",
            "",
            "Visit again!",
            55,
            "2026-09-28",
            "16:45:00",
            "Ramesh",
            &items,
            9000,
            0,
            0,
            9000,
            "upi",
            None,
            None,
            "Thermal58",
        );

        assert!(!bytes.is_empty());
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("TEA STALL"));
        assert!(text.contains("INVOICE: #55"));
        assert!(text.contains("UPI"));
        assert!(text.contains("90.00"));
    }

    #[test]
    fn test_a4_receipt_generation() {
        let items = vec![
            ("Industrial Safety Helmet Class A".to_string(), 10, 45000, 450000),
            ("High Visibility Safety Vest".to_string(), 10, 25000, 250000),
        ];

        let bytes = PrinterService::build_receipt_bytes(
            "",
            "Aescion Safety Solutions",
            "044-23456789",
            "Plot 12, Industrial Estate",
            "sales@aescion.com",
            "33AAAAA0000A1Z5",
            "",
            "Goods once sold cannot be returned without invoice.",
            2001,
            "2026-09-28",
            "10:00:00",
            "Admin",
            &items,
            700000,
            50000,
            117000,
            767000,
            "upi_cash",
            None,
            None,
            "A4",
        );

        assert!(!bytes.is_empty());
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("INVOICE: #2001"));
        assert!(text.contains("AESCION SAFETY SOLUTIONS"));
        assert!(text.contains("Email: sales@aescion.com"));
        assert!(text.contains("Industrial Safety"));
        assert!(text.contains("7670.00"));
    }

    #[test]
    fn test_long_product_name_wrapping_80mm() {
        let lines = PrinterService::format_item_row_80(
            "Extra Large Basmati Rice 25kg Premium Royal Heritage Brand",
            "1",
            "2850.00",
            "2850.00",
        );

        // Name wraps into multiple lines
        assert!(lines.len() >= 3);
        assert!(lines[0].contains("2850.00"));
        assert!(lines[1].contains("Premium"));
        assert!(lines[2].contains("Heritage Brand"));
    }

    #[test]
    fn test_long_product_name_wrapping_58mm() {
        let lines = PrinterService::format_item_row_58(
            "Super Crunchy Cashew Nuts 500g",
            "1",
            "450.00",
            "450.00",
        );

        // 58mm max name length is 11 chars, so it wraps
        assert!(lines.len() >= 2);
        assert!(lines[0].contains("450.00"));
    }

    #[test]
    fn test_test_receipt_ticket_generation() {
        let bytes = PrinterService::build_test_receipt_bytes(
            "Demo Retail Store",
            "TVSE RP3200 Lite",
            "Thermal80",
        );

        assert!(!bytes.is_empty());
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("PRINTER TEST TICKET"));
        assert!(text.contains("Demo Retail Store"));
        assert!(text.contains("TVSE RP3200 Lite"));
        assert!(text.contains("PASSED"));
    }

    #[test]
    fn test_user_exact_bill_1_receipt_matches_preview_screen() {
        let items = vec![
            ("Adrak Elaichi Chai".to_string(), 1, 2500, 2500),
            ("Aloo Tikki Chaat".to_string(), 1, 6000, 6000),
            ("BBQ Chicken Pizza 8\"".to_string(), 1, 23000, 23000),
            ("Belgian Chocolate Cupcake".to_string(), 1, 3500, 3500),
            ("Bengali Rasgulla (2 pcs)".to_string(), 1, 4000, 4000),
        ];

        let bytes = PrinterService::build_receipt_bytes(
            "",
            "My Shop",
            "",
            "",
            "",
            "",
            "",
            "Thank you for shopping with us! Please visit again.",
            1,
            "2026-09-28",
            "19:13:54",
            "Administrator",
            &items,
            39000,
            0,
            1950,
            40950,
            "upi_cash",
            Some(20475),
            Some(0),
            "Thermal80",
        );

        assert!(!bytes.is_empty());
        // Verify ESC/POS raster bitmap command GS v 0 is present for logo
        assert!(bytes.windows(4).any(|w| w == [0x1D, 0x76, 0x30, 0x00]));

        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("MY SHOP"));
        assert!(text.contains("INVOICE: #1"));
        assert!(text.contains("28-09-2026 19:13:54"));
        assert!(text.contains("Cashier: Administrator"));
        assert!(text.contains("MODE: UPI + CASH"));
        assert!(text.contains("Adrak Elaichi Chai"));
        assert!(text.contains("Belgian Chocolate"));
        assert!(text.contains("Cupcake"));
        assert!(text.contains("Bengali Rasgulla"));
        assert!(text.contains("Subtotal (5 items, 5 qty):"));
        assert!(text.contains("CGST:"));
        assert!(text.contains("9.75"));
        assert!(text.contains("SGST:"));
        assert!(text.contains("NET TOTAL:"));
        assert!(text.contains("409.50"));
        assert!(text.contains("Payment Mode:"));
        assert!(text.contains("Tendered Cash:"));
        assert!(text.contains("204.75"));
        assert!(text.contains("Change Returned:"));
        assert!(text.contains("0.00"));
        assert!(text.contains("THANK YOU FOR SHOPPING WITH US! PLEASE VISIT AGAIN"));
    }

    #[test]
    fn test_installed_printers_query() {
        // Querying installed printers should return a list without panic
        let printers = PrinterService::get_installed_printers();
        println!("Detected {} printers on system", printers.len());
        for p in &printers {
            println!("Printer: {} (Default: {}, Port: {:?})", p.name, p.is_default, p.port);
        }
        let def = PrinterService::get_default_printer_name();
        println!("Default printer: {:?}", def);
    }

    #[test]
    fn test_send_to_real_spooler() {
        if let Some(def) = PrinterService::get_default_printer_name() {
            println!("Testing send_raw_to_printer to default printer: {}", def);
            let bytes = PrinterService::build_test_receipt_bytes("Aescion POS", &def, "Thermal80");
            let res = PrinterService::send_raw_to_printer(&def, "Test_Spooler_Job", &bytes);
            println!("Spooler send result: {:?}", res);
            assert!(res.is_ok(), "Spooler job should succeed: {:?}", res);
        }
    }
}

