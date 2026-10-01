use rusqlite::{params, Connection, Result};
use base64::Engine;

pub struct DemoProduct {
    pub code: &'static str,
    pub name: &'static str,
    pub category_name: &'static str,
    pub price_paise: i64,
    pub buying_price_paise: i64,
    pub is_restockable: bool,
    pub initial_stock: i32,
    pub gst_enabled: bool,
    pub gst_percentage_x100: i32,
    pub barcode: &'static str,
    pub icon_kind: &'static str,
}

pub const DEMO_CATEGORIES: &[(&str, i32, &str)] = &[
    ("Juice & Beverages", 1, "juice"),
    ("Snacks & Chaat", 2, "snack"),
    ("Fast Food & Burgers", 3, "burger"),
    ("Ice Cream & Desserts", 4, "icecream"),
    ("Bakery & Pastries", 5, "pastry"),
    ("Tea & Coffee", 6, "coffee"),
    ("Meals & Combos", 7, "thali"),
    ("Packaged Goods", 8, "packaged"),
];

/// Generates a crisp, colorful, responsive vector SVG data URI for demo products
pub fn generate_product_svg(name: &str, category: &str, icon_kind: &str) -> String {
    let (c1, c2, badge_bg, badge_txt) = match icon_kind {
        "juice" => ("#f43f5e", "#be123c", "#ffe4e6", "#9f1239"), // Rose / Ruby
        "citrus" => ("#f97316", "#c2410c", "#ffedd5", "#9a3412"), // Citrus Orange
        "tropical" => ("#eab308", "#ca8a04", "#fef9c3", "#854d0e"), // Golden Yellow
        "soda" => ("#06b6d4", "#0891b2", "#cffafe", "#155e75"), // Refreshing Cyan
        "shake" => ("#ec4899", "#be185d", "#fce7f3", "#9d174d"), // Sweet Pink
        "samosa" => ("#d97706", "#b45309", "#fef3c7", "#92400e"), // Golden Fried
        "fries" => ("#f59e0b", "#d97706", "#fef3c7", "#78350f"), // Amber Potato
        "chaat" => ("#10b981", "#059669", "#d1fae5", "#065f46"), // Mint & Herb Green
        "burger" => ("#ea580c", "#9a3412", "#ffedd5", "#7c2d12"), // Gourmet Toasted
        "pizza" => ("#dc2626", "#991b1b", "#fee2e2", "#7f1d1d"), // Italian Red
        "sandwich" => ("#84cc16", "#4d7c0f", "#ecfccb", "#365314"), // Garden Fresh
        "noodles" => ("#f59e0b", "#b45309", "#fef3c7", "#78350f"), // Wok Sauté
        "icecream" => ("#a855f7", "#7e22ce", "#f3e8ff", "#581c87"), // Berry Purple
        "dessert" => ("#ec4899", "#9333ea", "#fdf2f8", "#701a75"), // Rich Sweet
        "pastry" => ("#854d0e", "#543310", "#fef9c3", "#451a03"), // Chocolate Fudge
        "doughnut" => ("#f43f5e", "#e11d48", "#ffe4e6", "#881337"), // Glazed Frosting
        "coffee" => ("#78350f", "#451a03", "#fef3c7", "#38200f"), // Dark Roast Espresso
        "tea" => ("#b45309", "#78350f", "#fef3c7", "#451a03"), // Spiced Chai
        "dosa" => ("#d97706", "#92400e", "#fef3c7", "#713f12"), // Ghee Golden
        "thali" => ("#0284c7", "#0369a1", "#e0f2fe", "#075985"), // Feast Royal Blue
        "packaged" => ("#3b82f6", "#1d4ed8", "#dbeafe", "#1e40af"), // Modern Retail Blue
        _ => ("#64748b", "#334155", "#f1f5f9", "#0f172a"),
    };

    let icon_svg = match icon_kind {
        "juice" | "citrus" | "tropical" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M12 16 L52 16 L46 76 Q45 84 32 84 Q19 84 18 76 Z" fill="rgba(255,255,255,0.2)"/>
                <line x1="16" y1="36" x2="48" y2="36" stroke-dasharray="2 3"/>
                <path d="M40 8 L48 0" stroke-width="5"/>
                <circle cx="50" cy="22" r="10" fill="rgba(255,255,255,0.35)" stroke="#ffffff" stroke-width="3"/>
            </g>"##
        },
        "soda" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M14 20 L50 20 L44 78 Q43 84 32 84 Q21 84 20 78 Z" fill="rgba(255,255,255,0.2)"/>
                <circle cx="28" cy="46" r="3" fill="#ffffff"/>
                <circle cx="36" cy="58" r="2.5" fill="#ffffff"/>
                <circle cx="26" cy="68" r="2" fill="#ffffff"/>
                <line x1="38" y1="12" x2="44" y2="2" stroke-width="5"/>
            </g>"##
        },
        "shake" => {
            r##"<g transform="translate(48, 36)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M16 32 L48 32 L43 80 Q42 86 32 86 Q22 86 21 80 Z" fill="rgba(255,255,255,0.25)"/>
                <path d="M18 32 Q32 14 46 32" fill="rgba(255,255,255,0.4)"/>
                <circle cx="32" cy="14" r="5" fill="#ffffff"/>
                <line x1="38" y1="16" x2="48" y2="0" stroke-width="5"/>
            </g>"##
        },
        "samosa" => {
            r##"<g transform="translate(48, 42)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <polygon points="32,10 6,68 58,68" fill="rgba(255,255,255,0.25)"/>
                <path d="M22,42 Q32,48 42,42"/>
                <path d="M26,18 Q32,24 38,18" stroke-dasharray="2 2"/>
            </g>"##
        },
        "fries" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M14 36 L50 36 L44 80 Q43 86 32 86 Q21 86 20 80 Z" fill="rgba(255,255,255,0.3)"/>
                <rect x="20" y="8" width="6" height="30" rx="3" fill="#ffffff"/>
                <rect x="29" y="4" width="6" height="34" rx="3" fill="#ffffff"/>
                <rect x="38" y="10" width="6" height="28" rx="3" fill="#ffffff"/>
            </g>"##
        },
        "chaat" => {
            r##"<g transform="translate(48, 40)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M8 44 Q32 76 56 44 Z" fill="rgba(255,255,255,0.25)"/>
                <circle cx="20" cy="36" r="8" fill="rgba(255,255,255,0.4)"/>
                <circle cx="44" cy="36" r="8" fill="rgba(255,255,255,0.4)"/>
                <circle cx="32" cy="26" r="9" fill="#ffffff"/>
            </g>"##
        },
        "burger" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M10 36 Q32 16 54 36 Z" fill="rgba(255,255,255,0.35)"/>
                <rect x="8" y="42" width="48" height="8" rx="4" fill="#ffffff"/>
                <path d="M8 56 Q32 60 56 56" stroke-width="6"/>
                <path d="M12 64 Q32 80 52 64 Z" fill="rgba(255,255,255,0.35)"/>
                <circle cx="24" cy="28" r="1.5" fill="#ffffff"/>
                <circle cx="34" cy="24" r="1.5" fill="#ffffff"/>
                <circle cx="42" cy="28" r="1.5" fill="#ffffff"/>
            </g>"##
        },
        "pizza" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M32 10 L56 72 Q32 82 8 72 Z" fill="rgba(255,255,255,0.25)"/>
                <path d="M10 68 Q32 78 54 68" stroke-width="6"/>
                <circle cx="28" cy="46" r="4.5" fill="#ffffff"/>
                <circle cx="38" cy="56" r="4" fill="#ffffff"/>
                <circle cx="26" cy="62" r="3.5" fill="#ffffff"/>
            </g>"##
        },
        "sandwich" => {
            r##"<g transform="translate(48, 40)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <polygon points="10,68 54,68 54,20" fill="rgba(255,255,255,0.25)"/>
                <line x1="10" y1="68" x2="54" y2="20" stroke-width="6"/>
                <line x1="20" y1="68" x2="54" y2="34" stroke-dasharray="3 3"/>
            </g>"##
        },
        "noodles" => {
            r##"<g transform="translate(48, 40)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M8 38 Q32 76 56 38 Z" fill="rgba(255,255,255,0.25)"/>
                <path d="M14 38 Q22 24 32 38 Q42 24 50 38" stroke-width="4"/>
                <line x1="16" y1="12" x2="48" y2="4" stroke-width="5"/>
            </g>"##
        },
        "icecream" => {
            r##"<g transform="translate(48, 36)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <polygon points="18,48 46,48 32,86" fill="rgba(255,255,255,0.3)"/>
                <circle cx="32" cy="34" r="16" fill="rgba(255,255,255,0.35)"/>
                <circle cx="32" cy="14" r="4" fill="#ffffff"/>
            </g>"##
        },
        "dessert" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M12 44 Q32 74 52 44 Z" fill="rgba(255,255,255,0.25)"/>
                <ellipse cx="32" cy="44" rx="20" ry="6" fill="#ffffff"/>
                <circle cx="32" cy="28" r="8" fill="rgba(255,255,255,0.4)"/>
            </g>"##
        },
        "pastry" => {
            r##"<g transform="translate(48, 40)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <polygon points="12,66 54,66 46,26 20,26" fill="rgba(255,255,255,0.25)"/>
                <line x1="15" y1="46" x2="51" y2="46"/>
                <circle cx="33" cy="18" r="6" fill="#ffffff"/>
            </g>"##
        },
        "doughnut" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <circle cx="32" cy="42" r="26" fill="rgba(255,255,255,0.25)"/>
                <circle cx="32" cy="42" r="10" fill="#ffffff"/>
                <circle cx="22" cy="28" r="2" fill="#ffffff"/>
                <circle cx="40" cy="26" r="2" fill="#ffffff"/>
                <circle cx="44" cy="52" r="2" fill="#ffffff"/>
            </g>"##
        },
        "coffee" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M12 30 L48 30 L44 68 Q43 74 30 74 Q17 74 16 68 Z" fill="rgba(255,255,255,0.25)"/>
                <path d="M48 38 Q58 38 58 48 Q58 58 46 58" stroke-width="4"/>
                <line x1="8" y1="78" x2="52" y2="78" stroke-width="5"/>
                <path d="M24 22 Q28 14 24 6" stroke-width="3" stroke-dasharray="2 2"/>
                <path d="M34 22 Q38 14 34 6" stroke-width="3" stroke-dasharray="2 2"/>
            </g>"##
        },
        "tea" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M16 28 L48 28 L44 74 Q43 78 32 78 Q21 78 20 74 Z" fill="rgba(255,255,255,0.25)"/>
                <line x1="16" y1="46" x2="48" y2="46"/>
                <line x1="18" y1="58" x2="46" y2="58"/>
                <path d="M28 20 Q32 12 28 4" stroke-width="3"/>
                <path d="M36 20 Q40 12 36 4" stroke-width="3"/>
            </g>"##
        },
        "dosa" => {
            r##"<g transform="translate(48, 42)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <rect x="8" y="24" width="48" height="24" rx="12" fill="rgba(255,255,255,0.25)"/>
                <line x1="6" y1="62" x2="58" y2="62" stroke-width="5"/>
                <circle cx="20" cy="54" r="6" fill="#ffffff"/>
                <circle cx="44" cy="54" r="6" fill="#ffffff"/>
            </g>"##
        },
        "thali" => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <circle cx="32" cy="44" r="30" fill="rgba(255,255,255,0.2)"/>
                <circle cx="22" cy="30" r="7" fill="#ffffff"/>
                <circle cx="42" cy="30" r="7" fill="#ffffff"/>
                <circle cx="32" cy="56" r="10" fill="rgba(255,255,255,0.35)"/>
            </g>"##
        },
        _ => {
            r##"<g transform="translate(48, 38)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <rect x="14" y="16" width="36" height="56" rx="6" fill="rgba(255,255,255,0.25)"/>
                <line x1="22" y1="32" x2="42" y2="32"/>
                <line x1="22" y1="44" x2="42" y2="44"/>
                <line x1="22" y1="56" x2="34" y2="56"/>
            </g>"##
        }
    };

    let cat_label = match category {
        "Juice & Beverages" => "BEVERAGE",
        "Snacks & Chaat" => "SNACK",
        "Fast Food & Burgers" => "FAST FOOD",
        "Ice Cream & Desserts" => "DESSERT",
        "Bakery & Pastries" => "BAKERY",
        "Tea & Coffee" => "HOT BREW",
        "Meals & Combos" => "COMBO MEAL",
        "Packaged Goods" => "RETAIL PACK",
        _ => "CATALOG",
    };

    let title_short: String = name.chars().take(18).collect();

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}" />
      <stop offset="100%" stop-color="{c2}" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="160" height="160" rx="22" fill="url(#bgGrad)" />
  <circle cx="130" cy="30" r="45" fill="rgba(255,255,255,0.08)" />
  <circle cx="20" cy="140" r="35" fill="rgba(0,0,0,0.08)" />
  <g filter="url(#shadow)">
    {icon_svg}
  </g>
  <rect x="14" y="118" width="132" height="28" rx="8" fill="rgba(255,255,255,0.92)" filter="url(#shadow)" />
  <text x="80" y="136" fill="#0f172a" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="9" font-weight="700" text-anchor="middle">{title_short}</text>
  <rect x="52" y="10" width="56" height="15" rx="7.5" fill="{badge_bg}" />
  <text x="80" y="21" fill="{badge_txt}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="7" font-weight="800" text-anchor="middle" letter-spacing="0.5">{cat_label}</text>
