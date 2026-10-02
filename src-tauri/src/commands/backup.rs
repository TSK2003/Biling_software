use tauri::State;
use crate::AppState;
use crate::models::{BackupRecord, BackupManifest, AwsBackupResponse};
use crate::services::backup_service::BackupService;

#[tauri::command]
pub fn create_backup(state: State<'_, AppState>, backup_type: Option<String>) -> Result<String, String> {
    crate::commands::auth::require_screen_access("backup")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let record = BackupService::create_full_backup(&db, &backup_type.unwrap_or_else(|| "manual".to_string()))?;
    Ok(record.backup_path)
}

#[tauri::command]
pub fn validate_backup(_state: State<'_, AppState>, path: String) -> Result<BackupManifest, String> {
    crate::commands::auth::require_screen_access("backup")?;
    BackupService::validate_backup_archive(&path)
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, path: String) -> Result<(), String> {
    crate::commands::auth::require_admin()?;
    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    BackupService::restore_full_backup(&mut db, &path)
}

#[tauri::command]
pub fn verify_admin_password(state: State<'_, AppState>, password: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let mut stmt = db.conn.prepare("SELECT password_hash FROM users WHERE role = 'admin' AND is_active = 1")
        .map_err(|e| e.to_string())?;
    let hashes: Vec<String> = stmt.query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    use argon2::{Argon2, PasswordHash, PasswordVerifier};
    for hash in hashes {
        if let Ok(parsed) = PasswordHash::new(&hash) {
            if Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok() {
                return Ok(true);
            }
        }
    }
    Err("Invalid administrator password. Please check your password and try again.".to_string())
}

#[tauri::command]
pub fn get_backup_list(state: State<'_, AppState>) -> Result<Vec<BackupRecord>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    BackupService::get_backup_list(&db)
}

#[tauri::command]
pub fn clear_all_business_data(state: State<'_, AppState>) -> Result<(), String> {
    crate::commands::auth::require_admin()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let tx = db.conn.unchecked_transaction().map_err(|e| e.to_string())?;

    // Clear transactions and catalog data
    tx.execute("DELETE FROM draft_bills", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM payments", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bill_items", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bills", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM products", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM categories", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM inventory", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM stock_movements", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM idempotency_keys", []).map_err(|e| e.to_string())?;
    let _ = tx.execute("DELETE FROM expenses", []);
    let _ = tx.execute("UPDATE product_code_seq SET last_code = 0 WHERE id = 1", []);
    
    // Reset standard categories for convenience
    tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (1, 'Juice', 1, 1)", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (2, 'Snacks', 2, 1)", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (3, 'Fast Food', 3, 1)", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (4, 'Ice Cream', 4, 1)", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO categories (id, name, sort_order, is_active) VALUES (5, 'Others', 5, 1)", []).map_err(|e| e.to_string())?;
    
    // Also wipe activation file and license records so application requires re-activation
    let activation_file = db.activation_dir().join("activation.dat");
    if activation_file.exists() {
        let _ = std::fs::remove_file(&activation_file);
    }
    tx.execute("DELETE FROM license_activations", []).map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO audit_logs (action, entity_type) VALUES ('wipe_all_data', 'database')",
        [],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}

use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn pick_backup_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_backup_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app.dialog().file()
        .add_filter("Billing Backup Archive", &["billingbackup", "zip"])
        .blocking_pick_file();
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub fn get_backup_folder_path(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let path = BackupService::get_backup_dir(&db);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_backup_folder_path(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let p = std::path::PathBuf::from(trimmed);
    std::fs::create_dir_all(&p).map_err(|e| format!("Failed to create folder: {}", e))?;
    
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let normalized = p.to_string_lossy().to_string();
    db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('backup_folder_path', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        rusqlite::params![normalized],
    ).map_err(|e| format!("Database error: {}", e))?;

    Ok(normalized)
}

#[tauri::command]
pub fn open_downloads_folder(state: State<'_, AppState>) -> Result<(), String> {
    let billing_downloads = if let Ok(db) = state.db.lock() {
        BackupService::get_backup_dir(&db)
    } else {
        BackupService::get_billing_downloads_backups_dir()
    };
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&billing_downloads).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = open::that(&billing_downloads);
    }
    Ok(())
}

