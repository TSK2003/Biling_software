/// Converts rupees (f64) to integer paise (1 INR = 100 paise)
pub fn rupees_to_paise(rupees: f64) -> i64 {
    (rupees * 100.0).round() as i64
}

/// Converts integer paise to rupees (f64) for display
pub fn paise_to_rupees(paise: i64) -> f64 {
    paise as f64 / 100.0
}

/// Formats integer paise into a currency string (e.g. 10550 -> "105.50")
pub fn format_paise(paise: i64) -> String {
    let rupees = paise / 100;
    let remainder = (paise % 100).abs();
    format!("{}.{:02}", rupees, remainder)
}

/// Calculates line total in paise
pub fn calculate_line_total(unit_price_paise: i64, quantity: i32) -> i64 {
    unit_price_paise * (quantity as i64)
}

/// Calculates GST amount in paise
pub fn calculate_gst(amount_paise: i64, gst_percentage_x100: i32) -> i64 {
    (amount_paise * gst_percentage_x100 as i64) / 10000
}

/// Calculates discount amount in paise
pub fn calculate_discount(subtotal_paise: i64, discount_type: &str, discount_value: f64) -> i64 {
    match discount_type {
        "percentage" => {
            let discount_x100 = (discount_value * 100.0).round() as i64;
            (subtotal_paise * discount_x100) / 10000
        }
        "fixed" => rupees_to_paise(discount_value),
        _ => 0,
    }
}
