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
  DriveInfo,
  ExpenseCategory,
  Expense,
  ExpenseSummary,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  ExpensesFilterRequest,
  PrinterInfo,
  PrintReceiptRequest,
  ProductExportResult,
  ProductCsvExportResult,
  ProductImportSummary,
  BackupManifest,
  BackupRecord,
  AwsBackupResponse,
  AutoBackupStatus,
} from '../types';

// ============================================================
// Client-Mode Helpers
// ============================================================

const CLIENT_CONFIG_KEY = 'billing_client_config';

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

/** Check if running inside Tauri desktop shell */
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
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
  reorderCategories: async (orderedIds: number[]) => {
    try {
      await invoke<void>('reorder_categories', { orderedIds });
    } catch {
      // Robust fallback: sequential updates
      for (let i = 0; i < orderedIds.length; i++) {
        await invoke<Category>('update_category', { id: orderedIds[i], sortOrder: i + 1 });
      }
    }
  },
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
    imagePath?: string,
    isRestockable?: boolean,
    buyingPricePaise?: number,
    initialStock?: number
  ) =>
    invoke<Product>('create_product', {
      name,
      categoryId,
      sellingPricePaise,
      gstEnabled,
      gstPercentageX100,
      imagePath,
      isRestockable,
      buyingPricePaise,
      initialStock,
    }),
  updateProduct: (
    id: number,
    name?: string,
    categoryId?: number,
    sellingPricePaise?: number,
    gstEnabled?: boolean,
    gstPercentageX100?: number,
    isActive?: boolean,
    imagePath?: string,
    isRestockable?: boolean,
    buyingPricePaise?: number
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
      isRestockable,
      buyingPricePaise,
    }),
  restockProduct: (
    productId: number,
    quantity: number,
    buyingPricePaise: number,
    sellingPricePaise?: number,
    paymentMethod?: string,
    notes?: string
  ) =>
    invoke<Product>('restock_product', {
      productId,
      quantity,
      buyingPricePaise,
      sellingPricePaise,
      paymentMethod,
      notes,
    }),
  deleteProduct: (id: number) =>
    invoke<void>('delete_product', { id }),
  searchProducts: (query: string, categoryId?: number) =>
    invoke<Product[]>('search_products', { query, categoryId }),
  uploadProductImage: (productId: number, sourcePath: string) =>
    invoke<string>('upload_product_image', { productId, sourcePath }),
  seedDemoProducts: () =>
    invoke<number>('seed_demo_products'),
  clearDemoProducts: () =>
    invoke<number>('clear_demo_products'),
  exportProductsExcel: () =>
    invoke<ProductExportResult>('export_products_excel'),
  exportProductsCsv: () =>
    invoke<ProductCsvExportResult>('export_products_csv'),
  importProductsCsv: (csvContent: string) =>
    invoke<ProductImportSummary>('import_products_csv', { csvContent }),
  importProductsExcel: (filePath: string) =>
    invoke<ProductImportSummary>('import_products_excel', { filePath }),

  // Billing
  getBillingProducts: (categoryId?: number, search?: string) =>
    invoke<BillingProduct[]>('get_billing_products', { categoryId, search }),
  getNextBillNumber: () =>
    invoke<number>('get_next_bill_number'),
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
    categoryId?: number;
    page?: number;
    pageSize?: number;
  }) =>
    invoke<PaginatedResponse<Bill>>('get_bills', {
      businessDate: params.businessDate,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      status: params.status,
      search: params.search,
      categoryId: params.categoryId,
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
  createAwsBackup: (backupType?: string) =>
    invoke<AwsBackupResponse>('create_aws_backup', { backupType }),
  exportMasterExcelBackup: () =>
    invoke<string>('export_master_excel_backup'),
  convertBackupArchiveToExcel: (archivePath: string) =>
    invoke<string>('convert_backup_archive_to_excel', { archivePath }),
  validateBackup: (path: string) =>
    invoke<BackupManifest>('validate_backup', { path }),
  restoreBackup: (path: string) =>
    invoke<void>('restore_backup', { path }),
  verifyAdminPassword: (password: string) =>
    invoke<boolean>('verify_admin_password', { password }),
  getBackupList: () =>
    invoke<BackupRecord[]>('get_backup_list'),
  clearAllBusinessData: () =>
    invoke<void>('clear_all_business_data'),
  openDownloadsFolder: () =>
    invoke<void>('open_downloads_folder'),
  showInFileManager: (path: string) =>
    invoke<void>('show_in_file_manager', { path }),
  openExternalUrl: (url: string) =>
    invoke<void>('open_external_url', { url }),
  openFile: (path: string) =>
    invoke<void>('open_file', { path }),
  syncToGoogleDrive: (folderId?: string) =>
    invoke<AwsBackupResponse>('sync_to_gdrive', { folderId }),
  checkDailyBackup: () =>
    invoke<BackupRecord | null>('check_daily_backup'),
  triggerDailyBackupNow: () =>
    invoke<BackupRecord>('trigger_daily_backup_now'),
  getAutoBackupStatus: () =>
    invoke<AutoBackupStatus>('get_auto_backup_status'),
  setAutoBackupEnabled: (enabled: boolean) =>
    invoke<void>('set_auto_backup_enabled', { enabled }),
  openAppBackupsFolder: () =>
    invoke<void>('open_app_backups_folder'),

  // Import
  validateExcelImport: (filePath: string) =>
    invoke<any>('validate_excel_import', { filePath }),
  executeExcelImport: (filePath: string) =>
    invoke<string>('execute_excel_import', { filePath }),

  // Licensing
  checkLicense: () => invoke<LicenseStatus>('check_license'),
  detectUsbKey: () => invoke<USBKeyInfo | null>('detect_usb_key'),
  getAllDrives: () => invoke<DriveInfo[]>('get_all_drives'),
  activateLicense: (driveLetter: string) =>
    invoke<LicenseStatus>('activate_license', { driveLetter }),
  activateWithCode: (code: string, shopName?: string) =>
    invoke<LicenseStatus>('activate_with_code', { code, shopName }),
  getLicenseInfo: () => invoke<LicenseStatus>('get_license_info'),
  deactivateLicense: () => invoke<void>('deactivate_license'),
  createUsbSecurityKey: (driveLetter: string, shopName?: string) =>
    invoke<string>('create_usb_security_key', { driveLetter, shopName }),

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
  setupFirewallRules: () => invoke<string>('setup_firewall_rules'),

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

  // Expenses
  getExpenseCategories: (activeOnly?: boolean) =>
    invoke<ExpenseCategory[]>('get_expense_categories', { activeOnly }),
  createExpenseCategory: (name: string, description?: string, sortOrder?: number) =>
    invoke<ExpenseCategory>('create_expense_category', { name, description, sortOrder }),
  updateExpenseCategory: (id: number, name?: string, description?: string, sortOrder?: number, isActive?: boolean) =>
    invoke<ExpenseCategory>('update_expense_category', { id, name, description, sortOrder, isActive }),
  deleteExpenseCategory: (id: number) =>
    invoke<void>('delete_expense_category', { id }),
  getExpenses: (filter?: ExpensesFilterRequest) =>
    invoke<PaginatedResponse<Expense>>('get_expenses', { filter }),
  getExpenseDetail: (id: number) =>
    invoke<Expense>('get_expense_detail', { id }),
  createExpense: (request: CreateExpenseRequest) =>
    invoke<Expense>('create_expense', { request }),
  updateExpense: (request: UpdateExpenseRequest) =>
    invoke<Expense>('update_expense', { request }),
  cancelExpense: (id: number, reason: string) =>
    invoke<void>('cancel_expense', { id, reason }),
  getExpenseSummary: (dateFrom: string, dateTo: string) =>
    invoke<ExpenseSummary>('get_expense_summary', { dateFrom, dateTo }),
  exportExpensesExcel: (dateFrom: string, dateTo: string) =>
    invoke<string>('export_expenses_excel', { dateFrom, dateTo }),

  // Printing & Hardware
  getPrinters: () => invoke<PrinterInfo[]>('get_printers'),
  getDefaultPrinter: () => invoke<string | null>('get_default_printer'),
  printReceipt: (request: PrintReceiptRequest) =>
    invoke<string>('print_receipt', { request }),
  testPrint: (printerName?: string, paperSize?: string) =>
    invoke<string>('test_print', { printerName, paperSize }),
};
