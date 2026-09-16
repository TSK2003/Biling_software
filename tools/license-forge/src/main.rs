use std::fs;
use std::path::Path;
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct LicensePayload {
    pub license_id: String,
    pub shop_name: String,
    pub license_type: String,
    pub max_activations: i32,
    pub features: Vec<String>,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub issuer: String,
    pub schema_version: i32,
}

fn print_usage() {
    println!("Billing Software License Forge - Offline USB Security Key Generator");
    println!("Usage:");
    println!("  keygen <output_dir>                 Generate a new Ed25519 keypair");
    println!("  create <private_key_hex> <shop_name> <output_file> [type] [expires_rfc3339]");
    println!("  prepare-usb <license_file> <drive_path> [usb_id]");
    println!("  verify <public_key_hex> <license_file>");
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        print_usage();
        return;
    }

    match args[1].as_str() {
        "keygen" => {
            let out_dir = args.get(2).map(|s| s.as_str()).unwrap_or(".");
            let mut csprng = OsRng;
            let signing_key = SigningKey::generate(&mut csprng);
            let verifying_key = signing_key.verifying_key();

            let priv_hex = hex::encode(signing_key.to_bytes());
            let pub_hex = hex::encode(verifying_key.to_bytes());

            fs::create_dir_all(out_dir).unwrap();
            fs::write(Path::new(out_dir).join("aescion_private.key"), &priv_hex).unwrap();
            fs::write(Path::new(out_dir).join("aescion_public.key"), &pub_hex).unwrap();

            println!("✓ Keys generated successfully:");
            println!("  Private Key (KEEP SECRET): {}", priv_hex);
            println!("  Public Key (Embed in App):  {}", pub_hex);
        }
        "create" => {
            if args.len() < 5 {
                println!("Error: Missing arguments for create");
                print_usage();
                return;
            }
            let priv_hex = &args[2];
            let shop_name = &args[3];
            let out_file = &args[4];
            let lic_type = args.get(5).map(|s| s.as_str()).unwrap_or("lifetime");
            let expires_at = args.get(6).cloned();

            let priv_bytes = hex::decode(priv_hex.trim()).expect("Invalid private key hex");
            let signing_key = SigningKey::from_bytes(priv_bytes.as_slice().try_into().expect("32 bytes required"));

            let license_id = uuid::Uuid::new_v4().to_string();
            let payload = LicensePayload {
                license_id,
                shop_name: shop_name.to_string(),
                license_type: lic_type.to_string(),
                max_activations: 1,
                features: vec![
                    "billing".to_string(),
                    "products".to_string(),
                    "reports".to_string(),
                    "backup".to_string(),
                    "gdrive".to_string(),
                ],
                issued_at: chrono::Utc::now().to_rfc3339(),
                expires_at,
                issuer: "Billing Software Systems".to_string(),
                schema_version: 1,
            };

            let payload_json = serde_json::to_vec(&payload).expect("Serialization failed");
            let signature = signing_key.sign(&payload_json);

            let mut final_blob = Vec::new();
            final_blob.extend_from_slice(&payload_json);
            final_blob.extend_from_slice(&signature.to_bytes());

            if let Some(parent) = Path::new(out_file).parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(out_file, final_blob).expect("Failed to write license file");

            println!("✓ Signed license created successfully: {}", out_file);
            println!("  License ID: {}", payload.license_id);
            println!("  Shop:       {}", payload.shop_name);
            println!("  Type:       {}", payload.license_type);
        }
        "prepare-usb" => {
            if args.len() < 4 {
                println!("Error: Missing arguments for prepare-usb");
                print_usage();
                return;
            }
            let license_file = &args[2];
            let drive_path = Path::new(&args[3]);
            let usb_id = args.get(4).map(|s| s.as_str()).unwrap_or("BILLING-USB-KEY-001");

            let target_dir = drive_path.join("BILLING_KEY");
            fs::create_dir_all(&target_dir).expect("Failed to create BILLING_KEY directory on drive");

            let target_license = target_dir.join("license.bin");
            fs::copy(license_file, &target_license).expect("Failed to copy license.bin to USB");

            let metadata = serde_json::json!({
                "usb_id": usb_id,
                "prepared_at": chrono::Utc::now().to_rfc3339(),
                "issuer": "Billing Software Security Key Preparer"
            });
            fs::write(target_dir.join("usb.json"), metadata.to_string()).unwrap();

            println!("✓ Billing Software Security USB prepared at: {}", target_dir.display());
            println!("  Files written: license.bin, usb.json");
        }
        "verify" => {
            if args.len() < 4 {
                println!("Error: Missing arguments for verify");
                print_usage();
                return;
            }
            let pub_hex = &args[2];
            let license_file = &args[3];

            let pub_bytes = hex::decode(pub_hex.trim()).expect("Invalid public key hex");
            let verifying_key = VerifyingKey::from_bytes(pub_bytes.as_slice().try_into().expect("32 bytes required"))
                .expect("Invalid verifying key");

            let bytes = fs::read(license_file).expect("Failed to read license file");
            if bytes.len() <= 64 {
                println!("✗ Invalid license file (too short)");
                return;
            }

            let payload_len = bytes.len() - 64;
            let payload_bytes = &bytes[..payload_len];
            let signature_bytes = &bytes[payload_len..];

            let signature = ed25519_dalek::Signature::from_slice(signature_bytes).expect("Invalid signature format");

            match verifying_key.verify(payload_bytes, &signature) {
                Ok(_) => {
                    let payload: LicensePayload = serde_json::from_slice(payload_bytes).expect("Invalid JSON payload");
                    println!("✓ Signature is VALID!");
                    println!("{:#?}", payload);
                }
                Err(e) => {
                    println!("✗ Verification FAILED: {}", e);
                }
            }
        }
        _ => {
            print_usage();
        }
    }
}
