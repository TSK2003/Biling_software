use serde::{Deserialize, Serialize};

// ========== USER ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub is_active: bool,
    pub max_discount_pct: i32,
    pub plain_password: Option<String>,
    pub permissions: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub role: String,
    pub permissions: Option<Vec<String>>,
    pub max_discount_pct: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub id: i64,
    pub display_name: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
    pub max_discount_pct: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub user: User,
    pub session_token: String,
}

// ========== CATEGORY ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub image_path: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryRequest {
    pub id: i64,
    pub name: Option<String>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}

// ========== PRODUCT ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: i64,
    pub product_code: String,
    pub name: String,
    pub category_id: i64,
    pub category_name: Option<String>,
    pub image_path: Option<String>,
    pub selling_price_paise: i64,
    pub gst_enabled: bool,
    pub gst_percentage_x100: i32,
    pub barcode: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateProductRequest {
    pub name: String,
    pub category_id: i64,
    pub selling_price_paise: i64,
    pub gst_enabled: Option<bool>,
    pub gst_percentage_x100: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProductRequest {
    pub id: i64,
    pub name: Option<String>,
    pub category_id: Option<i64>,
    pub selling_price_paise: Option<i64>,
    pub gst_enabled: Option<bool>,
    pub gst_percentage_x100: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ProductSearchRequest {
    pub query: Option<String>,
    pub category_id: Option<i64>,
    pub active_only: Option<bool>,
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

// ========== BILLING ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingProduct {
    pub id: i64,
    pub product_code: String,
    pub name: String,
    pub category_id: i64,
    pub category_name: String,
    pub image_path: Option<String>,
    pub selling_price_paise: i64,
    pub gst_enabled: bool,
    pub gst_percentage_x100: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CartItem {
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub category_name: String,
    pub unit_price_paise: i64,
    pub quantity: i32,
    pub gst_enabled: bool,
    pub gst_percentage_x100: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftDiscount {
    pub discount_type: String,
    pub discount_value: f64,
}

#[derive(Debug, Deserialize)]
pub struct SaveDraftRequest {
    pub user_id: i64,
    pub cart_items: Vec<CartItem>,
    pub discount: Option<DraftDiscount>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DraftBill {
    pub id: i64,
    pub user_id: i64,
    pub cart_items: Vec<CartItem>,
    pub discount: Option<DraftDiscount>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CompleteBillRequest {
    pub user_id: i64,
    pub items: Vec<CartItem>,
    pub discount_type: String,
    pub discount_value: f64,
    pub payment_method: String,
    pub cash_amount_paise: Option<i64>,
    pub card_amount_paise: Option<i64>,
    pub upi_amount_paise: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteBillResponse {
    pub bill_id: i64,
    pub bill_uuid: String,
    pub bill_number: i32,
    pub business_date: String,
    pub bill_time: String,
    pub grand_total_paise: i64,
    pub change_due_paise: i64,
}

// ========== BILL ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bill {
    pub id: i64,
    pub bill_uuid: String,
    pub bill_number: i32,
    pub business_date: String,
    pub bill_time: String,
    pub user_id: i64,
    pub user_name: Option<String>,
    pub subtotal_paise: i64,
    pub discount_type: String,
    pub discount_value_x100: i32,
    pub discount_amount_paise: i64,
    pub gst_total_paise: i64,
    pub grand_total_paise: i64,
    pub status: String,
    pub void_reason: Option<String>,
    pub payment_method: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillItem {
    pub id: i64,
    pub bill_id: i64,
    pub product_id: Option<i64>,
    pub product_code_snapshot: String,
    pub product_name_snapshot: String,
    pub category_name_snapshot: String,
    pub unit_price_paise: i64,
    pub quantity: i32,
    pub gst_enabled: bool,
    pub gst_percentage_x100: i32,
    pub gst_amount_paise: i64,
    pub line_total_paise: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BillDetail {
    pub bill: Bill,
    pub items: Vec<BillItem>,
    pub payment: Payment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub id: i64,
    pub bill_id: i64,
    pub payment_method: String,
    pub total_amount_paise: i64,
    pub cash_amount_paise: i64,
    pub card_amount_paise: i64,
    pub upi_amount_paise: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct BillsFilterRequest {
    pub business_date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub status: Option<String>,
    pub user_id: Option<i64>,
    pub search: Option<String>,
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
}

// ========== DASHBOARD ==========

#[derive(Debug, Clone, Serialize)]
pub struct DashboardStats {
    pub total_sales_paise: i64,
    pub total_bills: i64,
    pub total_items_sold: i64,
    pub cash_sales_paise: i64,
    pub upi_sales_paise: i64,
    pub card_sales_paise: i64,
    pub total_discount_paise: i64,
    pub total_gst_paise: i64,
    pub avg_bill_paise: i64,
}

#[derive(Debug, Deserialize)]
pub struct DashboardRequest {
    pub date_from: String,
    pub date_to: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SalesTrendItem {
    pub date: String,
    pub total_sales_paise: i64,
    pub bill_count: i64,
}

// ========== SETTINGS ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

// ========== AUDIT LOG ==========

#[derive(Debug, Clone, Serialize)]
pub struct AuditLog {
    pub id: i64,
    pub user_id: Option<i64>,
    pub user_name: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<i64>,
    pub details_json: Option<String>,
    pub created_at: String,
}

// ========== LICENSE ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub license_id: String,
    pub shop_name: String,
    pub license_type: String,
    pub max_activations: i32,
    pub features: Vec<String>,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub issuer: String,
    pub schema_version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivationRecord {
    pub license_id: String,
    pub shop_name: String,
    pub device_id_hash: String,
    pub license_type: String,
    pub features: Vec<String>,
    pub activated_at: String,
    pub expires_at: Option<String>,
    pub app_version: String,
    pub schema_version: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    pub state: String,
    pub license_id: Option<String>,
    pub shop_name: Option<String>,
    pub license_type: Option<String>,
    pub activated_at: Option<String>,
    pub expires_at: Option<String>,
    pub app_version: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct USBKeyInfo {
    pub drive_letter: String,
    pub license: LicensePayload,
    pub is_valid: bool,
    pub message: String,
}

// ========== BACKUP ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub backup_version: String,
    pub app_version: String,
    pub schema_version: i32,
    pub backup_date: String,
    pub shop_id: String,
    pub shop_name: String,
    pub product_count: i64,
    pub category_count: i64,
    pub bill_count: i64,
    pub image_count: i64,
    pub report_count: i64,
    pub checksum_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub id: i64,
    pub backup_type: String,
    pub backup_path: String,
    pub manifest_json: Option<String>,
    pub size_bytes: i64,
    pub created_at: String,
}

// ========== IMPORT ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub file_name: String,
    pub total_rows: usize,
    pub valid_bills_count: usize,
    pub duplicate_bills_count: usize,
    pub new_bills_count: usize,
    pub total_sales_paise: i64,
    pub business_dates: Vec<String>,
    pub warnings: Vec<String>,
}

// ========== NETWORK & DEVICES ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: i64,
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub ip_address: Option<String>,
    pub is_approved: bool,
    pub is_active: bool,
    pub api_token: String,
    pub last_seen_at: String,
    pub app_version: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub mode: String, // "host" | "client"
    pub shop_id: String,
    pub shop_name: String,
    pub host_ip: String,
    pub host_port: u16,
    pub connection_code: String,
    pub is_server_running: bool,
    pub device_id: String,
    pub device_name: String,
    pub is_approved: bool,
    pub client_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterDeviceRequest {
    pub device_id: String,
    pub device_name: String,
    pub app_version: String,
    pub connection_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterDeviceResponse {
    pub success: bool,
    pub is_approved: bool,
    pub shop_id: String,
    pub shop_name: String,
    pub api_token: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredHost {
    pub shop_id: String,
    pub shop_name: String,
    pub host_ip: String,
    pub host_port: u16,
    pub app_version: String,
}

// ========== STOCK & INVENTORY ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockMovement {
    pub id: i64,
    pub product_id: i64,
    pub product_name: Option<String>,
    pub quantity_change: i32,
    pub movement_type: String, // "sale", "purchase", "adjustment", "return", "opening"
    pub reference_id: Option<i64>,
    pub user_id: Option<i64>,
    pub user_name: Option<String>,
    pub device_id: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryItem {
    pub product_id: i64,
    pub product_code: String,
    pub product_name: String,
    pub category_name: Option<String>,
    pub current_stock: i32,
    pub low_stock_threshold: i32,
    pub updated_at: String,
}
