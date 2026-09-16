// User Types
export type ScreenPermission =
  | 'billing'
  | 'bills'
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'reports'
  | 'backup'
  | 'users'
  | 'settings';

export type UserRole = 'admin' | 'manager' | 'inventory_staff' | 'cashier' | 'staff' | 'custom';

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: UserRole | string;
  is_active: boolean;
  max_discount_pct: number;
  plain_password?: string;
  permissions: ScreenPermission[] | string[];
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  user: User;
  session_token: string;
}

// Category Types
export interface Category {
  id: number;
  name: string;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Product Types
export interface Product {
  id: number;
  product_code: string;
  name: string;
  category_id: number;
  category_name?: string;
  image_path: string | null;
  selling_price_paise: number;
  gst_enabled: boolean;
  gst_percentage_x100: number;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingProduct {
  id: number;
  product_code: string;
  name: string;
  category_id: number;
  category_name: string;
  image_path: string | null;
  selling_price_paise: number;
  gst_enabled: boolean;
  gst_percentage_x100: number;
}

// Cart Types
export interface CartItem {
  product_id: number;
  product_code: string;
  product_name: string;
  category_name: string;
  image_path?: string | null;
  unit_price_paise: number;
  quantity: number;
  gst_enabled: boolean;
  gst_percentage_x100: number;
}

export interface DraftDiscount {
  discount_type: 'none' | 'percentage' | 'fixed';
  discount_value: number;
}

export interface DraftBill {
  id: number;
  user_id: number;
  cart_items: CartItem[];
  discount?: DraftDiscount;
  created_at: string;
  updated_at: string;
}

// Bill Types
export interface Bill {
  id: number;
  bill_uuid: string;
  bill_number: number;
  business_date: string;
  bill_time: string;
  user_id: number;
  user_name?: string;
  subtotal_paise: number;
  discount_type: string;
  discount_value_x100: number;
  discount_amount_paise: number;
  gst_total_paise: number;
  grand_total_paise: number;
  status: 'completed' | 'voided' | 'cancelled' | 'returned';
  void_reason?: string;
  payment_method?: string;
  created_at: string;
}

export interface BillItem {
  id: number;
  bill_id: number;
  product_id: number | null;
  product_code_snapshot: string;
  product_name_snapshot: string;
  category_name_snapshot: string;
  unit_price_paise: number;
  quantity: number;
  gst_enabled: boolean;
  gst_percentage_x100: number;
  gst_amount_paise: number;
  line_total_paise: number;
}

export interface Payment {
  id: number;
  bill_id: number;
  payment_method: 'cash' | 'card' | 'upi' | 'upi_cash';
  total_amount_paise: number;
  cash_amount_paise: number;
  card_amount_paise: number;
  upi_amount_paise: number;
  created_at: string;
}

export interface BillDetail {
  bill: Bill;
  items: BillItem[];
  payment: Payment;
}

export interface CompleteBillResponse {
  bill_id: number;
  bill_number: number;
  business_date: string;
  grand_total_paise: number;
}

// Dashboard Types
export interface DashboardStats {
  total_sales_paise: number;
  total_bills: number;
  total_items_sold: number;
  cash_sales_paise: number;
  upi_sales_paise: number;
  card_sales_paise: number;
  total_discount_paise: number;
  total_gst_paise: number;
  avg_bill_paise: number;
}

export interface SalesTrendItem {
  date: string;
  total_sales_paise: number;
  bill_count: number;
}

// License Types
export type LicenseState =
  | 'ACTIVE'
  | 'NOT_ACTIVATED'
  | 'ACTIVATION_REQUIRED'
  | 'DEVICE_MISMATCH'
  | 'INVALID_LICENSE'
  | 'TAMPER_DETECTED'
  | 'LICENSE_EXPIRED';

export interface LicenseStatus {
  state: LicenseState;
  license_id?: string;
  shop_name?: string;
  license_type?: string;
  activated_at?: string;
  expires_at?: string;
  app_version?: string;
  message?: string;
}

export interface USBKeyInfo {
  drive_letter: string;
  license: {
    license_id: string;
    shop_name: string;
    license_type: string;
    max_activations: number;
    features: string[];
    issued_at: string;
    expires_at?: string;
    issuer: string;
    schema_version: number;
  };
  is_valid: boolean;
  message: string;
}

// Setting Types
export interface Setting {
  key: string;
  value: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Network & Multi-Computer Types
export interface Device {
  id: number;
  device_id: string;
  device_name: string;
  device_type: 'host' | 'client';
  ip_address?: string;
  is_approved: boolean;
  is_active: boolean;
  api_token: string;
  last_seen_at: string;
  app_version: string;
  created_at: string;
  updated_at: string;
}

export interface NetworkInfo {
  mode: 'host' | 'client';
  shop_id: string;
  shop_name: string;
  host_ip: string;
  host_port: number;
  connection_code: string;
  is_server_running: boolean;
  device_id: string;
  device_name: string;
  is_approved: boolean;
  client_count: number;
}

export interface DiscoveredHost {
  shop_id: string;
  shop_name: string;
  host_ip: string;
  host_port: number;
  app_version: string;
}

export interface InventoryItem {
  product_id: number;
  product_code: string;
  product_name: string;
  category_name?: string;
  current_stock: number;
  low_stock_threshold: number;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name?: string;
  quantity_change: number;
  movement_type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'opening';
  reference_id?: number;
  user_id?: number;
  user_name?: string;
  device_id?: string;
  notes?: string;
  created_at: string;
}

// Return/Refund Types
export interface ReturnBillItem {
  bill_item_id: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
}

export interface ReturnBillRequest {
  billId: number;
  userId: number;
  reason: string;
  items: ReturnBillItem[];
  refundAmountPaise: number;
}
