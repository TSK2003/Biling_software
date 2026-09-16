use sha2::{Digest, Sha256};
use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct Win32ComputerSystemProduct {
    UUID: Option<String>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct Win32BaseBoard {
    SerialNumber: Option<String>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct Win32Processor {
    ProcessorId: Option<String>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct Win32BIOS {
    SerialNumber: Option<String>,
}

/// Generates a stable hardware device fingerprint hash on Windows
pub fn get_device_fingerprint() -> String {
    #[cfg(target_os = "windows")]
    {
        get_windows_fingerprint()
    }
    #[cfg(not(target_os = "windows"))]
    {
        get_fallback_fingerprint()
    }
}

#[cfg(target_os = "windows")]
fn get_windows_fingerprint() -> String {
    let mut system_uuid = "UNKNOWN_UUID".to_string();
    let mut baseboard_serial = "UNKNOWN_BASEBOARD".to_string();
    let mut processor_id = "UNKNOWN_CPU".to_string();
    let mut bios_serial = "UNKNOWN_BIOS".to_string();

    // Query WMI
    if let Ok(com_lib) = wmi::COMLibrary::new() {
        if let Ok(wmi_con) = wmi::WMIConnection::new(com_lib) {
            if let Ok(results) = wmi_con.query::<Win32ComputerSystemProduct>() {
                if let Some(item) = results.into_iter().next() {
                    if let Some(val) = item.UUID {
                        let cleaned = val.trim().to_string();
                        if !cleaned.is_empty() && cleaned != "None" {
                            system_uuid = cleaned;
                        }
                    }
                }
            }

            if let Ok(results) = wmi_con.query::<Win32BaseBoard>() {
                if let Some(item) = results.into_iter().next() {
                    if let Some(val) = item.SerialNumber {
                        let cleaned = val.trim().to_string();
                        if !cleaned.is_empty() && cleaned != "None" && cleaned != "To Be Filled By O.E.M." {
                            baseboard_serial = cleaned;
                        }
                    }
                }
            }

            if let Ok(results) = wmi_con.query::<Win32Processor>() {
                if let Some(item) = results.into_iter().next() {
                    if let Some(val) = item.ProcessorId {
                        let cleaned = val.trim().to_string();
                        if !cleaned.is_empty() && cleaned != "None" {
                            processor_id = cleaned;
                        }
                    }
                }
            }

            if let Ok(results) = wmi_con.query::<Win32BIOS>() {
                if let Some(item) = results.into_iter().next() {
                    if let Some(val) = item.SerialNumber {
                        let cleaned = val.trim().to_string();
                        if !cleaned.is_empty() && cleaned != "None" && cleaned != "To Be Filled By O.E.M." {
                            bios_serial = cleaned;
                        }
                    }
                }
            }
        }
    }

    let combined = format!(
        "AESCION-POS-HWID:{}:{}:{}:{}",
        system_uuid, baseboard_serial, processor_id, bios_serial
    );

    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(not(target_os = "windows"))]
fn get_fallback_fingerprint() -> String {
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "DEV_HOST".to_string());
    
    let combined = format!("AESCION-POS-FALLBACK:{}", hostname);
    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    format!("{:x}", hasher.finalize())
}