#[tauri::command]
pub fn show_in_file_manager(state: State<'_, AppState>, path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let p = std::path::Path::new(&path);
        if p.exists() {
            let _ = std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&path)
                .spawn();
        } else {
            open_downloads_folder(state)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let mut clean_url = url.trim().to_string();
    if clean_url.is_empty() {
        clean_url = "https://drive.google.com".to_string();
    } else if !clean_url.starts_with("http://") && !clean_url.starts_with("https://") {
        clean_url = format!("https://drive.google.com/drive/folders/{}", clean_url);
    }

    #[cfg(windows)]
    {
        let res = std::process::Command::new("cmd")
            .args(["/C", "start", "", &clean_url])
            .spawn();
        match res {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Could not open browser: {}", e)),
        }
    }
    #[cfg(not(windows))]
    {
        open::that(&clean_url).map_err(|e| format!("Could not open browser: {}", e))
    }
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    #[cfg(windows)]
    {
        let res = std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn();
        match res {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Could not open file: {}", e)),
        }
    }
    #[cfg(not(windows))]
    {
        open::that(&path).map_err(|e| format!("Could not open file: {}", e))
    }
}

#[tauri::command]
pub fn export_master_excel_backup(state: State<'_, AppState>) -> Result<String, String> {
    crate::commands::auth::require_screen_access("backup")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let now = chrono::Local::now();
    let month_str = now.format("%Y-%m").to_string();
    let excel_filename = format!("Billing_Backup_{}.xlsx", month_str);

    let billing_downloads_dir = BackupService::get_backup_dir(&db);
    let dest_path = billing_downloads_dir.join(&excel_filename);

    let shop_name: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_name'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "Billing Software Shop".to_string());

    let shop_id: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_id'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "SHOP-BILLING-000001".to_string());

    let generated_path = BackupService::generate_monthly_excel_backup_from_conn(
        &db.conn,
        &shop_name,
        &shop_id,
        &month_str,
        &dest_path,
    )?;

    // Highlight in explorer
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&generated_path)
            .spawn();
    }

    Ok(generated_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn convert_backup_archive_to_excel(archive_path: String) -> Result<String, String> {
    crate::commands::auth::require_screen_access("backup")?;
    let excel_path = BackupService::convert_backup_to_excel(&archive_path)?;

    // Highlight converted file in explorer
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&excel_path)
            .spawn();
    }

    Ok(excel_path)
}

#[tauri::command]
pub fn create_aws_backup(state: State<'_, AppState>, backup_type: Option<String>) -> Result<AwsBackupResponse, String> {
    crate::commands::auth::require_screen_access("backup")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let b_type = backup_type.unwrap_or_else(|| "manual".to_string());
    let record = BackupService::create_full_backup(&db, &b_type)?;

    let billing_downloads_dir = BackupService::get_backup_dir(&db);
    let package_path_obj = std::path::Path::new(&record.backup_path);

    let month_str = chrono::Local::now().format("%Y-%m").to_string();
    let excel_filename = format!("Billing_Backup_{}.xlsx", month_str);
    let excel_path = billing_downloads_dir.join(&excel_filename);
    let excel_path_str = if excel_path.exists() {
        excel_path.to_string_lossy().to_string()
    } else {
        "".to_string()
    };
    let excel_size = if excel_path.exists() {
        std::fs::metadata(&excel_path).map(|m| m.len() as i64).unwrap_or(0)
    } else {
        0
    };

    let package_name = package_path_obj
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("package.billingbackup")
        .to_string();

    let drive_url: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'gdrive_folder_url'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "https://drive.google.com".to_string());

    let sha256 = BackupService::calculate_file_sha256(package_path_obj)
        .unwrap_or_default();

    // Highlight in Explorer
    if excel_path.exists() {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&excel_path)
                .spawn();
        }
    }

    Ok(AwsBackupResponse {
        package_path: record.backup_path,
        excel_path: excel_path_str,
        package_name,
        excel_name: excel_filename,
        package_size: record.size_bytes,
        excel_size,
        sha256,
        drive_url,
        timestamp: chrono::Local::now().format("%d-%m-%Y %H:%M:%S").to_string(),
        message: "AWS Enterprise Dual-Engine Backup generated successfully!".to_string(),
    })
}

