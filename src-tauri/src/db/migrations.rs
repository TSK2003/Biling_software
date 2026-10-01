use rusqlite::params;
use super::connection::Database;

/// Schema version tracking
pub const CURRENT_SCHEMA_VERSION: i32 = 10;

/// Run all database migrations
pub fn run_migrations(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    // Create schema version table
    db.conn.execute_batch("
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    ")?;
    
    // Check current version
    let current_version: i32 = db.conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    
    if current_version < 1 {
        apply_v1(db)?;
    }
    if current_version < 2 {
        apply_v2(db)?;
    }
    if current_version < 3 {
        apply_v3(db)?;
    }
    if current_version < 4 {
        apply_v4(db)?;
    }
    if current_version < 5 {
        apply_v5(db)?;
    }
    if current_version < 6 {
        apply_v6(db)?;
    }
    if current_version < 7 {
        apply_v7(db)?;
    }
    if current_version < 8 {
        apply_v8(db)?;
    }
    if current_version < 9 {
        apply_v9(db)?;
    }
    if current_version < 10 {
        apply_v10(db)?;
    }
    if current_version < 11 {
        apply_v11(db)?;
    }
    
    Ok(())
}

/// Version 1: Complete initial schema
fn apply_v1(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;
    
    // ========== USERS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
            display_name    TEXT NOT NULL,
            password_hash   TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'staff',
            is_active       INTEGER NOT NULL DEFAULT 1,
            max_discount_pct INTEGER NOT NULL DEFAULT 10,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    ")?;
    
    // ========== CATEGORIES ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
            image_path  TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
        CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
    ")?;
    
    // ========== PRODUCTS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS products (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            product_code            TEXT NOT NULL UNIQUE,
            name                    TEXT NOT NULL COLLATE NOCASE,
            category_id             INTEGER NOT NULL,
            image_path              TEXT,
            selling_price_paise     INTEGER NOT NULL CHECK (selling_price_paise >= 0),
            gst_enabled             INTEGER NOT NULL DEFAULT 0,
            gst_percentage_x100     INTEGER NOT NULL DEFAULT 0 CHECK (gst_percentage_x100 >= 0),
            barcode                 TEXT,
            is_active               INTEGER NOT NULL DEFAULT 1,
            is_restockable          INTEGER NOT NULL DEFAULT 0,
            buying_price_paise      INTEGER NOT NULL DEFAULT 0,
            created_at              TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
        );
        
        CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
        CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    ")?;
    
    // ========== PRODUCT CODE SEQUENCE ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS product_code_seq (
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            last_code   INTEGER NOT NULL DEFAULT 0
        );
    ")?;
    
    // ========== BILLS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS bills (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_uuid           TEXT NOT NULL UNIQUE,
            bill_number         INTEGER NOT NULL,
            business_date       TEXT NOT NULL,
            bill_time           TEXT NOT NULL,
            user_id             INTEGER NOT NULL,
            subtotal_paise      INTEGER NOT NULL CHECK (subtotal_paise >= 0),
            discount_type       TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'percentage', 'fixed')),
            discount_value_x100 INTEGER NOT NULL DEFAULT 0,
            discount_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
            gst_total_paise     INTEGER NOT NULL DEFAULT 0 CHECK (gst_total_paise >= 0),
            grand_total_paise   INTEGER NOT NULL CHECK (grand_total_paise >= 0),
            status              TEXT NOT NULL DEFAULT 'completed',
            void_reason         TEXT,
            voided_by_user_id   INTEGER,
            voided_at           TEXT,
            import_source       TEXT,
            import_hash         TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
            FOREIGN KEY (voided_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
            UNIQUE(business_date, bill_number)
        );
        
        CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(business_date);
        CREATE INDEX IF NOT EXISTS idx_bills_number ON bills(bill_number);
        CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);
        CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
        CREATE INDEX IF NOT EXISTS idx_bills_uuid ON bills(bill_uuid);
        CREATE INDEX IF NOT EXISTS idx_bills_import_hash ON bills(import_hash);
        CREATE INDEX IF NOT EXISTS idx_bills_date_number ON bills(business_date, bill_number);
    ")?;
    
    // ========== BILL ITEMS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS bill_items (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id                 INTEGER NOT NULL,
            product_id              INTEGER,
            product_code_snapshot   TEXT NOT NULL,
            product_name_snapshot   TEXT NOT NULL,
            category_name_snapshot  TEXT NOT NULL,
            unit_price_paise        INTEGER NOT NULL CHECK (unit_price_paise >= 0),
            quantity                INTEGER NOT NULL CHECK (quantity >= 0),
            gst_enabled             INTEGER NOT NULL DEFAULT 0,
            gst_percentage_x100     INTEGER NOT NULL DEFAULT 0,
            gst_amount_paise        INTEGER NOT NULL DEFAULT 0 CHECK (gst_amount_paise >= 0),
            line_total_paise        INTEGER NOT NULL CHECK (line_total_paise >= 0),
            sort_order              INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
        CREATE INDEX IF NOT EXISTS idx_bill_items_product ON bill_items(product_id);
    ")?;
    
    // ========== PAYMENTS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS payments (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id             INTEGER NOT NULL UNIQUE,
            payment_method      TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'upi', 'upi_cash')),
            total_amount_paise  INTEGER NOT NULL CHECK (total_amount_paise >= 0),
            cash_amount_paise   INTEGER NOT NULL DEFAULT 0 CHECK (cash_amount_paise >= 0),
            card_amount_paise   INTEGER NOT NULL DEFAULT 0 CHECK (card_amount_paise >= 0),
            upi_amount_paise    INTEGER NOT NULL DEFAULT 0 CHECK (upi_amount_paise >= 0),
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
        CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);
    ")?;
    
    // ========== DRAFT BILLS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS draft_bills (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            cart_json   TEXT NOT NULL DEFAULT '[]',
            discount_json TEXT NOT NULL DEFAULT '{}',
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_draft_bills_user ON draft_bills(user_id);
    ")?;
    
    // ========== SETTINGS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS settings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            key         TEXT NOT NULL UNIQUE,
            value       TEXT NOT NULL DEFAULT '',
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    ")?;
    
    // ========== SYNC QUEUE ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS sync_queue (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            file_type       TEXT NOT NULL CHECK (file_type IN ('report', 'bill_pdf', 'backup')),
            local_path      TEXT NOT NULL,
            remote_path     TEXT,
            gdrive_file_id  TEXT,
            status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'uploaded', 'failed')),
            retry_count     INTEGER NOT NULL DEFAULT 0,
            error_message   TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_type ON sync_queue(file_type);
    ")?;
    
    // ========== BACKUP RECORDS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS backup_records (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            backup_type     TEXT NOT NULL CHECK (backup_type IN ('manual', 'auto', 'pre_restore')),
            backup_path     TEXT NOT NULL,
            manifest_json   TEXT,
            size_bytes      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
    ")?;
    
    // ========== AUDIT LOGS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS audit_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER,
            action          TEXT NOT NULL,
            entity_type     TEXT NOT NULL,
            entity_id       INTEGER,
            details_json    TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);
    ")?;
    
    // ========== LICENSE ACTIVATIONS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS license_activations (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            license_id      TEXT NOT NULL,
            shop_name       TEXT NOT NULL,
            license_type    TEXT NOT NULL DEFAULT 'lifetime',
            features_json   TEXT NOT NULL DEFAULT '[]',
            device_id_hash  TEXT NOT NULL,
            max_activations INTEGER NOT NULL DEFAULT 1,
            activated_at    TEXT NOT NULL,
            expires_at      TEXT,
            app_version     TEXT NOT NULL,
            schema_version  INTEGER NOT NULL DEFAULT 1,
            is_active       INTEGER NOT NULL DEFAULT 1,
            deactivated_at  TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_license_id ON license_activations(license_id);
        CREATE INDEX IF NOT EXISTS idx_license_active ON license_activations(is_active);
    ")?;
    
    // ========== SEED DATA ==========
    
    // Seed product code sequence
    tx.execute(
        "INSERT OR IGNORE INTO product_code_seq (id, last_code) VALUES (1, 0)",
        [],
    )?;
    
    // Seed default admin user (password: admin123, hashed with argon2)
    let password_hash = hash_password("admin123")?;
    tx.execute(
        "INSERT OR IGNORE INTO users (username, display_name, password_hash, role, max_discount_pct)
         VALUES ('admin', 'Administrator', ?1, 'admin', 100)",
        params![password_hash],
    )?;
    
    // Seed default categories matching canonical catalog
    let categories = [
        ("Juice & Beverages", 1),
        ("Snacks & Chaat", 2),
        ("Fast Food & Burgers", 3),
        ("Ice Cream & Desserts", 4),
        ("Bakery & Pastries", 5),
        ("Tea & Coffee", 6),
        ("Meals & Combos", 7),
        ("Packaged Goods", 8),
    ];
    for (name, order) in &categories {
        tx.execute(
            "INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?1, ?2)",
            params![name, order],
        )?;
    }
    
    // Seed default settings
    let settings = [
        ("shop_name", "My Shop"),
        ("shop_address", ""),
        ("shop_phone", ""),
        ("shop_email", ""),
        ("shop_logo", ""),
        ("gst_enabled", "false"),
        ("gst_number", ""),
        ("gst_default_percentage", "500"),
        ("default_payment_method", "cash"),
        ("currency_symbol", "₹"),
        ("printer_enabled", "false"),
        ("printer_paper_size", "A4"),
        ("printer_copies", "1"),
        ("printer_default", ""),
        ("gdrive_connected", "false"),
        ("gdrive_folder_name", "Shop Billing"),
        ("auto_backup_enabled", "true"),
        ("auto_backup_max_count", "10"),
        ("app_version", "0.1.0"),
        ("report_schema_version", "1"),
    ];
    for (key, value) in &settings {
        tx.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }
    
    // Record schema version
    tx.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        params![1],
    )?;
    
    tx.commit()?;
    
    log::info!("Database migration v1 applied successfully");
    Ok(())
}

