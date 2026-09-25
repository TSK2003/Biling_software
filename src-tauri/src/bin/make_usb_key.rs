use std::env;
use std::io::{self, Write};
use std::path::Path;
use billing_software_lib::services::licensing_service::write_usb_security_key;
use billing_software_lib::services::usb_service::get_connected_drives;

fn normalize_drive(raw: &str) -> String {
    let s = raw.trim();
    if s.len() == 1 && s.chars().next().map_or(false, |c| c.is_ascii_alphabetic()) {
        format!("{}:\\", s.to_uppercase())
    } else if s.len() == 2 && s.ends_with(':') {
        format!("{}\\", s.to_uppercase())
    } else if s.len() >= 2 && !s.ends_with('\\') && !s.ends_with('/') {
        format!("{}\\", s.to_uppercase())
    } else {
        s.to_string()
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    
    println!("==================================================================");
    println!("   Billing Software — Master Hardware Security Key Generator");
    println!("          [CONFIDENTIAL — VENDOR / DEVELOPER TOOL ONLY]           ");
    println!("==================================================================");

    let (drive_str, shop_name) = if args.len() >= 3 {
        (normalize_drive(&args[1]), args[2].trim().to_string())
    } else if args.len() == 2 && args[1] != "--help" && args[1] != "-h" {
        (normalize_drive(&args[1]), "Authorized Shop".to_string())
    } else {
        // Interactive Mode: List all connected drives
        println!("Scanning connected drives on this computer...\n");
        let drives = get_connected_drives();
        
        if drives.is_empty() {
            println!("  No external storage drives detected.");
        } else {
            println!("Available Connected Drives:");
            for d in &drives {
                let type_str = if d.is_removable { "USB Removable" } else { "Disk" };
                let key_str = if d.has_key { " [HAS EXISTING KEY]" } else { "" };
                println!("  • {} — {} ({:.1} GB) [{}]{}", d.letter, d.label, d.total_gb, type_str, key_str);
            }
        }
        
        println!("\n------------------------------------------------------------------");
        print!("Enter Target Pen Drive Letter (e.g. E, F, S): ");
        let _ = io::stdout().flush();
        let mut input_drive = String::new();
        if io::stdin().read_line(&mut input_drive).is_err() || input_drive.trim().is_empty() {
            eprintln!("Error: Drive letter is required.");
            return;
        }

        print!("Enter Customer Shop Name: ");
        let _ = io::stdout().flush();
        let mut input_shop = String::new();
        if io::stdin().read_line(&mut input_shop).is_err() || input_shop.trim().is_empty() {
            input_shop = "Authorized Shop".to_string();
        }

        (normalize_drive(&input_drive), input_shop.trim().to_string())
    };

    let drive_path = Path::new(&drive_str);
    if !drive_path.exists() {
        eprintln!("\nERROR: Target drive {:?} does not exist or is not connected.", drive_path);
        eprintln!("Please insert the Pen Drive and verify its drive letter in Windows Explorer.");
        std::process::exit(1);
    }

    println!("\nTarget Pen Drive : {:?}", drive_path);
    println!("Customer Shop    : {}", shop_name);
    println!("Security Standard: Ed25519 Cryptographic Master Signature");
    println!("License Duration : Perpetual (Offline Lifetime)");
    println!("------------------------------------------------------------------");

    match write_usb_security_key(drive_path, &shop_name, "perpetual") {
        Ok(_) => {
            let key_path = drive_path.join("BILLING_KEY").join("license.bin");
            println!("SUCCESS: Official Security Key generated successfully!");
            println!("------------------------------------------------------------------");
            println!("File Location    : {:?}", key_path);
            println!("Status           : Cryptographically sealed with Vendor Master Seed");
            println!("\nInstruction:");
            println!("Hand this Pen Drive to the client. When they plug it in, Billing Software");
            println!("will automatically verify and activate their machine.");
            println!("==================================================================");
        }
        Err(err) => {
            eprintln!("\nFAILED to write security key to {:?}: {}", drive_path, err);
            eprintln!("Please check if the USB drive is write-protected or full.");
            std::process::exit(1);
        }
    }
}
