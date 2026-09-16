use std::env;
use std::path::Path;
use aescion_pos_lib::services::licensing_service::write_usb_security_key;

fn main() {
    let args: Vec<String> = env::args().collect();
    let raw_drive = args.get(1).map(|s| s.trim()).unwrap_or(".");
    let shop_name = args.get(2).map(|s| s.trim()).unwrap_or("Billing APP Shop");

    // Normalize Windows drive letter (e.g. "E" -> "E:\", "E:" -> "E:\", "E:\" -> "E:\")
    let normalized_drive = if raw_drive.len() == 1 && raw_drive.chars().next().unwrap().is_alphabetic() {
        format!("{}:\\", raw_drive.to_uppercase())
    } else if raw_drive.len() == 2 && raw_drive.ends_with(':') {
        format!("{}\\", raw_drive.to_uppercase())
    } else if raw_drive.len() == 3 && raw_drive.ends_with(":\\") {
        raw_drive.to_uppercase()
    } else if raw_drive.len() == 3 && raw_drive.ends_with(":/") {
        format!("{}\\", &raw_drive[..2].to_uppercase())
    } else {
        raw_drive.to_string()
    };

    let drive_path = Path::new(&normalized_drive);
    println!("=========================================================");
    println!("  Billing APP — Hardware USB Security Key Creator");
    println!("=========================================================");
    println!("Target Pen Drive : {:?}", drive_path);
    println!("Customer Shop    : {}", shop_name);
    println!("License Security : Ed25519 Cryptographic Hardware License");
    println!("License Type     : Perpetual (Offline Lifetime)");
    println!("---------------------------------------------------------");

    match write_usb_security_key(drive_path, shop_name, "perpetual") {
        Ok(msg) => {
            println!("SUCCESS: {}", msg);
            println!("---------------------------------------------------------");
            println!("{:?}\\AESCION_KEY\\license.bin created successfully.", drive_path);
            println!("Cryptographic signature verified and sealed with master seed.");
            println!("Plug this USB Pen Drive into the computer and open Billing APP to activate.");
            println!("=========================================================");
        }
        Err(err) => {
            eprintln!("FAILED to create USB Security Key on {:?}: {}", drive_path, err);
            eprintln!("Tip: Make sure the USB Pen Drive is plugged in and accessible.");
        }
    }
}