/// Version 2: Multi-Computer Local Network Architecture (Devices, Stock Movements, Inventory, Idempotency)
fn apply_v2(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;
    
    // ========== REGISTERED DEVICES ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS devices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id       TEXT NOT NULL UNIQUE,
            device_name     TEXT NOT NULL,
            device_type     TEXT NOT NULL DEFAULT 'client' CHECK (device_type IN ('host', 'client')),
            ip_address      TEXT,
            is_approved     INTEGER NOT NULL DEFAULT 0,
            is_active       INTEGER NOT NULL DEFAULT 1,
            api_token       TEXT NOT NULL,
            last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
            app_version     TEXT NOT NULL DEFAULT '0.1.0',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_devices_id ON devices(device_id);
        CREATE INDEX IF NOT EXISTS idx_devices_approved ON devices(is_approved);
    ")?;
    
    // ========== INVENTORY ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS inventory (
            product_id          INTEGER PRIMARY KEY,
            current_stock       INTEGER NOT NULL DEFAULT 0,
            low_stock_threshold INTEGER NOT NULL DEFAULT 10,
            updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
    ")?;
    
    // ========== STOCK MOVEMENTS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS stock_movements (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id      INTEGER NOT NULL,
            quantity_change INTEGER NOT NULL,
            movement_type   TEXT NOT NULL CHECK (movement_type IN ('sale', 'purchase', 'adjustment', 'return', 'opening')),
            reference_id    INTEGER,
            user_id         INTEGER,
            device_id       TEXT,
            notes           TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
        CREATE INDEX IF NOT EXISTS idx_stock_created ON stock_movements(created_at);
    ")?;
    
    // ========== IDEMPOTENCY KEYS ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            request_id      TEXT PRIMARY KEY,
            response_json   TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
    ")?;
    
    // Seed default network and shop identity settings
    let network_settings = [
        ("shop_id", "SHOP-BILLING-000001"),
        ("connection_code", "BILLING-884920"),
        ("host_port", "4123"),
        ("network_mode", "host"),
        ("device_name", "MAIN-PC"),
    ];
    for (key, value) in &network_settings {
        tx.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }
    
    // Register the Host machine device automatically as approved with a secure token
    let host_device_id = "DEV-HOST-000001";
    let host_token = format!("HOST-{}", uuid::Uuid::new_v4().to_string().replace('-', ""));
    tx.execute(
        "INSERT OR IGNORE INTO devices (device_id, device_name, device_type, ip_address, is_approved, is_active, api_token)
         VALUES (?1, 'MAIN-HOST-PC', 'host', '127.0.0.1', 1, 1, ?2)",
        params![host_device_id, host_token],
    )?;
    
    // Record schema version 2
    tx.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        params![2],
    )?;
    
    tx.commit()?;
    log::info!("Database migration v2 (Multi-Computer Network) applied successfully");
    Ok(())
}

