import { invoke } from '@tauri-apps/api/core';
import type {
  User,
  LoginResponse,
  Category,
  Product,
  BillingProduct,
  CartItem,
  DraftBill,
  CompleteBillResponse,
  Bill,
  BillDetail,
  DashboardStats,
  SalesTrendItem,
  Setting,
  LicenseStatus,
  USBKeyInfo,
  PaginatedResponse,
  NetworkInfo,
  Device,
  DiscoveredHost,
  InventoryItem,
  StockMovement,
  ReturnBillItem,
} from '../types';

// ============================================================
// Client-Mode Helpers
// ============================================================

const CLIENT_CONFIG_KEY = 'aescion_client_config';

interface ClientConfig {
  mode: 'host' | 'client';
  hostIp: string;
  hostPort: number;
  apiToken?: string;
  deviceId?: string;
  shopName?: string;
}

/** Get persisted client network config from localStorage */
export function getClientConfig(): ClientConfig | null {
  try {
    const raw = localStorage.getItem(CLIENT_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as ClientConfig;
    if (cfg.mode === 'client' && cfg.hostIp) return cfg;
    return null;
  } catch {
    return null;
  }
}

/** Save client network config to localStorage */
export function saveClientConfig(config: ClientConfig) {
  localStorage.setItem(CLIENT_CONFIG_KEY, JSON.stringify(config));
}

/** Clear client config (switch back to host mode) */
export function clearClientConfig() {
  localStorage.removeItem(CLIENT_CONFIG_KEY);
}

/** Check if currently running in client mode */
export function isClientMode(): boolean {
  const cfg = getClientConfig();
  return cfg !== null && cfg.mode === 'client';
}

// ============================================================
// Unified API — Clean Tauri IPC Commands
// Backend Rust automatically routes host vs client transparently!
// ============================================================

export const api = {
  // Auth
  login: (username: string, password: string) =>
    invoke<LoginResponse>('login', { username, password }),
  logout: () => invoke<void>('logout'),
  getCurrentUser: () => invoke<User | null>('get_current_user'),
  changePassword: (userId: number, oldPassword: string, newPassword: string) =>
    invoke<void>('change_password', { userId, oldPassword, newPassword }),

  // Categories
  getCategories: (activeOnly?: boolean) =>
    invoke<Category[]>('get_categories', { activeOnly }),
  createCategory: (name: string, sortOrder?: number) =>
    invoke<Category>('create_category', { name, sortOrder }),
  updateCategory: (id: number, name?: string, sortOrder?: number, isActive?: boolean) =>
    invoke<Category>('update_category', { id, name, sortOrder, isActive }),
  deleteCategory: (id: number) =>
    invoke<void>('delete_category', { id }),

  // Products
  getProducts: (categoryId?: number, activeOnly?: boolean, page?: number, pageSize?: number) =>
    invoke<PaginatedResponse<Product>>('get_products', { categoryId, activeOnly, page, pageSize }),
  getProduct: (id: number) =>
    invoke<Product>('get_product', { id }),
  createProduct: (
    name: string,
    categoryId: number,
    sellingPricePaise: number,
    gstEnabled?: boolean,
    gstPercentageX100?: number,
    imagePath?: string
  ) =>
    invoke<Product>('create_product', {
      name,
      categoryId,
      sellingPricePaise,
      gstEnabled,
      gstPercentageX100,
      imagePath,
    }),
  updateProduct: (
    id: number,
    name?: string,
    categoryId?: number,
    sellingPricePaise?: number,
    gstEnabled?: boolean,
    gstPercentageX100?: number,
    isActive?: boolean,
    imagePath?: string
  ) =>
    invoke<Product>('update_product', {
      id,
      name,
      categoryId,
      sellingPricePaise,
      gstEnabled,
      gstPercentageX100,
      isActive,
      imagePath,
    }),
  deleteProduct: (id: number) =>
    invoke<void>('delete_product', { id }),
  searchProducts: (query: string, categoryId?: number) =>
    invoke<Product[]>('search_products', { query, categoryId }),
  uploadProductImage: (productId: number, sourcePath: string) =>
    invoke<string>('upload_product_image', { productId, sourcePath }),

  // Billing
  getBillingProducts: (categoryId?: number, search?: string) =>
    invoke<BillingProduct[]>('get_billing_products', { categoryId, search }),
  saveDraft: (userId: number, cartJson: string, discountJson: string) =>
    invoke<void>('save_draft', { userId, cartJson, discountJson }),
  loadDraft: (userId: number) =>
    invoke<DraftBill | null>('load_draft', { userId }),
  deleteDraft: (userId: number) =>
    invoke<void>('delete_draft', { userId }),
  completeBill: (params: {
    userId: number;
    items: CartItem[];
    discountType: string;
    discountValue: number;
    paymentMethod: string;
    cashAmountPaise?: number;
    cardAmountPaise?: number;
    upiAmountPaise?: number;
  }) =>
    invoke<CompleteBillResponse>('complete_bill', {
      userId: params.userId,
      items: params.items,
      discountType: params.discountType,
      discountValue: params.discountValue,
      paymentMethod: params.paymentMethod,
      cashAmountPaise: params.cashAmountPaise,
      cardAmountPaise: params.cardAmountPaise,
      upiAmountPaise: params.upiAmountPaise,
    }),

  // Bills
  getBills: (params: {
    businessDate?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) =>
    invoke<PaginatedResponse<Bill>>('get_bills', {
      businessDate: params.businessDate,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      status: params.status,
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    }),
  getBillDetail: (billId: number) =>
    invoke<BillDetail>('get_bill_detail', { billId }),
  voidBill: (billId: number, userId: number, reason: string) =>
    invoke<void>('void_bill', { billId, userId, reason }),
  returnBill: (billId: number, userId: number, reason: string, items: ReturnBillItem[], refundAmountPaise: number) =>
    invoke<void>('return_bill', { billId, userId, reason, items, refundAmountPaise }),

  // Dashboard
  getDashboardStats: (dateFrom: string, dateTo: string) =>
    invoke<DashboardStats>('get_dashboard_stats', { dateFrom, dateTo }),
  getRecentBills: (limit?: number) =>
    invoke<Bill[]>('get_recent_bills', { limit }),
  getSalesTrend: (dateFrom: string, dateTo: string) =>
    invoke<SalesTrendItem[]>('get_sales_trend', { dateFrom, dateTo }),

  // Settings
  getSettings: () => invoke<Setting[]>('get_settings'),
  getSetting: (key: string) => invoke<string>('get_setting', { key }),
  updateSetting: (key: string, value: string) =>
    invoke<void>('update_setting', { key, value }),

  // Users
  getUsers: () => invoke<User[]>('get_users'),
  createUser: (
    username: string,
    displayName: string,
    password: string,
    role: string,
    permissions?: string[],
    maxDiscountPct?: number
  ) =>
    invoke<User>('create_user', { username, displayName, password, role, permissions, maxDiscountPct }),
  updateUser: (
    id: number,
    displayName?: string,
    role?: string,
    isActive?: boolean,
    maxDiscountPct?: number,
    newPassword?: string,
    permissions?: string[]
  ) =>
    invoke<void>('update_user', { id, displayName, role, isActive, maxDiscountPct, newPassword, permissions }),
  deleteUser: (id: number) =>
    invoke<void>('delete_user', { id }),

  // Reports
  generateDailyReport: (date: string) =>
    invoke<string>('generate_daily_report', { date }),
  generateDateRangeReport: (dateFrom: string, dateTo: string) =>
    invoke<string>('generate_date_range_report', { dateFrom, dateTo }),
  getReportList: () =>
    invoke<string[]>('get_report_list'),

  // Backup
  createBackup: (backupType?: string) =>
    invoke<string>('create_backup', { backupType }),
  validateBackup: (path: string) =>
    invoke<string>('validate_backup', { path }),
  restoreBackup: (path: string) =>
    invoke<void>('restore_backup', { path }),
  getBackupList: () =>
    invoke<any[]>('get_backup_list'),
  clearAllBusinessData: () =>
    invoke<void>('clear_all_business_data'),

  // Import
  validateExcelImport: (filePath: string) =>
    invoke<any>('validate_excel_import', { filePath }),
  executeExcelImport: (filePath: string) =>
    invoke<string>('execute_excel_import', { filePath }),

  // Licensing
  checkLicense: () => invoke<LicenseStatus>('check_license'),
  detectUsbKey: () => invoke<USBKeyInfo | null>('detect_usb_key'),
  activateLicense: (driveLetter: string) =>
    invoke<LicenseStatus>('activate_license', { driveLetter }),
  createSecurityUsbKey: (driveLetter: string, shopName: string, licenseType?: string) =>
    invoke<string>('create_security_usb_key', { driveLetter, shopName, licenseType }),
  getLicenseInfo: () => invoke<LicenseStatus>('get_license_info'),
  deactivateLicense: () => invoke<void>('deactivate_license'),

  // Network & Multi-Computer Mode
  getNetworkInfo: () => invoke<NetworkInfo>('get_network_info'),
  setNetworkMode: (
    mode: 'host' | 'client',
    hostIp?: string,
    hostPort?: number,
    connectionCode?: string
  ) =>
    invoke<void>('set_network_mode', {
      mode,
      hostIp,
      hostPort,
      connectionCode,
    }),
  discoverHosts: () => invoke<DiscoveredHost[]>('discover_hosts'),
  testHostConnection: (hostIp: string, hostPort: number) =>
    invoke<any>('test_host_connection', { hostIp, hostPort }),
  connectToHost: (hostIp: string, hostPort: number, connectionCode: string) =>
    invoke<{
      success: boolean;
      is_approved: boolean;
      shop_id: string;
      shop_name: string;
      api_token: string;
      message: string;
    }>('connect_to_host', { hostIp, hostPort, connectionCode }),
  getRegisteredDevices: () => invoke<Device[]>('get_registered_devices'),
  approveDevice: (deviceId: string) =>
    invoke<void>('approve_device', { deviceId }),
  revokeDevice: (deviceId: string) =>
    invoke<void>('revoke_device', { deviceId }),
  renameDevice: (deviceId: string, newName: string) =>
    invoke<void>('rename_device', { deviceId, newName }),

  // Inventory & Stock
  getInventory: () => invoke<InventoryItem[]>('get_inventory'),
  adjustStock: (
    productId: number,
    quantityChange: number,
    movementType: string,
    userId: number,
    notes?: string
  ) =>
    invoke<void>('adjust_stock', {
      productId,
      quantityChange,
      movementType,
      userId,
      notes,
    }),
  getStockMovements: (productId?: number) =>
    invoke<StockMovement[]>('get_stock_movements', { productId }),
};
