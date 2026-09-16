use std::path::Path;
use std::fs;
use ed25519_dalek::{Signature, SigningKey, Signer, Verifier, VerifyingKey};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use chrono::{DateTime, Utc};

use crate::models::{ActivationRecord, LicensePayload, LicenseStatus};
use super::device_service::get_device_fingerprint;

/// Derives the master signing key from secure master seed
pub fn get_master_signing_key() -> SigningKey {
    let mut hasher = Sha256::new();
    hasher.update(b"BILLING-SOFTWARE-OFFLINE-SECURITY-SIGNING-MASTER-KEY-2026");
    let seed: [u8; 32] = hasher.finalize().into();
    SigningKey::from_bytes(&seed)
}

/// Legacy fallback signing key for backward compatibility
pub fn get_legacy_signing_key() -> SigningKey {
    let mut hasher = Sha256::new();
    hasher.update(b"AESCION-POS-OFFLINE-SECURITY-SIGNING-MASTER-KEY-2026");
    let seed: [u8; 32] = hasher.finalize().into();
    SigningKey::from_bytes(&seed)
}

/// Creates a cryptographically signed license file blob
pub fn create_signed_license_blob(payload: &LicensePayload) -> Result<Vec<u8>, String> {
    let signing_key = get_master_signing_key();
    let payload_bytes = serde_json::to_vec(payload)
        .map_err(|e| format!("Failed to serialize license payload: {}", e))?;
    
    let signature = signing_key.sign(&payload_bytes);
    
    let mut blob = Vec::with_capacity(payload_bytes.len() + 64);
    blob.extend_from_slice(&payload_bytes);
    blob.extend_from_slice(&signature.to_bytes());
    
    Ok(blob)
}

/// Helper to write a security key directly to a USB drive root (BILLING_KEY/license.bin)
pub fn write_usb_security_key(root_path: &Path, shop_name: &str, license_type: &str) -> Result<String, String> {
    let payload = LicensePayload {
        license_id: format!("LIC-BILLING-{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase()),
        shop_name: shop_name.trim().to_string(),
        license_type: license_type.trim().to_string(),
        max_activations: 1,
        features: vec!["pos".to_string(), "billing".to_string(), "reports".to_string(), "network".to_string()],
        issued_at: Utc::now().to_rfc3339(),
        expires_at: None,
        issuer: "Billing Software".to_string(),
        schema_version: 1,
    };

    let blob = create_signed_license_blob(&payload)?;
    let key_dir = root_path.join("BILLING_KEY");
    fs::create_dir_all(&key_dir).map_err(|e| format!("Failed to create BILLING_KEY directory on drive: {}", e))?;
    
    let license_file = key_dir.join("license.bin");
    fs::write(&license_file, blob).map_err(|e| format!("Failed to write license.bin: {}", e))?;

    Ok(format!("Security USB Key successfully created for {} on {:?}", shop_name, root_path))
}

/// Verifies an Ed25519 signed license blob
pub fn verify_license_blob(bytes: &[u8]) -> Result<LicensePayload, String> {
    if bytes.len() <= 64 {
        return Err("License file is too small or corrupt".to_string());
    }

    let payload_len = bytes.len() - 64;
    let payload_bytes = &bytes[..payload_len];
    let signature_bytes = &bytes[payload_len..];

    // Master verifying key derived from master signing key
    let verifying_key: VerifyingKey = get_master_signing_key().verifying_key();
    let legacy_key: VerifyingKey = get_legacy_signing_key().verifying_key();

    // Parse signature
    let signature = Signature::from_slice(signature_bytes)
        .map_err(|e| format!("Invalid signature format: {}", e))?;

    // Verify signature against current master key, with legacy fallback
    if verifying_key.verify(payload_bytes, &signature).is_err() && legacy_key.verify(payload_bytes, &signature).is_err() {
        return Err("Cryptographic signature verification failed. Unauthorized security USB key.".to_string());
    }

    // Parse JSON payload
    let payload: LicensePayload = serde_json::from_slice(payload_bytes)
        .map_err(|e| format!("Invalid license metadata JSON: {}", e))?;

    // Check expiration if set
    if let Some(ref exp) = payload.expires_at {
        if let Ok(exp_date) = DateTime::parse_from_rfc3339(exp) {
            if Utc::now() > exp_date.with_timezone(&Utc) {
                return Err("License has expired".to_string());
            }
        }
    }

    Ok(payload)
}

/// Derives a 32-byte AES-GCM key from the hardware fingerprint
fn derive_device_key(device_fingerprint: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(b"BILLING-SOFTWARE-SALT-2026"), device_fingerprint.as_bytes());
    let mut okm = [0u8; 32];
    hk.expand(b"BILLING-ACTIVATION-KEY", &mut okm)
        .expect("32 bytes is valid length for HKDF");
    okm
}

/// Fallback legacy device key derivation
fn derive_legacy_device_key(device_fingerprint: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(b"AESCION-POS-SALT-2026"), device_fingerprint.as_bytes());
    let mut okm = [0u8; 32];
    hk.expand(b"AESCION-ACTIVATION-KEY", &mut okm)
        .expect("32 bytes is valid length for HKDF");
    okm
}