</svg>"##
    );

    let b64 = base64::engine::general_purpose::STANDARD.encode(svg.as_bytes());
    format!("data:image/svg+xml;base64,{}", b64)
}

/// Generates a category badge SVG
pub fn generate_category_svg(name: &str) -> String {
    let (c1, c2) = match name {
        "Juice & Beverages" => ("#f43f5e", "#be123c"),
        "Snacks & Chaat" => ("#d97706", "#b45309"),
        "Fast Food & Burgers" => ("#ea580c", "#9a3412"),
        "Ice Cream & Desserts" => ("#a855f7", "#7e22ce"),
        "Bakery & Pastries" => ("#854d0e", "#543310"),
        "Tea & Coffee" => ("#78350f", "#451a03"),
        "Meals & Combos" => ("#0284c7", "#0369a1"),
        "Packaged Goods" => ("#3b82f6", "#1d4ed8"),
        _ => ("#64748b", "#334155"),
    };

    let initial = name.chars().next().unwrap_or('C');

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="cGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}" />
      <stop offset="100%" stop-color="{c2}" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="20" fill="url(#cGrad)" />
  <text x="50" y="62" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="800" text-anchor="middle">{initial}</text>
</svg>"##
    );

    let b64 = base64::engine::general_purpose::STANDARD.encode(svg.as_bytes());
    format!("data:image/svg+xml;base64,{}", b64)
}