#[tauri::command]
pub fn sync_to_gdrive(state: State<'_, AppState>, folder_id: Option<String>) -> Result<AwsBackupResponse, String> {
    crate::commands::auth::require_screen_access("backup")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let folder = match folder_id {
        Some(ref f) if !f.trim().is_empty() => f.trim().to_string(),
        _ => {
            db.conn.query_row(
                "SELECT value FROM settings WHERE key = 'gdrive_folder_id'",
                [],
                |r| r.get(0),
            ).or_else(|_| {
                db.conn.query_row(
                    "SELECT value FROM settings WHERE key = 'gdrive_folder_url'",
                    [],
                    |r| r.get(0),
                )
            }).unwrap_or_else(|_| "https://drive.google.com".to_string())
        }
    };

    let clean_id = if folder.contains("folders/") {
        folder.split("folders/").nth(1)
            .and_then(|s| s.split('?').next())
            .unwrap_or(&folder)
            .to_string()
    } else {
        folder.clone()
    };

    let full_url = if clean_id.starts_with("http://") || clean_id.starts_with("https://") {
        clean_id.clone()
    } else if !clean_id.is_empty() {
        format!("https://drive.google.com/drive/folders/{}?usp=sharing", clean_id)
    } else {
        "https://drive.google.com".to_string()
    };

    if !clean_id.is_empty() {
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('gdrive_folder_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1",
            rusqlite::params![clean_id],
        );
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('gdrive_folder_url', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1",
            rusqlite::params![full_url],
        );
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('gdrive_auto_sync', 'true')
             ON CONFLICT(key) DO UPDATE SET value = 'true'",
            [],
        );
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('gdrive_connected', 'true')
             ON CONFLICT(key) DO UPDATE SET value = 'true'",
            [],
        );
    }

    // Create full backup (generates BOTH .billingbackup and master .xlsx)
    let record = BackupService::create_full_backup(&db, "auto")?;

    let now_str = chrono::Local::now().format("%d-%m-%Y %H:%M").to_string();
    let _ = db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('gdrive_last_sync', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        rusqlite::params![now_str],
    );

    let billing_downloads_dir = BackupService::get_backup_dir(&db);
    let package_path_obj = std::path::Path::new(&record.backup_path);

    let month_str = chrono::Local::now().format("%Y-%m").to_string();
    let excel_filename = format!("Billing_Backup_{}.xlsx", month_str);
    let excel_path = billing_downloads_dir.join(&excel_filename);
    let excel_path_str = if excel_path.exists() {
        excel_path.to_string_lossy().to_string()
    } else {
        "".to_string()
    };
    let excel_size = if excel_path.exists() {
        std::fs::metadata(&excel_path).map(|m| m.len() as i64).unwrap_or(0)
    } else {
        0
    };

    let package_name = package_path_obj
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("package.billingbackup")
        .to_string();

    let sha256 = BackupService::calculate_file_sha256(package_path_obj)
        .unwrap_or_default();

    // 1. Instantly launch user's default browser to Google Drive folder!
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &full_url])
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = open::that(&full_url);
    }

    // 2. Highlight generated Excel file in Windows Explorer for drag-and-drop
    if excel_path.exists() {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&excel_path)
                .spawn();
        }
    } else {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&record.backup_path)
                .spawn();
        }
    }

    Ok(AwsBackupResponse {
        package_path: record.backup_path,
        excel_path: excel_path_str,
        package_name,
        excel_name: excel_filename,
        package_size: record.size_bytes,
        excel_size,
        sha256,
        drive_url: full_url,
        timestamp: chrono::Local::now().format("%d-%m-%Y %H:%M:%S").to_string(),
        message: "Google Drive Cloud Vault opened in browser and backup files highlighted in Explorer!".to_string(),
    })
}

#[tauri::command]
pub fn check_daily_backup(_state: State<'_, AppState>) -> Result<Option<BackupRecord>, String> {
    // Automatic backup is disabled per user preference
    Ok(None)
}

#[tauri::command]
pub fn trigger_daily_backup_now(state: State<'_, AppState>) -> Result<BackupRecord, String> {
    crate::commands::auth::require_screen_access("backup")?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let record = BackupService::create_full_backup(&db, "manual")?;
    Ok(record)
}

#[tauri::command]
pub fn get_auto_backup_status(state: State<'_, AppState>) -> Result<crate::models::AutoBackupStatus, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    BackupService::get_auto_backup_status(&db)
}

#[tauri::command]
pub fn set_auto_backup_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    crate::commands::auth::require_admin()?;
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    db.conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_backup_enabled', ?1)",
        rusqlite::params![if enabled { "true" } else { "false" }],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_app_backups_folder(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    BackupService::open_app_backups_folder(&db)
}
