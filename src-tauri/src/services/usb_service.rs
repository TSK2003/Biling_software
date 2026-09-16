use std::path::Path;
use sysinfo::Disks;
use crate::models::{LicensePayload, USBKeyInfo};
use super::licensing_service::verify_license_blob;

/// Finds any connected USB drive that contains an AESCION_KEY folder with license.bin
pub fn find_aescion_usb_key() -> Option<USBKeyInfo> {
    let disks = Disks::new_with_refreshed_list();
    
    for disk in disks.list() {
        let mount_point = disk.mount_point();
        if let Some(info) = check_drive_for_key(mount_point) {
            return Some(info);
        }
    }
    
    // Also check standard Windows drive letters as fallback (D:, E:, F:, G:, H:, etc.)
    #[cfg(target_os = "windows")]
    {
        for letter in b'D'..=b'Z' {
            let drive_str = format!("{}:\\", letter as char);
            let path = Path::new(&drive_str);
            if path.exists() {
                if let Some(info) = check_drive_for_key(path) {
                    return Some(info);
                }
            }
        }
    }
    
    None
}

/// Checks a specific root path for AESCION_KEY/license.bin
pub fn check_drive_for_key(root: &Path) -> Option<USBKeyInfo> {
    let key_dir = root.join("AESCION_KEY");
    let license_file = key_dir.join("license.bin");
    
    if !license_file.exists() {
        return None;
    }

    let drive_letter = root.to_string_lossy().to_string();
    
    match std::fs::read(&license_file) {
        Ok(bytes) => {
            match verify_license_blob(&bytes) {
                Ok(payload) => Some(USBKeyInfo {
                    drive_letter,
                    license: payload,
                    is_valid: true,
                    message: "Valid AESCION Security Key detected".to_string(),
                }),
                Err(err) => Some(USBKeyInfo {
                    drive_letter,
                    license: LicensePayload {
                        license_id: String::new(),
                        shop_name: "Corrupted/Invalid".to_string(),
                        license_type: String::new(),
                        max_activations: 0,
                        features: vec![],
                        issued_at: String::new(),
                        expires_at: None,
                        issuer: String::new(),
                        schema_version: 1,
                    },
                    is_valid: false,
                    message: format!("Invalid security key: {}", err),
                }),
            }
        }
        Err(e) => Some(USBKeyInfo {
            drive_letter,
            license: LicensePayload {
                license_id: String::new(),
                shop_name: "Read Error".to_string(),
                license_type: String::new(),
                max_activations: 0,
                features: vec![],
                issued_at: String::new(),
                expires_at: None,
                issuer: String::new(),
                schema_version: 1,
            },
            is_valid: false,
            message: format!("Failed to read license file: {}", e),
        }),
    }
}