pub const DEMO_PRODUCTS: &[DemoProduct] = &[
    // Category 1: Juice & Beverages (18 items)
    // Critical stock: Pomegranate (2) -> Red alert
    // Low stock: Pineapple (4) -> Yellow alert
    DemoProduct { code: "JUC001", name: "Fresh Apple Juice", category_name: "Juice & Beverages", price_paise: 8000, buying_price_paise: 4800, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901001", icon_kind: "juice" },
    DemoProduct { code: "JUC002", name: "Fresh Orange Juice", category_name: "Juice & Beverages", price_paise: 7000, buying_price_paise: 4200, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901002", icon_kind: "citrus" },
    DemoProduct { code: "JUC003", name: "Pomegranate Juice", category_name: "Juice & Beverages", price_paise: 9000, buying_price_paise: 5500, is_restockable: true, initial_stock: 2, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901003", icon_kind: "juice" },
    DemoProduct { code: "JUC004", name: "Sweet Lime (Mosambi) Juice", category_name: "Juice & Beverages", price_paise: 6000, buying_price_paise: 3500, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901004", icon_kind: "citrus" },
    DemoProduct { code: "JUC005", name: "Watermelon Juice", category_name: "Juice & Beverages", price_paise: 5000, buying_price_paise: 2500, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901005", icon_kind: "juice" },
    DemoProduct { code: "JUC006", name: "Pineapple Juice", category_name: "Juice & Beverages", price_paise: 7000, buying_price_paise: 4000, is_restockable: true, initial_stock: 4, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901006", icon_kind: "tropical" },
    DemoProduct { code: "JUC007", name: "Fresh Mango Juice", category_name: "Juice & Beverages", price_paise: 8000, buying_price_paise: 4800, is_restockable: true, initial_stock: 22, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901007", icon_kind: "tropical" },
    DemoProduct { code: "JUC008", name: "Fresh Grape Juice", category_name: "Juice & Beverages", price_paise: 7000, buying_price_paise: 3800, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901008", icon_kind: "juice" },
    DemoProduct { code: "JUC009", name: "Mixed Fruit Juice", category_name: "Juice & Beverages", price_paise: 9000, buying_price_paise: 5200, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901009", icon_kind: "tropical" },
    DemoProduct { code: "JUC010", name: "Fresh Lemonade", category_name: "Juice & Beverages", price_paise: 3000, buying_price_paise: 1500, is_restockable: true, initial_stock: 35, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901010", icon_kind: "citrus" },
    DemoProduct { code: "JUC011", name: "Mint Lime Cooler", category_name: "Juice & Beverages", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 28, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901011", icon_kind: "citrus" },
    DemoProduct { code: "JUC012", name: "Blue Curacao Mocktail", category_name: "Juice & Beverages", price_paise: 9000, buying_price_paise: 4500, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8901012", icon_kind: "soda" },
    DemoProduct { code: "JUC013", name: "Virgin Mojito", category_name: "Juice & Beverages", price_paise: 9000, buying_price_paise: 4500, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8901013", icon_kind: "soda" },
    DemoProduct { code: "JUC014", name: "Green Apple Soda", category_name: "Juice & Beverages", price_paise: 7000, buying_price_paise: 3500, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8901014", icon_kind: "soda" },
    DemoProduct { code: "JUC015", name: "Tender Coconut Water", category_name: "Juice & Beverages", price_paise: 5000, buying_price_paise: 3200, is_restockable: true, initial_stock: 20, gst_enabled: false, gst_percentage_x100: 0, barcode: "8901015", icon_kind: "tropical" },
    DemoProduct { code: "JUC016", name: "Sugarcane Juice", category_name: "Juice & Beverages", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 25, gst_enabled: false, gst_percentage_x100: 0, barcode: "8901016", icon_kind: "tropical" },
    DemoProduct { code: "JUC017", name: "Strawberry Milkshake", category_name: "Juice & Beverages", price_paise: 9000, buying_price_paise: 5000, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901017", icon_kind: "shake" },
    DemoProduct { code: "JUC018", name: "Chocolate Thick Shake", category_name: "Juice & Beverages", price_paise: 11000, buying_price_paise: 6000, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901018", icon_kind: "shake" },

    // Category 2: Snacks & Chaat (18 items)
    // Critical: Paneer Samosa (1) -> Red alert
    // Low stock: Peri Peri Fries (3) -> Yellow alert
    DemoProduct { code: "SNK001", name: "Vegetable Samosa (2 pcs)", category_name: "Snacks & Chaat", price_paise: 3000, buying_price_paise: 1500, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902001", icon_kind: "samosa" },
    DemoProduct { code: "SNK002", name: "Paneer Samosa (2 pcs)", category_name: "Snacks & Chaat", price_paise: 5000, buying_price_paise: 2800, is_restockable: true, initial_stock: 1, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902002", icon_kind: "samosa" },
    DemoProduct { code: "SNK003", name: "Crispy Veg Puff", category_name: "Snacks & Chaat", price_paise: 2500, buying_price_paise: 1200, is_restockable: true, initial_stock: 24, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902003", icon_kind: "samosa" },
    DemoProduct { code: "SNK004", name: "Paneer Butter Puff", category_name: "Snacks & Chaat", price_paise: 3500, buying_price_paise: 2000, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902004", icon_kind: "samosa" },
    DemoProduct { code: "SNK005", name: "Egg Puff", category_name: "Snacks & Chaat", price_paise: 3000, buying_price_paise: 1600, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902005", icon_kind: "samosa" },
    DemoProduct { code: "SNK006", name: "Chicken Tikka Puff", category_name: "Snacks & Chaat", price_paise: 4500, buying_price_paise: 2600, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902006", icon_kind: "samosa" },
    DemoProduct { code: "SNK007", name: "Salted French Fries", category_name: "Snacks & Chaat", price_paise: 8000, buying_price_paise: 4000, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902007", icon_kind: "fries" },
    DemoProduct { code: "SNK008", name: "Peri Peri Fries", category_name: "Snacks & Chaat", price_paise: 9500, buying_price_paise: 5000, is_restockable: true, initial_stock: 3, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902008", icon_kind: "fries" },
    DemoProduct { code: "SNK009", name: "Cheese Loaded Fries", category_name: "Snacks & Chaat", price_paise: 12000, buying_price_paise: 6500, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902009", icon_kind: "fries" },
    DemoProduct { code: "SNK010", name: "Crispy Onion Rings", category_name: "Snacks & Chaat", price_paise: 7000, buying_price_paise: 3500, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902010", icon_kind: "fries" },
    DemoProduct { code: "SNK011", name: "Pani Puri (6 pcs)", category_name: "Snacks & Chaat", price_paise: 4000, buying_price_paise: 1800, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902011", icon_kind: "chaat" },
    DemoProduct { code: "SNK012", name: "Sev Puri (6 pcs)", category_name: "Snacks & Chaat", price_paise: 5000, buying_price_paise: 2400, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902012", icon_kind: "chaat" },
    DemoProduct { code: "SNK013", name: "Bhel Puri", category_name: "Snacks & Chaat", price_paise: 5000, buying_price_paise: 2200, is_restockable: true, initial_stock: 22, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902013", icon_kind: "chaat" },
    DemoProduct { code: "SNK014", name: "Dahi Puri (6 pcs)", category_name: "Snacks & Chaat", price_paise: 6000, buying_price_paise: 3000, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902014", icon_kind: "chaat" },
    DemoProduct { code: "SNK015", name: "Samosa Chaat", category_name: "Snacks & Chaat", price_paise: 6000, buying_price_paise: 3200, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902015", icon_kind: "chaat" },
    DemoProduct { code: "SNK016", name: "Aloo Tikki Chaat", category_name: "Snacks & Chaat", price_paise: 6000, buying_price_paise: 3000, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902016", icon_kind: "chaat" },
    DemoProduct { code: "SNK017", name: "Cheese Corn Nuggets (6 pcs)", category_name: "Snacks & Chaat", price_paise: 9000, buying_price_paise: 4800, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902017", icon_kind: "fries" },
    DemoProduct { code: "SNK018", name: "Crispy Veg Spring Roll (4 pcs)", category_name: "Snacks & Chaat", price_paise: 8000, buying_price_paise: 4200, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902018", icon_kind: "samosa" },

    // Category 3: Fast Food & Burgers (18 items)
    // Critical: Double Cheese Supreme Burger (2) -> Red alert
    // Low stock: Crispy Paneer Burger (5) -> Yellow alert
    DemoProduct { code: "FST001", name: "Classic Veg Burger", category_name: "Fast Food & Burgers", price_paise: 8000, buying_price_paise: 4200, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903001", icon_kind: "burger" },
    DemoProduct { code: "FST002", name: "Veg Cheese Burger", category_name: "Fast Food & Burgers", price_paise: 10000, buying_price_paise: 5500, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903002", icon_kind: "burger" },
    DemoProduct { code: "FST003", name: "Crispy Paneer Burger", category_name: "Fast Food & Burgers", price_paise: 13000, buying_price_paise: 7200, is_restockable: true, initial_stock: 5, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903003", icon_kind: "burger" },
    DemoProduct { code: "FST004", name: "Crispy Chicken Burger", category_name: "Fast Food & Burgers", price_paise: 12000, buying_price_paise: 6800, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903004", icon_kind: "burger" },
    DemoProduct { code: "FST005", name: "Double Cheese Supreme Burger", category_name: "Fast Food & Burgers", price_paise: 15000, buying_price_paise: 8500, is_restockable: true, initial_stock: 2, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903005", icon_kind: "burger" },
    DemoProduct { code: "FST006", name: "Margherita Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 14000, buying_price_paise: 7500, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903006", icon_kind: "pizza" },
    DemoProduct { code: "FST007", name: "Farmhouse Veggie Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 18000, buying_price_paise: 9500, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903007", icon_kind: "pizza" },
    DemoProduct { code: "FST008", name: "Paneer Tikka Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 21000, buying_price_paise: 11500, is_restockable: true, initial_stock: 10, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903008", icon_kind: "pizza" },
    DemoProduct { code: "FST009", name: "BBQ Chicken Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 23000, buying_price_paise: 13000, is_restockable: true, initial_stock: 10, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903009", icon_kind: "pizza" },
    DemoProduct { code: "FST010", name: "Veg Grilled Sandwich", category_name: "Fast Food & Burgers", price_paise: 7000, buying_price_paise: 3500, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903010", icon_kind: "sandwich" },
    DemoProduct { code: "FST011", name: "Cheese Corn Grilled Sandwich", category_name: "Fast Food & Burgers", price_paise: 9000, buying_price_paise: 4800, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903011", icon_kind: "sandwich" },
    DemoProduct { code: "FST012", name: "Paneer Tikka Sandwich", category_name: "Fast Food & Burgers", price_paise: 11000, buying_price_paise: 6000, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903012", icon_kind: "sandwich" },
    DemoProduct { code: "FST013", name: "Chicken Club Sandwich", category_name: "Fast Food & Burgers", price_paise: 12000, buying_price_paise: 6800, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903013", icon_kind: "sandwich" },
    DemoProduct { code: "FST014", name: "Bombay Masala Toast", category_name: "Fast Food & Burgers", price_paise: 6000, buying_price_paise: 3000, is_restockable: true, initial_stock: 22, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903014", icon_kind: "sandwich" },
    DemoProduct { code: "FST015", name: "Veg Hakka Noodles", category_name: "Fast Food & Burgers", price_paise: 11000, buying_price_paise: 5500, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903015", icon_kind: "noodles" },
    DemoProduct { code: "FST016", name: "Schezwan Veg Noodles", category_name: "Fast Food & Burgers", price_paise: 12000, buying_price_paise: 6200, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903016", icon_kind: "noodles" },
    DemoProduct { code: "FST017", name: "Veg Fried Rice", category_name: "Fast Food & Burgers", price_paise: 11000, buying_price_paise: 5500, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903017", icon_kind: "noodles" },
    DemoProduct { code: "FST018", name: "Creamy White Sauce Pasta", category_name: "Fast Food & Burgers", price_paise: 14000, buying_price_paise: 7500, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903018", icon_kind: "noodles" },

    // Category 4: Ice Cream & Desserts (16 items)
    // Critical: Sizzling Brownie (1) -> Red alert
    // Low stock: Warm Gulab Jamun (4) -> Yellow alert
    DemoProduct { code: "ICM001", name: "Vanilla Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 4000, buying_price_paise: 1800, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904001", icon_kind: "icecream" },
    DemoProduct { code: "ICM002", name: "Chocolate Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 5000, buying_price_paise: 2400, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904002", icon_kind: "icecream" },
    DemoProduct { code: "ICM003", name: "Strawberry Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 4500, buying_price_paise: 2200, is_restockable: true, initial_stock: 22, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904003", icon_kind: "icecream" },
    DemoProduct { code: "ICM004", name: "Butterscotch Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 5000, buying_price_paise: 2500, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904004", icon_kind: "icecream" },
    DemoProduct { code: "ICM005", name: "Pista Kulfi Stick", category_name: "Ice Cream & Desserts", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904005", icon_kind: "dessert" },
    DemoProduct { code: "ICM006", name: "Malai Kulfi Stick", category_name: "Ice Cream & Desserts", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 24, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904006", icon_kind: "dessert" },
    DemoProduct { code: "ICM007", name: "Hot Fudge Chocolate Sundae", category_name: "Ice Cream & Desserts", price_paise: 11000, buying_price_paise: 5800, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904007", icon_kind: "icecream" },
    DemoProduct { code: "ICM008", name: "Fresh Fruit Salad with Ice Cream", category_name: "Ice Cream & Desserts", price_paise: 10000, buying_price_paise: 5200, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904008", icon_kind: "dessert" },
    DemoProduct { code: "ICM009", name: "Sizzling Brownie with Ice Cream", category_name: "Ice Cream & Desserts", price_paise: 14000, buying_price_paise: 7500, is_restockable: true, initial_stock: 1, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904009", icon_kind: "dessert" },
    DemoProduct { code: "ICM010", name: "Royal Falooda", category_name: "Ice Cream & Desserts", price_paise: 11000, buying_price_paise: 5800, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904010", icon_kind: "dessert" },
    DemoProduct { code: "ICM011", name: "Kesar Pista Falooda", category_name: "Ice Cream & Desserts", price_paise: 12000, buying_price_paise: 6400, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904011", icon_kind: "dessert" },
    DemoProduct { code: "ICM012", name: "Warm Gulab Jamun (2 pcs)", category_name: "Ice Cream & Desserts", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 4, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904012", icon_kind: "dessert" },
    DemoProduct { code: "ICM013", name: "Bengali Rasgulla (2 pcs)", category_name: "Ice Cream & Desserts", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904013", icon_kind: "dessert" },
    DemoProduct { code: "ICM014", name: "Kesar Rasmalai (2 pcs)", category_name: "Ice Cream & Desserts", price_paise: 6000, buying_price_paise: 3200, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904014", icon_kind: "dessert" },
    DemoProduct { code: "ICM015", name: "Gajar Ka Halwa (100g)", category_name: "Ice Cream & Desserts", price_paise: 6000, buying_price_paise: 3000, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904015", icon_kind: "dessert" },
    DemoProduct { code: "ICM016", name: "Mango Dolly Ice Bar", category_name: "Ice Cream & Desserts", price_paise: 3000, buying_price_paise: 1500, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904016", icon_kind: "dessert" },

    // Category 5: Bakery & Pastries (14 items)
    // Low stock: Red Velvet Pastry (4) -> Yellow alert
    DemoProduct { code: "BAK001", name: "Black Forest Pastry", category_name: "Bakery & Pastries", price_paise: 6000, buying_price_paise: 3200, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905001", icon_kind: "pastry" },
    DemoProduct { code: "BAK002", name: "Chocolate Truffle Pastry", category_name: "Bakery & Pastries", price_paise: 7000, buying_price_paise: 3800, is_restockable: true, initial_stock: 14, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905002", icon_kind: "pastry" },
    DemoProduct { code: "BAK003", name: "Red Velvet Pastry", category_name: "Bakery & Pastries", price_paise: 7500, buying_price_paise: 4200, is_restockable: true, initial_stock: 4, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905003", icon_kind: "pastry" },
    DemoProduct { code: "BAK004", name: "Fresh Pineapple Pastry", category_name: "Bakery & Pastries", price_paise: 5000, buying_price_paise: 2700, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905004", icon_kind: "pastry" },
    DemoProduct { code: "BAK005", name: "Butterscotch Crunch Pastry", category_name: "Bakery & Pastries", price_paise: 5500, buying_price_paise: 3000, is_restockable: true, initial_stock: 12, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905005", icon_kind: "pastry" },
    DemoProduct { code: "BAK006", name: "Chocolate Glazed Doughnut", category_name: "Bakery & Pastries", price_paise: 5000, buying_price_paise: 2500, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905006", icon_kind: "doughnut" },
    DemoProduct { code: "BAK007", name: "Cinnamon Sugar Doughnut", category_name: "Bakery & Pastries", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905007", icon_kind: "doughnut" },
    DemoProduct { code: "BAK008", name: "Belgian Chocolate Cupcake", category_name: "Bakery & Pastries", price_paise: 3500, buying_price_paise: 1800, is_restockable: true, initial_stock: 22, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905008", icon_kind: "pastry" },
    DemoProduct { code: "BAK009", name: "Vanilla Butter Cupcake", category_name: "Bakery & Pastries", price_paise: 3000, buying_price_paise: 1500, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905009", icon_kind: "pastry" },
    DemoProduct { code: "BAK010", name: "Walnut Fudge Brownie", category_name: "Bakery & Pastries", price_paise: 6500, buying_price_paise: 3500, is_restockable: true, initial_stock: 16, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905010", icon_kind: "pastry" },
    DemoProduct { code: "BAK011", name: "Choco Chip Cookies (200g)", category_name: "Bakery & Pastries", price_paise: 6000, buying_price_paise: 3200, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8905011", icon_kind: "pastry" },
    DemoProduct { code: "BAK012", name: "Butter Cashew Cookies (200g)", category_name: "Bakery & Pastries", price_paise: 7000, buying_price_paise: 3800, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8905012", icon_kind: "pastry" },
    DemoProduct { code: "BAK013", name: "Crispy Garlic Breadsticks", category_name: "Bakery & Pastries", price_paise: 6000, buying_price_paise: 3000, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905013", icon_kind: "pastry" },
    DemoProduct { code: "BAK014", name: "Cheese Stuffed Garlic Bread", category_name: "Bakery & Pastries", price_paise: 9000, buying_price_paise: 4800, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905014", icon_kind: "pastry" },

    // Category 6: Tea & Coffee (12 items)
    // Critical: Single Shot Espresso (2) -> Red alert
    // Low stock: Adrak Elaichi Chai (3) -> Yellow alert
    DemoProduct { code: "HOT001", name: "Masala Chai", category_name: "Tea & Coffee", price_paise: 2000, buying_price_paise: 800, is_restockable: true, initial_stock: 50, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906001", icon_kind: "tea" },
    DemoProduct { code: "HOT002", name: "Adrak Elaichi Chai", category_name: "Tea & Coffee", price_paise: 2500, buying_price_paise: 1000, is_restockable: true, initial_stock: 3, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906002", icon_kind: "tea" },
    DemoProduct { code: "HOT003", name: "South Indian Filter Coffee", category_name: "Tea & Coffee", price_paise: 3000, buying_price_paise: 1300, is_restockable: true, initial_stock: 45, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906003", icon_kind: "coffee" },
    DemoProduct { code: "HOT004", name: "Hot Chocolate with Marshmallows", category_name: "Tea & Coffee", price_paise: 6000, buying_price_paise: 3200, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906004", icon_kind: "coffee" },
    DemoProduct { code: "HOT005", name: "Single Shot Espresso", category_name: "Tea & Coffee", price_paise: 5000, buying_price_paise: 2200, is_restockable: true, initial_stock: 2, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906005", icon_kind: "coffee" },
    DemoProduct { code: "HOT006", name: "Creamy Cappuccino", category_name: "Tea & Coffee", price_paise: 7000, buying_price_paise: 3400, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906006", icon_kind: "coffee" },
    DemoProduct { code: "HOT007", name: "Cafe Latte", category_name: "Tea & Coffee", price_paise: 7500, buying_price_paise: 3800, is_restockable: true, initial_stock: 22, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906007", icon_kind: "coffee" },
    DemoProduct { code: "HOT008", name: "Cold Coffee with Vanilla Scoop", category_name: "Tea & Coffee", price_paise: 9000, buying_price_paise: 4800, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906008", icon_kind: "coffee" },
    DemoProduct { code: "HOT009", name: "Iced Cafe Mocha", category_name: "Tea & Coffee", price_paise: 10000, buying_price_paise: 5400, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906009", icon_kind: "coffee" },
    DemoProduct { code: "HOT010", name: "Organic Honey Green Tea", category_name: "Tea & Coffee", price_paise: 3000, buying_price_paise: 1200, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906010", icon_kind: "tea" },
    DemoProduct { code: "HOT011", name: "Hot Badam Drink", category_name: "Tea & Coffee", price_paise: 4000, buying_price_paise: 2000, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906011", icon_kind: "tea" },
    DemoProduct { code: "HOT012", name: "Chilled Pista Milk", category_name: "Tea & Coffee", price_paise: 4500, buying_price_paise: 2400, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906012", icon_kind: "tea" },

    // Category 7: Meals & Combos (10 items)
    // Low stock: Paneer Masala Dosa (4) -> Yellow alert
    DemoProduct { code: "MEL001", name: "Special Mini Tiffin Combo", category_name: "Meals & Combos", price_paise: 11000, buying_price_paise: 5500, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907001", icon_kind: "thali" },
    DemoProduct { code: "MEL002", name: "Crispy Ghee Roast Dosa", category_name: "Meals & Combos", price_paise: 7000, buying_price_paise: 3200, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907002", icon_kind: "dosa" },
    DemoProduct { code: "MEL003", name: "Classic Masala Dosa", category_name: "Meals & Combos", price_paise: 6000, buying_price_paise: 2800, is_restockable: true, initial_stock: 28, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907003", icon_kind: "dosa" },
    DemoProduct { code: "MEL004", name: "Paneer Masala Dosa", category_name: "Meals & Combos", price_paise: 9000, buying_price_paise: 4800, is_restockable: true, initial_stock: 4, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907004", icon_kind: "dosa" },
    DemoProduct { code: "MEL005", name: "Idli (2) + Medu Vada (1) Combo", category_name: "Meals & Combos", price_paise: 5000, buying_price_paise: 2200, is_restockable: true, initial_stock: 35, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907005", icon_kind: "thali" },
    DemoProduct { code: "MEL006", name: "Hot Poori Masala (3 pcs)", category_name: "Meals & Combos", price_paise: 6000, buying_price_paise: 2800, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907006", icon_kind: "thali" },
    DemoProduct { code: "MEL007", name: "Executive South Indian Thali", category_name: "Meals & Combos", price_paise: 14000, buying_price_paise: 7200, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907007", icon_kind: "thali" },
    DemoProduct { code: "MEL008", name: "Tempered Curd Rice with Pickle", category_name: "Meals & Combos", price_paise: 5000, buying_price_paise: 2200, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907008", icon_kind: "thali" },
    DemoProduct { code: "MEL009", name: "Burger + Fries + Drink Combo", category_name: "Meals & Combos", price_paise: 16000, buying_price_paise: 8200, is_restockable: true, initial_stock: 18, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907009", icon_kind: "thali" },
    DemoProduct { code: "MEL010", name: "Pizza + Garlic Bread + Drink Combo", category_name: "Meals & Combos", price_paise: 24000, buying_price_paise: 12500, is_restockable: true, initial_stock: 15, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907010", icon_kind: "thali" },

    // Category 8: Packaged Goods (10 items)
    // Critical: Red Bull 250ml (1) -> Red alert
    // Low stock: Mineral Water 500ml (5) -> Yellow alert
    DemoProduct { code: "PKG001", name: "Packaged Mineral Water 1L", category_name: "Packaged Goods", price_paise: 2000, buying_price_paise: 1100, is_restockable: true, initial_stock: 50, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908001", icon_kind: "packaged" },
    DemoProduct { code: "PKG002", name: "Mineral Water 500ml", category_name: "Packaged Goods", price_paise: 1000, buying_price_paise: 550, is_restockable: true, initial_stock: 5, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908002", icon_kind: "packaged" },
    DemoProduct { code: "PKG003", name: "Classic Salted Potato Chips 50g", category_name: "Packaged Goods", price_paise: 2000, buying_price_paise: 1300, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8908003", icon_kind: "packaged" },
    DemoProduct { code: "PKG004", name: "Spicy Masala Potato Chips 50g", category_name: "Packaged Goods", price_paise: 2000, buying_price_paise: 1300, is_restockable: true, initial_stock: 28, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8908004", icon_kind: "packaged" },
    DemoProduct { code: "PKG005", name: "Cadbury Dairy Milk Silk Chocolate", category_name: "Packaged Goods", price_paise: 8000, buying_price_paise: 5600, is_restockable: true, initial_stock: 20, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908005", icon_kind: "packaged" },
    DemoProduct { code: "PKG006", name: "KitKat 4-Finger Wafer Chocolate", category_name: "Packaged Goods", price_paise: 4000, buying_price_paise: 2800, is_restockable: true, initial_stock: 25, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908006", icon_kind: "packaged" },
    DemoProduct { code: "PKG007", name: "Red Bull Energy Drink 250ml", category_name: "Packaged Goods", price_paise: 12500, buying_price_paise: 8800, is_restockable: true, initial_stock: 1, gst_enabled: true, gst_percentage_x100: 2800, barcode: "8908007", icon_kind: "packaged" },
    DemoProduct { code: "PKG008", name: "Coca Cola / Pepsi Can 300ml", category_name: "Packaged Goods", price_paise: 4000, buying_price_paise: 2600, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 2800, barcode: "8908008", icon_kind: "packaged" },
    DemoProduct { code: "PKG009", name: "Ice Mint Refreshment Chews (Pack)", category_name: "Packaged Goods", price_paise: 1500, buying_price_paise: 900, is_restockable: true, initial_stock: 40, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908009", icon_kind: "packaged" },
    DemoProduct { code: "PKG010", name: "Sanitizing Wet Wipes (Pack of 10)", category_name: "Packaged Goods", price_paise: 3000, buying_price_paise: 1600, is_restockable: true, initial_stock: 30, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908010", icon_kind: "packaged" },
];

/// Merges legacy empty categories ("Juice", "Snacks", "Fast Food", "Ice Cream", "Others")
/// into the canonical categories, removes empty duplicate categories, and re-sequences sort_order cleanly.
pub fn clean_and_align_categories(conn: &Connection) {
    let merges = [
        ("Juice", "Juice & Beverages"),
        ("Snacks", "Snacks & Chaat"),
        ("Fast Food", "Fast Food & Burgers"),
        ("Ice Cream", "Ice Cream & Desserts"),
    ];

    for (old_name, new_name) in merges {
        let old_id: Option<i64> = conn.query_row("SELECT id FROM categories WHERE name = ?1", [old_name], |r| r.get(0)).ok();
        let new_id: Option<i64> = conn.query_row("SELECT id FROM categories WHERE name = ?1", [new_name], |r| r.get(0)).ok();
        if let (Some(oid), Some(nid)) = (old_id, new_id) {
            let _ = conn.execute("UPDATE products SET category_id = ?1 WHERE category_id = ?2", [nid, oid]);
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM products WHERE category_id = ?1", [oid], |r| r.get(0)).unwrap_or(0);
            if count == 0 {
                let _ = conn.execute("DELETE FROM categories WHERE id = ?1", [oid]);
            }
        } else if let Some(oid) = old_id {
            let _ = conn.execute("UPDATE categories SET name = ?1 WHERE id = ?2", rusqlite::params![new_name, oid]);
        }
    }

    // Delete empty "Others" if canonical categories exist
    if let Ok(oid) = conn.query_row("SELECT id FROM categories WHERE name = 'Others'", [], |r| r.get::<_, i64>(0)) {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM products WHERE category_id = ?1", [oid], |r| r.get(0)).unwrap_or(0);
        let total_cats: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0)).unwrap_or(0);
        if count == 0 && total_cats > 1 {
            let _ = conn.execute("DELETE FROM categories WHERE id = ?1", [oid]);
        }
    }

    // Resequence sort_order: 1, 2, 3, 4, 5, 6, 7, 8...
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM categories ORDER BY sort_order ASC, id ASC") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, i64>(0)) {
            let ids: Vec<i64> = rows.filter_map(|r| r.ok()).collect();
            for (idx, cat_id) in ids.iter().enumerate() {
                let _ = conn.execute("UPDATE categories SET sort_order = ?1 WHERE id = ?2", rusqlite::params![idx + 1, cat_id]);
            }
        }
    }
}

/// Seeds all demo categories and 116 demo products with rich images, buying prices, restockable flags, and inventory stock
pub fn seed_demo_data(conn: &Connection) -> Result<usize, String> {
    // 0. Clean and align categories first to eliminate ghost/duplicate categories
    clean_and_align_categories(conn);

    // 1. Ensure all categories exist with their SVG badge
    for (name, sort_order, _kind) in DEMO_CATEGORIES {
        let cat_img = generate_category_svg(name);
        let _ = conn.execute(
            "INSERT OR IGNORE INTO categories (name, sort_order, image_path, is_active) VALUES (?1, ?2, ?3, 1)",
            params![name, sort_order, cat_img],
        );
        let _ = conn.execute(
            "UPDATE categories SET sort_order = ?1, image_path = ?2, is_active = 1 WHERE name = ?3",
            params![sort_order, cat_img, name],
        );
    }

    // 2. Fetch category map (name -> id)
    let mut stmt = conn.prepare("SELECT id, name FROM categories")
        .map_err(|e| format!("Prepare error: {}", e))?;
    let cat_rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, i64>(0)?))
    }).map_err(|e| format!("Query error: {}", e))?;

    let mut cat_map = std::collections::HashMap::new();
    for r in cat_rows.flatten() {
        cat_map.insert(r.0, r.1);
    }

    // 3. Insert each demo product with image, buying rate, restockable flag and stock
    let mut inserted_count = 0;
    for p in DEMO_PRODUCTS {
        let cat_id = cat_map.get(p.category_name).cloned().unwrap_or(1);
        let image_data = generate_product_svg(p.name, p.category_name, p.icon_kind);

        let res = conn.execute(
            "INSERT OR REPLACE INTO products (
                product_code, name, category_id, image_path, selling_price_paise, buying_price_paise,
                is_restockable, gst_enabled, gst_percentage_x100, barcode, is_active
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)",
            params![
                p.code,
                p.name,
                cat_id,
                image_data,
                p.price_paise,
                p.buying_price_paise,
                if p.is_restockable { 1 } else { 0 },
                if p.gst_enabled { 1 } else { 0 },
                p.gst_percentage_x100,
                p.barcode,
            ],
        );

        if res.is_ok() {
            inserted_count += 1;

            // Get product ID
            if let Ok(prod_id) = conn.query_row(
                "SELECT id FROM products WHERE product_code = ?1",
                params![p.code],
                |r| r.get::<_, i64>(0),
            ) {
                // Initialize inventory stock
                let _ = conn.execute(
                    "INSERT INTO inventory (product_id, current_stock, low_stock_threshold, updated_at)
                     VALUES (?1, ?2, 5, datetime('now'))
                     ON CONFLICT(product_id) DO UPDATE SET current_stock = ?2, low_stock_threshold = 5, updated_at = datetime('now')",
                    params![prod_id, p.initial_stock],
                );

                // Record initial stock movement
                let _ = conn.execute(
                    "INSERT INTO stock_movements (product_id, quantity_change, movement_type, notes)
                     VALUES (?1, ?2, 'opening', 'Initial demo stock setup')",
                    params![prod_id, p.initial_stock],
                );
            }
        }
    }

    Ok(inserted_count)
}

/// Clears only demo products from the database if requested
pub fn clear_demo_data(conn: &Connection) -> Result<usize, String> {
    let count = conn.execute(
        "DELETE FROM products WHERE product_code LIKE 'JUC%' OR product_code LIKE 'SNK%' OR product_code LIKE 'FST%' OR product_code LIKE 'ICM%' OR product_code LIKE 'BAK%' OR product_code LIKE 'HOT%' OR product_code LIKE 'MEL%' OR product_code LIKE 'PKG%'",
        [],
    ).map_err(|e| e.to_string())?;
    Ok(count)
}
