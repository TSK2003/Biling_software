use std::path::Path;
use tauri::State;
use crate::AppState;
use crate::models::{DriveInfo, LicenseStatus, USBKeyInfo};
use crate::services::{licensing_service, usb_service};

/// Check current license/activation status
#[tauri::command]
pub fn check_license(state: State<'_, AppState>) -> Result<LicenseStatus, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let activation_file = db.activation_dir().join("activation.dat");
    let status = licensing_service::check_local_activation(&activation_file);
    Ok(status)
}

/// Detect connected AESCION security USB key
#[tauri::command]
pub fn detect_usb_key() -> Result<Option<USBKeyInfo>, String> {
    let info = usb_service::find_aescion_usb_key();
    Ok(info)
}

/// Get all connected drives with detection info
#[tauri::command]
pub fn get_all_drives() -> Result<Vec<DriveInfo>, String> {
    Ok(usb_service::get_connected_drives())
}


/// Activate license using a detected USB drive
#[tauri::command]
pub fn activate_license(state: State<'_, AppState>, drive_letter: String) -> Result<LicenseStatus, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    
    let drive_path = Path::new(&drive_letter);
    let usb_info = usb_service::check_drive_for_key(drive_path)
        .ok_or_else(|| "No AESCION Security Key found on the specified drive".to_string())?;

    if !usb_info.is_valid {
        return Err(usb_info.message);
    }

    let activation_file = db.activation_dir().join("activation.dat");
    let status = licensing_service::activate_device(&usb_info.license, &activation_file)?;

    // Also persist record into SQLite for settings display convenience
    let features_json = serde_json::to_string(&usb_info.license.features).unwrap_or_else(|_| "[]".to_string());
    let _ = db.conn.execute(
        "INSERT OR REPLACE INTO license_activations 
         (license_id, shop_name, license_type, features_json, device_id_hash, max_activations, activated_at, expires_at, app_version, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
        rusqlite::params![
            usb_info.license.license_id,
            usb_info.license.shop_name,
            usb_info.license.license_type,
            features_json,
            status.license_id.as_deref().unwrap_or("DEV"),
            usb_info.license.max_activations,
            status.activated_at.as_deref().unwrap_or(""),
            status.expires_at.as_deref(),
            "0.1.0"
        ],
    );

    // Audit log
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type, details_json) VALUES ('activate', 'license', ?1)",
        rusqlite::params![format!("{{\"shop\":\"{}\",\"license_id\":\"{}\"}}", usb_info.license.shop_name, usb_info.license.license_id)],
    );

    Ok(status)
}

/// Activate license using a manual License Code / Activation Key (e.g. AESCION-PRO-2026)
#[tauri::command]
pub fn activate_with_code(state: State<'_, AppState>, code: String, shop_name: Option<String>) -> Result<LicenseStatus, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let code_clean = code.trim().to_uppercase();
    
    let shop = shop_name.unwrap_or_else(|| "Authorized Shop".to_string()).trim().to_string();
    if shop.is_empty() {
        return Err("Shop Name is required for activation".to_string());
    }
    
    let is_valid = code_clean.starts_with("AESCION-") || code_clean.len() >= 10;
    if !is_valid {
        return Err("Invalid License Key format. Key must start with AESCION- (e.g. AESCION-PRO-2026)".to_string());
    }

    use crate::models::LicensePayload;
    let payload = LicensePayload {
        license_id: code_clean.clone(),
        shop_name: shop.clone(),
        license_type: "perpetual".to_string(),
        max_activations: 1,
        features: vec!["pos".to_string(), "billing".to_string(), "reports".to_string(), "network".to_string()],
        issued_at: chrono::Utc::now().to_rfc3339(),
        expires_at: None,
        issuer: "AESCION TECHNOLOGIES".to_string(),
        schema_version: 1,
    };

    let activation_file = db.activation_dir().join("activation.dat");
    let status = licensing_service::activate_device(&payload, &activation_file)?;

    // Persist into SQLite
    let _ = db.conn.execute(
        "INSERT OR REPLACE INTO license_activations 
         (license_id, shop_name, license_type, features_json, device_id_hash, max_activations, activated_at, app_version, is_active)
         VALUES (?1, ?2, 'perpetual', '[\"pos\",\"billing\",\"reports\",\"network\"]', ?3, 1, ?4, '0.1.0', 1)",
        rusqlite::params![
            code_clean,
            shop,
            status.license_id.as_deref().unwrap_or("DEV"),
            status.activated_at.as_deref().unwrap_or(""),
        ],
    );
    
    // Also update settings shop_name if empty
    let _ = db.conn.execute(
        "UPDATE settings SET value = ?1 WHERE key = 'shop_name' AND (value = 'AESCION POS' OR value = 'Fruit Shop')",
        rusqlite::params![shop],
    );

    Ok(status)
}

/// Get license information for settings page
#[tauri::command]
pub fn get_license_info(state: State<'_, AppState>) -> Result<LicenseStatus, String> {
    check_license(state)
}

/// Deactivate license (admin only)
#[tauri::command]
pub fn deactivate_license(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let activation_file = db.activation_dir().join("activation.dat");
    if activation_file.exists() {
        std::fs::remove_file(&activation_file).map_err(|e| format!("Failed to remove activation file: {}", e))?;
    }

    let _ = db.conn.execute("UPDATE license_activations SET is_active = 0, deactivated_at = datetime('now') WHERE is_active = 1", []);
    
    let _ = db.conn.execute(
        "INSERT INTO audit_logs (action, entity_type) VALUES ('deactivate', 'license')",
        [],
    );

    Ok(())
}

/// Admin tool to write and format an official AESCION Security USB Pen Drive for any shop
#[tauri::command]
pub fn create_security_usb_key(drive_letter: String, shop_name: String, license_type: Option<String>) -> Result<String, String> {
    let drive_path = Path::new(&drive_letter);
    if !drive_path.exists() {
        return Err(format!("Drive {:?} not found or disconnected", drive_path));
    }
    
    let l_type = license_type.unwrap_or_else(|| "perpetual".to_string());
    licensing_service::write_usb_security_key(drive_path, &shop_name, &l_type)
}
