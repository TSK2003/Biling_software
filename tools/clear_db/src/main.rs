use rusqlite::Connection;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
    let db_path = PathBuf::from(local_app_data).join("com.aescion.pos").join("aescion_pos.db");
    
    println!("Connecting to SQLite database at: {:?}", db_path);
    
    if !db_path.exists() {
        println!("Database file does not exist yet.");
        return Ok(());
    }
    
    let conn = Connection::open(&db_path)?;
    
    // Clear draft_bills, payments, bill_items, bills, products
    let drafts: usize = conn.execute("DELETE FROM draft_bills", [])?;
    let payments: usize = conn.execute("DELETE FROM payments", [])?;
    let items: usize = conn.execute("DELETE FROM bill_items", [])?;
    let bills: usize = conn.execute("DELETE FROM bills", [])?;
    let products: usize = conn.execute("DELETE FROM products", [])?;
    let _ = conn.execute("UPDATE product_code_seq SET last_code = 0 WHERE id = 1", []);
    
    println!("Database cleared successfully:");
    println!("- Deleted {} draft bills", drafts);
    println!("- Deleted {} payments", payments);
    println!("- Deleted {} bill items", items);
    println!("- Deleted {} bills", bills);
    println!("- Deleted {} products", products);
    println!("- Product code sequence reset to 0 (next product will be PRD-000001)");
    
    Ok(())
}