/// Version 3: RBAC (Roles, Permissions, User-Roles, Role-Permissions)
fn apply_v3(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;
    
    // ========== ROLES ==========
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS roles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL UNIQUE COLLATE NOCASE,
            display_name    TEXT NOT NULL,
            description     TEXT,
            is_system       INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE TABLE IF NOT EXISTS permissions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            code            TEXT NOT NULL UNIQUE COLLATE NOCASE,
            module          TEXT NOT NULL,
            description     TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id         INTEGER NOT NULL,
            permission_id   INTEGER NOT NULL,
            PRIMARY KEY (role_id, permission_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id         INTEGER NOT NULL,
            role_id         INTEGER NOT NULL,
            PRIMARY KEY (user_id, role_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
        CREATE INDEX IF NOT EXISTS idx_role_permissions ON role_permissions(role_id);
        CREATE INDEX IF NOT EXISTS idx_user_roles ON user_roles(user_id);
    ")?;
    
    // Seed Permissions
    let permissions = [
        ("inventory.view", "inventory", "View inventory and stock levels"),
        ("inventory.create", "inventory", "Add new products and categories"),
        ("inventory.edit", "inventory", "Modify products and prices"),
        ("inventory.delete", "inventory", "Delete products and categories"),
        ("inventory.adjust", "inventory", "Adjust stock counts"),
        ("cashier.view", "cashier", "Access cashier billing register"),
        ("cashier.create", "cashier", "Complete sales transactions and bills"),
        ("cashier.reprint", "cashier", "Reprint past receipts"),
        ("cashier.discount", "cashier", "Apply discounts to bills"),
        ("cashier.cancel", "cashier", "Void or cancel bills"),
        ("reports.view", "reports", "View sales and financial analytics"),
        ("reports.export", "reports", "Export Excel and PDF reports"),
        ("users.view", "users", "View staff accounts"),
        ("users.create", "users", "Create new staff accounts"),
        ("users.edit", "users", "Modify staff permissions and passwords"),
        ("users.delete", "users", "Deactivate staff accounts"),
        ("settings.view", "settings", "View shop configuration"),
        ("settings.edit", "settings", "Modify shop settings and tax rules"),
        ("backup.view", "backup", "View backup logs and cloud status"),
        ("backup.create", "backup", "Generate local and cloud backups"),
        ("backup.restore", "backup", "Restore business databases"),
    ];
    
    for (code, module, desc) in &permissions {
        tx.execute(
            "INSERT OR IGNORE INTO permissions (code, module, description) VALUES (?1, ?2, ?3)",
            params![code, module, desc],
        )?;
    }
    
    // Seed Standard Roles
    let roles = [
        (1, "admin", "Administrator", "Full unrestricted access to all shop functions", 1),
        (2, "manager", "Store Manager", "Management access to inventory, cashier, and reports", 1),
        (3, "inventory_staff", "Inventory Staff", "Access to stock, products, and catalog", 1),
        (4, "cashier", "Cashier", "Access to fast billing register and receipt printing", 1),
    ];
    
    for (id, name, display, desc, is_sys) in &roles {
        tx.execute(
            "INSERT OR IGNORE INTO roles (id, name, display_name, description, is_system) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, display, desc, is_sys],
        )?;
    }
    
    // Map Admin Role Permissions (Role 1 gets all permissions)
    tx.execute(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
         SELECT 1, id FROM permissions",
        [],
    )?;
    
    // Map Manager Role Permissions (Inventory, Cashier, Reports, Users view)
    tx.execute(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
         SELECT 2, id FROM permissions WHERE module IN ('inventory', 'cashier', 'reports') OR code = 'users.view'",
        [],
    )?;
    
    // Map Inventory Staff Role Permissions
    tx.execute(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
         SELECT 3, id FROM permissions WHERE module = 'inventory'",
        [],
    )?;
    
    // Map Cashier Role Permissions
    tx.execute(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
         SELECT 4, id FROM permissions WHERE code IN ('cashier.view', 'cashier.create', 'cashier.reprint', 'cashier.discount')",
        [],
    )?;
    
    // Assign Admin user (id=1) to Admin role (role=1)
    tx.execute(
        "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (1, 1)",
        [],
    )?;
    
    // Record schema version 3
    tx.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        params![3],
    )?;
    
    tx.commit()?;
    log::info!("Database migration v3 (RBAC Roles & Permissions) applied successfully");
    Ok(())
}

/// Version 4: Enhanced User Screen Permissions & Plain Password Storage for Admin
fn apply_v4(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;
    
    // Add plain_password and permissions_json columns to users table if not existing
    let _ = tx.execute("ALTER TABLE users ADD COLUMN plain_password TEXT", []);
    let _ = tx.execute("ALTER TABLE users ADD COLUMN permissions_json TEXT", []);
    
    // Update admin user with full screen permissions (no plain text password)
    let all_screens = r#"["billing","bills","dashboard","products","categories","reports","backup","users","settings","expenses"]"#;
    let _ = tx.execute(
        "UPDATE users SET plain_password = NULL, permissions_json = ?1 WHERE id = 1",
        params![all_screens],
    );
    
    // Record schema version 4
    tx.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        params![4],
    )?;
    
    tx.commit()?;
    log::info!("Database migration v4 (User Screen Permissions & Admin Password View) applied successfully");
    Ok(())
}

