use std::path::{Path, PathBuf};
use sysinfo::Disks;
use crate::models::{DriveInfo, LicensePayload, USBKeyInfo};
use super::licensing_service::verify_license_blob;

/// Normalize any drive path format (e.g. "F", "F:", "F:\", "f:/") into a proper Windows root ("F:\")
pub fn normalize_drive_path(root: &Path) -> (String, PathBuf) {
    let root_str = root.to_string_lossy().trim().to_string();
    let normalized = if root_str.len() == 1 && root_str.chars().next().map_or(false, |c| c.is_ascii_alphabetic()) {
        format!("{}:\\", root_str.to_uppercase())
    } else if root_str.len() == 2 && root_str.ends_with(':') {
        format!("{}\\", root_str.to_uppercase())
    } else if root_str.len() >= 2 && !root_str.ends_with('\\') && !root_str.ends_with('/') {
        format!("{}\\", root_str)
    } else {
        root_str
    };

    let path_buf = PathBuf::from(&normalized);
    (normalized, path_buf)
}

/// Finds any connected USB drive that contains a Billing security key license.bin
pub fn find_billing_usb_key() -> Option<USBKeyInfo> {
    // 1. Check all mounted disks reported by sysinfo
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.list() {
        let mount_point = disk.mount_point();
        if let Some(info) = check_drive_for_key(mount_point) {
            return Some(info);
        }
    }
    
    // 2. Comprehensive check across all Windows drive letters A: through Z:
    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
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

/// Backwards-compatible alias for find_billing_usb_key
pub fn find_aescion_usb_key() -> Option<USBKeyInfo> {
    find_billing_usb_key()
}

/// Checks a specific root path for BILLING_KEY/license.bin or license.bin
pub fn check_drive_for_key(root: &Path) -> Option<USBKeyInfo> {
    let (drive_letter, base_path) = normalize_drive_path(root);

    // Candidates in priority order:
    let candidate_paths = [
        base_path.join("BILLING_KEY").join("license.bin"),
        base_path.join("billing_key").join("license.bin"),
        base_path.join("AESCION_KEY").join("license.bin"),
        base_path.join("aescion_key").join("license.bin"),
        base_path.join("license.bin"),
    ];

    let license_file = candidate_paths.into_iter().find(|p| p.exists())?;

    match std::fs::read(&license_file) {
        Ok(bytes) => {
            match verify_license_blob(&bytes) {
                Ok(payload) => Some(USBKeyInfo {
                    drive_letter,
                    license: payload,
                    is_valid: true,
                    message: "Valid Security Pen Drive detected".to_string(),
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

/// Retrieves all connected drives on the system with detection metadata
pub fn get_connected_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut results = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let letter_char = letter as char;
            let drive_str = format!("{}:\\", letter_char);
            let path = Path::new(&drive_str);
            if !path.exists() {
                continue;
            }

            // Find matching disk from sysinfo for volume label & size
            let disk_match = disks.list().iter().find(|d| {
                let mp = d.mount_point().to_string_lossy().to_uppercase();
                mp.starts_with(&format!("{}:", letter_char))
            });

            let raw_label = disk_match
                .map(|d| d.name().to_string_lossy().to_string())
                .unwrap_or_default();

            let label = if !raw_label.trim().is_empty() {
                raw_label.trim().to_string()
            } else if letter_char == 'C' {
                "Local Disk (System)".to_string()
            } else if letter_char == 'D' {
                "Local Disk (Data)".to_string()
            } else {
                format!("Removable Drive ({}:)", letter_char)
            };

            let is_removable = disk_match.map(|d| d.is_removable()).unwrap_or(letter_char >= 'E');
            let total_gb = disk_match.map(|d| (d.total_space() as f64) / 1_073_741_824.0).unwrap_or(0.0);
            let free_gb = disk_match.map(|d| (d.available_space() as f64) / 1_073_741_824.0).unwrap_or(0.0);

            let key_info = check_drive_for_key(path);
            let has_key = key_info.as_ref().map(|k| k.is_valid).unwrap_or(false);

            results.push(DriveInfo {
                letter: drive_str,
                label,
                is_removable,
                total_gb: (total_gb * 10.0).round() / 10.0,
                free_gb: (free_gb * 10.0).round() / 10.0,
                has_key,
                key_info,
            });
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for disk in disks.list() {
            let path = disk.mount_point();
            let key_info = check_drive_for_key(path);
            let has_key = key_info.as_ref().map(|k| k.is_valid).unwrap_or(false);
            results.push(DriveInfo {
                letter: path.to_string_lossy().to_string(),
                label: disk.name().to_string_lossy().to_string(),
                is_removable: disk.is_removable(),
                total_gb: ((disk.total_space() as f64) / 1_073_741_824.0 * 10.0).round() / 10.0,
                free_gb: ((disk.available_space() as f64) / 1_073_741_824.0 * 10.0).round() / 10.0,
                has_key,
                key_info,
            });
        }
    }

    results
}