/// Checks the local activation record against current hardware
pub fn check_local_activation(activation_file: &Path) -> LicenseStatus {
    if !activation_file.exists() {
        return LicenseStatus {
            state: "NOT_ACTIVATED".to_string(),
            license_id: None,
            shop_name: None,
            license_type: None,
            activated_at: None,
            expires_at: None,
            app_version: None,
            message: Some("Application is not activated. Please insert your Security Pen Drive.".to_string()),
        };
    }

    let encrypted_data = match fs::read(activation_file) {
        Ok(data) => data,
        Err(e) => {
            return LicenseStatus {
                state: "ACTIVATION_REQUIRED".to_string(),
                license_id: None,
                shop_name: None,
                license_type: None,
                activated_at: None,
                expires_at: None,
                app_version: None,
                message: Some(format!("Failed to read activation file: {}", e)),
            };
        }
    };

    if encrypted_data.len() < 12 {
        return LicenseStatus {
            state: "TAMPER_DETECTED".to_string(),
            license_id: None,
            shop_name: None,
            license_type: None,
            activated_at: None,
            expires_at: None,
            app_version: None,
            message: Some("Activation record is corrupted or tampered.".to_string()),
        };
    }

    let current_fingerprint = get_device_fingerprint();
    let key = derive_device_key(&current_fingerprint);
    let cipher = Aes256Gcm::new_from_slice(&key).expect("32 bytes is valid AES-256 key");

    let nonce = Nonce::from_slice(&encrypted_data[..12]);
    let ciphertext = &encrypted_data[12..];

    let plaintext = match cipher.decrypt(nonce, ciphertext) {
        Ok(pt) => pt,
        Err(_) => {
            // Try legacy cipher
            let legacy_key = derive_legacy_device_key(&current_fingerprint);
            let legacy_cipher = Aes256Gcm::new_from_slice(&legacy_key).expect("32 bytes is valid AES-256 key");
            match legacy_cipher.decrypt(nonce, ciphertext) {
                Ok(pt) => pt,
                Err(_) => {
                    // Decryption failed on both current and legacy keys
                    return LicenseStatus {
                        state: "DEVICE_MISMATCH".to_string(),
                        license_id: None,
                        shop_name: None,
                        license_type: None,
                        activated_at: None,
                        expires_at: None,
                        app_version: None,
                        message: Some("This installation is bound to another device. Please re-activate using your Security Pen Drive.".to_string()),
                    };
                }
            }
        }
    };

    let record: ActivationRecord = match serde_json::from_slice(&plaintext) {
        Ok(rec) => rec,
        Err(_) => {
            return LicenseStatus {
                state: "TAMPER_DETECTED".to_string(),
                license_id: None,
                shop_name: None,
                license_type: None,
                activated_at: None,
                expires_at: None,
                app_version: None,
                message: Some("Activation payload verification failed.".to_string()),
            };
        }
    };

    // Verify embedded fingerprint
    if record.device_id_hash != current_fingerprint {
        return LicenseStatus {
            state: "DEVICE_MISMATCH".to_string(),
            license_id: Some(record.license_id),
            shop_name: Some(record.shop_name),
            license_type: Some(record.license_type),
            activated_at: Some(record.activated_at),
            expires_at: record.expires_at,
            app_version: Some(record.app_version),
            message: Some("Hardware fingerprint mismatch. Re-activation required.".to_string()),
        };
    }

    // Check expiration if applicable
    if let Some(ref exp) = record.expires_at {
        if let Ok(exp_date) = DateTime::parse_from_rfc3339(exp) {
            if Utc::now() > exp_date.with_timezone(&Utc) {
                return LicenseStatus {
                    state: "LICENSE_EXPIRED".to_string(),
                    license_id: Some(record.license_id),
                    shop_name: Some(record.shop_name),
                    license_type: Some(record.license_type),
                    activated_at: Some(record.activated_at),
                    expires_at: record.expires_at,
                    app_version: Some(record.app_version),
                    message: Some("Your license has expired. Please contact support for renewal.".to_string()),
                };
            }
        }
    }

    LicenseStatus {
        state: "ACTIVE".to_string(),
        license_id: Some(record.license_id),
        shop_name: Some(record.shop_name),
        license_type: Some(record.license_type),
        activated_at: Some(record.activated_at),
        expires_at: record.expires_at,
        app_version: Some(record.app_version),
        message: Some("Activated and verified".to_string()),
    }
}

/// Activates this device with the provided license payload
pub fn activate_device(
    payload: &LicensePayload,
    activation_file: &Path,
) -> Result<LicenseStatus, String> {
    let current_fingerprint = get_device_fingerprint();
    let now_str = Utc::now().to_rfc3339();

    let record = ActivationRecord {
        license_id: payload.license_id.clone(),
        shop_name: payload.shop_name.clone(),
        device_id_hash: current_fingerprint.clone(),
        license_type: payload.license_type.clone(),
        features: payload.features.clone(),
        activated_at: now_str,
        expires_at: payload.expires_at.clone(),
        app_version: "0.1.0".to_string(),
        schema_version: 1,
    };

    let plaintext = serde_json::to_vec(&record)
        .map_err(|e| format!("Serialization error: {}", e))?;

    let key = derive_device_key(&current_fingerprint);
    let cipher = Aes256Gcm::new_from_slice(&key).expect("32 bytes is valid AES-256 key");

    use rand::RngCore;
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
        .map_err(|e| format!("Encryption error: {}", e))?;

    let mut final_data = Vec::with_capacity(12 + ciphertext.len());
    final_data.extend_from_slice(&nonce_bytes);
    final_data.extend_from_slice(&ciphertext);

    // Write to file
    if let Some(parent) = activation_file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Dir creation error: {}", e))?;
    }
    fs::write(activation_file, final_data)
        .map_err(|e| format!("Failed to write activation file: {}", e))?;

    Ok(check_local_activation(activation_file))
}