/// Version 5: Rebuild users table to remove restrictive CHECK constraint on role column
fn apply_v5(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    db.conn.execute_batch("
        PRAGMA foreign_keys = OFF;
        
        CREATE TABLE IF NOT EXISTS users_v5 (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
            display_name    TEXT NOT NULL,
            password_hash   TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'staff',
            is_active       INTEGER NOT NULL DEFAULT 1,
            max_discount_pct INTEGER NOT NULL DEFAULT 10,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            plain_password  TEXT,
            permissions_json TEXT
        );
        
        INSERT OR IGNORE INTO users_v5 (id, username, display_name, password_hash, role, is_active, max_discount_pct, created_at, updated_at, plain_password, permissions_json)
        SELECT id, username, display_name, password_hash, role, is_active, max_discount_pct, created_at, updated_at, plain_password, permissions_json FROM users;
        
        DROP TABLE users;
        ALTER TABLE users_v5 RENAME TO users;
        
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
        
        PRAGMA foreign_keys = ON;
        
        INSERT INTO schema_version (version) VALUES (5);
    ")?;
    
    log::info!("Database migration v5 (Removed CHECK constraint on users.role) applied successfully");
    Ok(())
}

/// Version 6: Rebuild bills table to remove restrictive CHECK constraint on status column (enables returned status)
fn apply_v6(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    db.conn.execute_batch("
        PRAGMA foreign_keys = OFF;
        
        CREATE TABLE IF NOT EXISTS bills_v6 (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_uuid           TEXT NOT NULL UNIQUE,
            bill_number         INTEGER NOT NULL,
            business_date       TEXT NOT NULL,
            bill_time           TEXT NOT NULL,
            user_id             INTEGER NOT NULL,
            subtotal_paise      INTEGER NOT NULL CHECK (subtotal_paise >= 0),
            discount_type       TEXT NOT NULL DEFAULT 'none',
            discount_value_x100 INTEGER NOT NULL DEFAULT 0,
            discount_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
            gst_total_paise     INTEGER NOT NULL DEFAULT 0 CHECK (gst_total_paise >= 0),
            grand_total_paise   INTEGER NOT NULL CHECK (grand_total_paise >= 0),
            status              TEXT NOT NULL DEFAULT 'completed',
            void_reason         TEXT,
            voided_by_user_id   INTEGER,
            voided_at           TEXT,
            import_source       TEXT,
            import_hash         TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
            FOREIGN KEY (voided_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
            UNIQUE(business_date, bill_number)
        );
        
        INSERT OR IGNORE INTO bills_v6 (
            id, bill_uuid, bill_number, business_date, bill_time, user_id,
            subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
            gst_total_paise, grand_total_paise, status, void_reason, voided_by_user_id,
            voided_at, import_source, import_hash, created_at, updated_at
        )
        SELECT id, bill_uuid, bill_number, business_date, bill_time, user_id,
               subtotal_paise, discount_type, discount_value_x100, discount_amount_paise,
               gst_total_paise, grand_total_paise, status, void_reason, voided_by_user_id,
               voided_at, import_source, import_hash, created_at, updated_at
        FROM bills;
        
        DROP TABLE bills;
        ALTER TABLE bills_v6 RENAME TO bills;
        
        CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(business_date);
        CREATE INDEX IF NOT EXISTS idx_bills_number ON bills(bill_number);
        CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);
        CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
        CREATE INDEX IF NOT EXISTS idx_bills_uuid ON bills(bill_uuid);
        CREATE INDEX IF NOT EXISTS idx_bills_import_hash ON bills(import_hash);
        CREATE INDEX IF NOT EXISTS idx_bills_date_number ON bills(business_date, bill_number);
        
        PRAGMA foreign_keys = ON;
        
        INSERT INTO schema_version (version) VALUES (6);
    ")?;
    
    log::info!("Database migration v6 (Removed restrictive CHECK constraint on bills.status) applied successfully");
    Ok(())
}

/// Version 7: Correct financial totals for cancelled bills (zero out GST, subtotal, discount, grand total)
fn apply_v7(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;
    tx.execute_batch("
        UPDATE bills SET 
            subtotal_paise = 0, 
            gst_total_paise = 0, 
            discount_amount_paise = 0, 
            grand_total_paise = 0 
        WHERE status = 'cancelled';

        UPDATE payments SET
            total_amount_paise = 0,
            cash_amount_paise = 0,
            upi_amount_paise = 0,
            card_amount_paise = 0
        WHERE bill_id IN (SELECT id FROM bills WHERE status = 'cancelled');

        INSERT INTO schema_version (version) VALUES (7);
    ")?;
    tx.commit()?;
    log::info!("Database migration v7 (Zero out cancelled bills GST and financial totals) applied successfully");
    Ok(())
}

/// Version 8: Expense Management tables & nullify cleartext passwords
fn apply_v8(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;
    
    // Create expense categories and sequence tables
    tx.execute_batch("
        CREATE TABLE IF NOT EXISTS expense_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
            description TEXT,
            is_active   INTEGER NOT NULL DEFAULT 1,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(is_active);
        CREATE INDEX IF NOT EXISTS idx_expense_categories_sort ON expense_categories(sort_order);

        CREATE TABLE IF NOT EXISTS expense_number_seq (
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            last_number INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO expense_number_seq (id, last_number) VALUES (1, 0);

        CREATE TABLE IF NOT EXISTS expenses (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_number      INTEGER NOT NULL,
            expense_date        TEXT NOT NULL,
            category_id         INTEGER NOT NULL,
            title               TEXT NOT NULL,
            description         TEXT,
            amount_paise        INTEGER NOT NULL CHECK (amount_paise >= 0),
            payment_method      TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'upi', 'bank_transfer', 'cheque')),
            paid_by_user_id     INTEGER NOT NULL,
            payee               TEXT,
            reference_number    TEXT,
            notes               TEXT,
            status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
            cancelled_reason    TEXT,
            cancelled_by        INTEGER,
            cancelled_at        TEXT,
            created_by          INTEGER NOT NULL,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            updated_by          INTEGER,
            updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT,
            FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
            FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE RESTRICT,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
        CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
        CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
        CREATE INDEX IF NOT EXISTS idx_expenses_number ON expenses(expense_number);
    ")?;

    // Seed default expense categories if empty
    let cat_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM expense_categories",
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    if cat_count == 0 {
        let default_categories = [
            ("Rent", "Store/Shop premises rent", 1),
            ("Electricity & Utilities", "Power, water, and utility bills", 2),
            ("Salaries & Wages", "Employee salaries, daily wages, and incentives", 3),
            ("Inventory & Supplies", "Goods, packaging, and raw material purchases", 4),
            ("Transportation & Fuel", "Delivery, fuel, freight, and vehicle maintenance", 5),
            ("Maintenance & Repairs", "Equipment, shop repair, and upkeep", 6),
            ("Tea & Refreshments", "Daily tea, snacks, and water for staff", 7),
            ("Marketing & Advertising", "Promotions, flyers, and advertising", 8),
            ("Internet & Phone", "Broadband, phone recharge, and communication", 9),
            ("Miscellaneous", "Other unexpected or petty cash expenses", 10),
        ];

        for (name, desc, sort) in default_categories.iter() {
            tx.execute(
                "INSERT INTO expense_categories (name, description, sort_order) VALUES (?1, ?2, ?3)",
                params![name, desc, sort],
            )?;
        }
    }

    // Security fix: Nullify any remaining plain_password entries
    let _ = tx.execute("UPDATE users SET plain_password = NULL", []);

    // Ensure admin user permissions include 'expenses'
    let admin_perms: Option<String> = tx.query_row(
        "SELECT permissions_json FROM users WHERE id = 1 OR role = 'admin' LIMIT 1",
        [],
        |r| r.get(0),
    ).ok();

    if let Some(json_str) = admin_perms {
        if let Ok(mut perms) = serde_json::from_str::<Vec<String>>(&json_str) {
            if !perms.contains(&"expenses".to_string()) {
                perms.push("expenses".to_string());
                let updated = serde_json::to_string(&perms).unwrap_or_default();
                let _ = tx.execute(
                    "UPDATE users SET permissions_json = ?1 WHERE id = 1 OR role = 'admin'",
                    params![updated],
                );
            }
        }
    }

    // Record schema version 8
    tx.execute("INSERT INTO schema_version (version) VALUES (8)", [])?;

    tx.commit()?;
    log::info!("Database migration v8 (Expense Management & Plain Password Nullification) applied successfully");
    Ok(())
}

/// Version 9: Configure Google Drive default link and move existing backups to Downloads
fn apply_v9(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;

    let drive_link = "";
    let drive_id = "";

    tx.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('gdrive_folder_id', ?1)",
        params![drive_id],
    )?;

    tx.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('gdrive_folder_url', ?1)",
        params![drive_link],
    )?;

    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('gdrive_auto_sync', 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'",
        [],
    )?;

    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('gdrive_connected', 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'",
        [],
    )?;

    tx.execute("INSERT INTO schema_version (version) VALUES (9)", [])?;
    tx.commit()?;

    // Copy any previous local backup archives to user's Downloads folder
    let downloads_dir = crate::services::backup_service::BackupService::get_downloads_dir();
    let _ = std::fs::create_dir_all(&downloads_dir);

    if let Ok(mut stmt) = db.conn.prepare("SELECT id, backup_path FROM backup_records") {
        let rows: Vec<(i64, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|it| it.filter_map(|x| x.ok()).collect())
            .unwrap_or_default();

        for (id, old_path) in rows {
            let p = std::path::Path::new(&old_path);
            if p.exists() {
                if let Some(file_name) = p.file_name() {
                    let new_dest = downloads_dir.join(file_name);
                    let _ = std::fs::copy(p, &new_dest);
                    let new_path_str = new_dest.to_string_lossy().to_string();
                    let _ = db.conn.execute(
                        "UPDATE backup_records SET backup_path = ?1 WHERE id = ?2",
                        params![new_path_str, id],
                    );
                }
            }
        }
    }

    log::info!("Database migration v9 (Google Drive configured & Backups moved to Downloads) applied successfully");
    Ok(())
}

/// Version 10: Add is_restockable and buying_price_paise columns to products
fn apply_v10(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;

    let _ = tx.execute("ALTER TABLE products ADD COLUMN is_restockable INTEGER NOT NULL DEFAULT 0", []);
    let _ = tx.execute("ALTER TABLE products ADD COLUMN buying_price_paise INTEGER NOT NULL DEFAULT 0", []);

    tx.execute("INSERT INTO schema_version (version) VALUES (10)", [])?;
    tx.commit()?;

    log::info!("Database migration v10 (Restockable products & buying price) applied successfully");
    Ok(())
}

/// Version 11: Add returned_quantity to bill_items, create bill_returns and bill_return_items tables
fn apply_v11(db: &mut Database) -> Result<(), Box<dyn std::error::Error>> {
    let tx = db.conn.transaction()?;

    // 1. Rebuild bill_items table to allow quantity >= 0 and add returned_quantity column
    tx.execute_batch("
        PRAGMA foreign_keys = OFF;

        CREATE TABLE IF NOT EXISTS bill_items_v11 (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id                 INTEGER NOT NULL,
            product_id              INTEGER,
            product_code_snapshot   TEXT NOT NULL,
            product_name_snapshot   TEXT NOT NULL,
            category_name_snapshot  TEXT NOT NULL,
            unit_price_paise        INTEGER NOT NULL CHECK (unit_price_paise >= 0),
            quantity                INTEGER NOT NULL CHECK (quantity >= 0),
            gst_enabled             INTEGER NOT NULL DEFAULT 0,
            gst_percentage_x100     INTEGER NOT NULL DEFAULT 0,
            gst_amount_paise        INTEGER NOT NULL DEFAULT 0 CHECK (gst_amount_paise >= 0),
            line_total_paise        INTEGER NOT NULL CHECK (line_total_paise >= 0),
            sort_order              INTEGER NOT NULL DEFAULT 0,
            returned_quantity       INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        );

        INSERT INTO bill_items_v11 (
            id, bill_id, product_id, product_code_snapshot, product_name_snapshot,
            category_name_snapshot, unit_price_paise, quantity, gst_enabled,
            gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order, returned_quantity
        )
        SELECT 
            id, bill_id, product_id, product_code_snapshot, product_name_snapshot,
            category_name_snapshot, unit_price_paise, quantity, gst_enabled,
            gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order, 0
        FROM bill_items;

        DROP TABLE bill_items;
        ALTER TABLE bill_items_v11 RENAME TO bill_items;

        CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
        CREATE INDEX IF NOT EXISTS idx_bill_items_product ON bill_items(product_id);

        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS bill_returns (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id             INTEGER NOT NULL,
            user_id             INTEGER NOT NULL,
            reason              TEXT NOT NULL,
            refund_amount_paise INTEGER NOT NULL DEFAULT 0,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_bill_returns_bill ON bill_returns(bill_id);

        CREATE TABLE IF NOT EXISTS bill_return_items (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_return_id      INTEGER NOT NULL,
            bill_id             INTEGER NOT NULL,
            bill_item_id        INTEGER NOT NULL,
            product_id          INTEGER,
            product_name        TEXT NOT NULL,
            product_code        TEXT NOT NULL DEFAULT '',
            quantity            INTEGER NOT NULL,
            unit_price_paise    INTEGER NOT NULL,
            line_total_paise    INTEGER NOT NULL,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (bill_return_id) REFERENCES bill_returns(id) ON DELETE CASCADE,
            FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_bill_return_items_bill ON bill_return_items(bill_id);
    ")?;

    // 2. Backfill returned_quantity for existing returned bills using stock_movements
    let _ = tx.execute("
        UPDATE bill_items
        SET returned_quantity = (
            SELECT COALESCE(SUM(sm.quantity_change), 0)
            FROM stock_movements sm
            WHERE sm.reference_id = bill_items.bill_id
              AND sm.product_id = bill_items.product_id
              AND sm.movement_type = 'return'
        )
        WHERE EXISTS (
            SELECT 1 FROM stock_movements sm
            WHERE sm.reference_id = bill_items.bill_id
              AND sm.product_id = bill_items.product_id
              AND sm.movement_type = 'return'
        )
    ", []);

    tx.execute("INSERT INTO schema_version (version) VALUES (11)", [])?;
    tx.commit()?;

    log::info!("Database migration v11 (Return tracking tables & bill_items.returned_quantity) applied successfully");
    Ok(())
}

/// Hash a password using argon2
fn hash_password(password: &str) -> Result<String, Box<dyn std::error::Error>> {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };
    
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {}", e))?;
    
    Ok(hash.to_string())
}
