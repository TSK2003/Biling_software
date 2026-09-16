use rusqlite::Connection;
use std::path::PathBuf;
use std::fs;

use super::migrations;

/// Database wrapper that manages the SQLite connection
pub struct Database {
    pub conn: Connection,
    pub data_dir: PathBuf,
}

impl Database {
    /// Initialize the database in the application data directory
    pub fn init() -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = Self::get_data_dir()?;
        
        // Create data directory structure
        fs::create_dir_all(&data_dir)?;
        fs::create_dir_all(data_dir.join("images"))?;
        fs::create_dir_all(data_dir.join("images").join("products"))?;
        fs::create_dir_all(data_dir.join("images").join("categories"))?;
        fs::create_dir_all(data_dir.join("reports"))?;
        fs::create_dir_all(data_dir.join("bills"))?;
        fs::create_dir_all(data_dir.join("backups"))?;
        fs::create_dir_all(data_dir.join("activation"))?;
        
        let legacy_db_path = data_dir.join("aescion_pos.db");
        let db_path = data_dir.join("billing_software.db");
        if !db_path.exists() && legacy_db_path.exists() {
            let _ = fs::copy(&legacy_db_path, &db_path);
        }
        let conn = Connection::open(&db_path)?;
        
        // Configure SQLite for reliability and performance
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA cache_size = -8000;
            PRAGMA temp_store = MEMORY;
        ")?;
        
        let mut db = Database { conn, data_dir };
        
        // Run migrations
        migrations::run_migrations(&mut db)?;
        
        // Ensure default admin user is always ready with all permissions
        let admin_exists: bool = db.conn.query_row(
            "SELECT 1 FROM users WHERE username = 'admin' COLLATE NOCASE",
            [],
            |_| Ok(true),
        ).unwrap_or(false);

        if !admin_exists {
            let all_screens = r#"["billing","bills","dashboard","products","categories","reports","backup","users","settings"]"#;
            let _ = db.conn.execute(
                "INSERT INTO users (username, display_name, password_hash, plain_password, permissions_json, role, is_active, max_discount_pct)
                 VALUES ('admin', 'Administrator', 'admin123', 'admin123', ?1, 'admin', 1, 100)",
                rusqlite::params![all_screens],
            );
        }
        
        Ok(db)
    }
    
    /// Get the application data directory path
    fn get_data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
        // Use LOCALAPPDATA on Windows
        let base = std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .unwrap_or_else(|_| {
                dirs_fallback()
            });
        
        let path = PathBuf::from(base).join("com.billing.software");
        Ok(path)
    }
    
    /// Get the path for product images
    pub fn product_images_dir(&self) -> PathBuf {
        self.data_dir.join("images").join("products")
    }
    
    /// Get the path for category images
    pub fn category_images_dir(&self) -> PathBuf {
        self.data_dir.join("images").join("categories")
    }
    
    /// Get the path for reports
    pub fn reports_dir(&self) -> PathBuf {
        self.data_dir.join("reports")
    }
    
    /// Get the path for bill PDFs
    pub fn bills_dir(&self) -> PathBuf {
        self.data_dir.join("bills")
    }
    
    /// Get the path for backups
    pub fn backups_dir(&self) -> PathBuf {
        self.data_dir.join("backups")
    }
    
    /// Get the path for activation data
    /// Stored in the application installation directory so that deleting or uninstalling
    /// the app removes the license and strictly requires the Security Pen Drive upon reinstallation!
    pub fn activation_dir(&self) -> PathBuf {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let app_license_dir = exe_dir.join("license");
                if std::fs::create_dir_all(&app_license_dir).is_ok() {
                    return app_license_dir;
                }
            }
        }
        self.data_dir.join("activation")
    }
}

/// Fallback for getting home directory
fn dirs_fallback() -> String {
    std::env::var("USERPROFILE")
        .unwrap_or_else(|_| "C:\\Users\\Default".to_string())
}
