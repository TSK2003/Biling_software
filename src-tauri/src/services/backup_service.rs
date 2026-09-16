use std::fs::{self, File};
use std::io::{Read, Write};
use rusqlite::params;
use sha2::{Sha256, Digest};
use zip::{ZipWriter, ZipArchive, write::FileOptions};
use walkdir::WalkDir;

use crate::db::connection::Database;
use crate::models::{BackupRecord, BackupManifest};

pub struct BackupService;

impl BackupService {
    /// Create a full standalone .zip backup package
    pub fn create_full_backup(db: &Database, backup_type: &str) -> Result<BackupRecord, String> {
        let now = chrono::Local::now();
        let timestamp_str = now.format("%Y%m%d_%H%M%S").to_string();
        let backup_filename = format!("Shop_Billing_Backup_{}.zip", timestamp_str);
        
        let backups_dir = db.backups_dir();
        fs::create_dir_all(&backups_dir).map_err(|e| format!("Failed to create backups directory: {}", e))?;
        let backup_path = backups_dir.join(&backup_filename);

        // 1. Gather stats & settings for manifest
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

        let product_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0)).unwrap_or(0);
        let category_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0)).unwrap_or(0);
        let bill_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM bills", [], |r| r.get(0)).unwrap_or(0);

        // Count image files
        let image_count = WalkDir::new(db.product_images_dir())
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .count() as i64;

        // Count report files
        let report_count = WalkDir::new(db.reports_dir())
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .count() as i64;

        // 2. Perform SQLite WAL Checkpoint to flush all changes to main db
        let _ = db.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

        // 3. Create a temporary clean SQLite backup file
        let temp_db_path = backups_dir.join(format!("temp_backup_{}.db", timestamp_str));
        {
            let mut backup_conn = rusqlite::Connection::open(&temp_db_path)
                .map_err(|e| format!("Failed to open temp backup db: {}", e))?;
            let backup = rusqlite::backup::Backup::new(&db.conn, &mut backup_conn)
                .map_err(|e| format!("Failed to create SQLite online backup: {}", e))?;
            backup.run_to_completion(5, std::time::Duration::from_millis(250), None)
                .map_err(|e| format!("SQLite backup run error: {}", e))?;
        }

        // Calculate SHA-256 checksum of database file
        let mut db_file = File::open(&temp_db_path).map_err(|e| format!("Failed to read backup db: {}", e))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = db_file.read(&mut buffer).map_err(|e| e.to_string())?;
            if bytes_read == 0 { break; }
            hasher.update(&buffer[..bytes_read]);
        }
        let checksum_sha256 = format!("{:x}", hasher.finalize());

        // 4. Create Manifest Struct
        let manifest = BackupManifest {
            backup_version: "1.0.0".to_string(),
            app_version: "0.1.0".to_string(),
            schema_version: 2,
            backup_date: now.to_rfc3339(),
            shop_id,
            shop_name,
            product_count,
            category_count,
            bill_count,
            image_count,
            report_count,
            checksum_sha256,
        };

        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("Manifest serialize error: {}", e))?;

        // 5. Build ZIP Package
        let zip_file = File::create(&backup_path)
            .map_err(|e| format!("Failed to create backup zip: {}", e))?;
        let mut zip = ZipWriter::new(zip_file);
        let options: FileOptions<'_, ()> = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // A. Add manifest.json
        zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
        zip.write_all(manifest_json.as_bytes()).map_err(|e| e.to_string())?;

        // B. Add Database/backup.db
        zip.start_file("Database/backup.db", options).map_err(|e| e.to_string())?;
        let mut temp_db_file = File::open(&temp_db_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut temp_db_file, &mut zip).map_err(|e| e.to_string())?;

        // C. Add Products/Images
        let images_dir = db.product_images_dir();
        if images_dir.exists() {
            for entry in WalkDir::new(&images_dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(rel_path) = path.strip_prefix(&images_dir) {
                        let zip_entry_name = format!("Products/Images/{}", rel_path.to_string_lossy().replace('\\', "/"));
                        zip.start_file(&zip_entry_name, options).map_err(|e| e.to_string())?;
                        let mut f = File::open(path).map_err(|e| e.to_string())?;
                        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                    }
                }
            }
        }

        // D. Add Reports
        let reports_dir = db.reports_dir();
        if reports_dir.exists() {
            for entry in WalkDir::new(&reports_dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(rel_path) = path.strip_prefix(&reports_dir) {
                        let zip_entry_name = format!("Reports/{}", rel_path.to_string_lossy().replace('\\', "/"));
                        zip.start_file(&zip_entry_name, options).map_err(|e| e.to_string())?;
                        let mut f = File::open(path).map_err(|e| e.to_string())?;
                        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                    }
                }
            }
        }

        zip.finish().map_err(|e| format!("Failed to finalize zip: {}", e))?;

        // Clean up temp SQLite backup file
        let _ = fs::remove_file(&temp_db_path);

        let size_bytes = fs::metadata(&backup_path).map(|m| m.len() as i64).unwrap_or(0);
        let path_str = backup_path.to_string_lossy().to_string();

        // 6. Record in SQLite database & queue for Google Drive sync
        db.conn.execute(
            "INSERT INTO backup_records (backup_type, backup_path, manifest_json, size_bytes)
             VALUES (?1, ?2, ?3, ?4)",
            params![backup_type, path_str, manifest_json, size_bytes],
        ).map_err(|e| format!("Failed to record backup: {}", e))?;

        let record_id = db.conn.last_insert_rowid();

        let _ = db.conn.execute(
            "INSERT INTO sync_queue (file_type, local_path, status) VALUES ('backup', ?1, 'pending')",
            params![path_str],
        );

        // Audit log
        let _ = db.conn.execute(
            "INSERT INTO audit_logs (action, entity_type, details_json)
             VALUES ('create_backup', 'system', ?1)",
            params![format!("{{\"type\":\"{}\",\"file\":\"{}\"}}", backup_type, backup_filename)],
        );

        Ok(BackupRecord {
            id: record_id,
            backup_type: backup_type.to_string(),
            backup_path: path_str,
            manifest_json: Some(manifest_json),
            size_bytes,
            created_at: now.to_rfc3339(),
        })
    }

    /// Validate a backup archive and read its manifest
    pub fn validate_backup_archive(archive_path: &str) -> Result<BackupManifest, String> {
        let file = File::open(archive_path).map_err(|e| format!("Failed to open backup file: {}", e))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

        let mut manifest_file = archive.by_name("manifest.json")
            .map_err(|_| "Backup package is missing 'manifest.json' header".to_string())?;

        let mut content = String::new();
        manifest_file.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read manifest content: {}", e))?;

        let manifest: BackupManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Invalid backup manifest structure: {}", e))?;

        Ok(manifest)
    }

    /// Restore full backup with safety snapshot and license preservation
    pub fn restore_full_backup(db: &mut Database, archive_path: &str) -> Result<(), String> {
        // 1. Validate manifest
        let _manifest = Self::validate_backup_archive(archive_path)?;

        // 2. Create pre-restore safety snapshot
        let _ = Self::create_full_backup(db, "pre_restore");

        // 3. Extract Database and files from ZIP
        let file = File::open(archive_path).map_err(|e| format!("Cannot open backup: {}", e))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Cannot read archive: {}", e))?;

        let temp_restore_dir = db.backups_dir().join("temp_restore");
        let _ = fs::remove_dir_all(&temp_restore_dir);
        fs::create_dir_all(&temp_restore_dir).map_err(|e| e.to_string())?;

        archive.extract(&temp_restore_dir).map_err(|e| format!("Extraction error: {}", e))?;

        let restored_db_path = temp_restore_dir.join("Database").join("backup.db");
        if !restored_db_path.exists() {
            let _ = fs::remove_dir_all(&temp_restore_dir);
            return Err("Restored archive is missing Database/backup.db".to_string());
        }

        // 4. Preserve existing local device license table
        let current_license_rows: Vec<(String, String, String, String, String, i32, String, Option<String>, String, i32, i32, Option<String>)> = {
            if let Ok(mut stmt) = db.conn.prepare(
                "SELECT license_id, shop_name, license_type, features_json, device_id_hash, max_activations, activated_at, expires_at, app_version, schema_version, is_active, deactivated_at FROM license_activations"
            ) {
                stmt.query_map([], |r| {
                    Ok((
                        r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?,
                        r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?, r.get(11)?,
                    ))
                }).map(|iter| iter.filter_map(|x| x.ok()).collect()).unwrap_or_default()
            } else {
                vec![]
            }
        };

        // 5. Restore business tables from restored database into active SQLite
        {
            let src_conn = rusqlite::Connection::open(&restored_db_path)
                .map_err(|e| format!("Failed to open restored SQLite file: {}", e))?;

            let tx = db.conn.transaction().map_err(|e| e.to_string())?;

            // Clear current business tables
            let _ = tx.execute("DELETE FROM draft_bills", []);
            let _ = tx.execute("DELETE FROM payments", []);
            let _ = tx.execute("DELETE FROM bill_items", []);
            let _ = tx.execute("DELETE FROM bills", []);
            let _ = tx.execute("DELETE FROM products", []);
            let _ = tx.execute("DELETE FROM categories", []);
            let _ = tx.execute("DELETE FROM inventory", []);
            let _ = tx.execute("DELETE FROM stock_movements", []);

            // Restore Categories
            if let Ok(mut stmt) = src_conn.prepare("SELECT id, name, image_path, sort_order, is_active, created_at, updated_at FROM categories") {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, i32>(3)?, r.get::<_, i32>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?))
                }) {
                    for row in rows.flatten() {
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO categories (id, name, image_path, sort_order, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                            params![row.0, row.1, row.2, row.3, row.4, row.5, row.6],
                        );
                    }
                }
            }

            // Restore Products
            if let Ok(mut stmt) = src_conn.prepare("SELECT id, product_code, name, category_id, image_path, selling_price_paise, gst_enabled, gst_percentage_x100, barcode, is_active, created_at, updated_at FROM products") {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?,
                        r.get::<_, Option<String>>(4)?, r.get::<_, i64>(5)?, r.get::<_, i32>(6)?, r.get::<_, i32>(7)?,
                        r.get::<_, Option<String>>(8)?, r.get::<_, i32>(9)?, r.get::<_, String>(10)?, r.get::<_, String>(11)?
                    ))
                }) {
                    for r in rows.flatten() {
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO products (id, product_code, name, category_id, image_path, selling_price_paise, gst_enabled, gst_percentage_x100, barcode, is_active, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                            params![r.0, r.1, r.2, r.3, r.4, r.5, r.6, r.7, r.8, r.9, r.10, r.11],
                        );
                    }
                }
            }

            // Restore Bills
            if let Ok(mut stmt) = src_conn.prepare("SELECT id, bill_uuid, bill_number, business_date, bill_time, user_id, subtotal_paise, discount_type, discount_value_x100, discount_amount_paise, gst_total_paise, grand_total_paise, status, void_reason, created_at, updated_at FROM bills") {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?, r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?, r.get::<_, String>(7)?,
                        r.get::<_, i32>(8)?, r.get::<_, i64>(9)?, r.get::<_, i64>(10)?, r.get::<_, i64>(11)?,
                        r.get::<_, String>(12)?, r.get::<_, Option<String>>(13)?, r.get::<_, String>(14)?, r.get::<_, String>(15)?
                    ))
                }) {
                    for r in rows.flatten() {
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO bills (id, bill_uuid, bill_number, business_date, bill_time, user_id, subtotal_paise, discount_type, discount_value_x100, discount_amount_paise, gst_total_paise, grand_total_paise, status, void_reason, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                            params![r.0, r.1, r.2, r.3, r.4, r.5, r.6, r.7, r.8, r.9, r.10, r.11, r.12, r.13, r.14, r.15],
                        );
                    }
                }
            }

            // Restore Bill Items
            if let Ok(mut stmt) = src_conn.prepare("SELECT id, bill_id, product_id, product_code_snapshot, product_name_snapshot, category_name_snapshot, unit_price_paise, quantity, gst_enabled, gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order FROM bill_items") {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<i64>>(2)?, r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, i64>(6)?, r.get::<_, i32>(7)?,
                        r.get::<_, i32>(8)?, r.get::<_, i32>(9)?, r.get::<_, i64>(10)?, r.get::<_, i64>(11)?, r.get::<_, i32>(12)?
                    ))
                }) {
                    for r in rows.flatten() {
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO bill_items (id, bill_id, product_id, product_code_snapshot, product_name_snapshot, category_name_snapshot, unit_price_paise, quantity, gst_enabled, gst_percentage_x100, gst_amount_paise, line_total_paise, sort_order)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                            params![r.0, r.1, r.2, r.3, r.4, r.5, r.6, r.7, r.8, r.9, r.10, r.11, r.12],
                        );
                    }
                }
            }

            // Restore Payments
            if let Ok(mut stmt) = src_conn.prepare("SELECT id, bill_id, payment_method, total_amount_paise, cash_amount_paise, card_amount_paise, upi_amount_paise, created_at FROM payments") {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?,
                        r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?, r.get::<_, String>(7)?
                    ))
                }) {
                    for r in rows.flatten() {
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO payments (id, bill_id, payment_method, total_amount_paise, cash_amount_paise, card_amount_paise, upi_amount_paise, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                            params![r.0, r.1, r.2, r.3, r.4, r.5, r.6, r.7],
                        );
                    }
                }
            }

            // Re-apply preserved local license
            for lic in current_license_rows {
                let _ = tx.execute(
                    "INSERT OR REPLACE INTO license_activations (license_id, shop_name, license_type, features_json, device_id_hash, max_activations, activated_at, expires_at, app_version, schema_version, is_active, deactivated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![lic.0, lic.1, lic.2, lic.3, lic.4, lic.5, lic.6, lic.7, lic.8, lic.9, lic.10, lic.11],
                );
            }

            tx.commit().map_err(|e| format!("Restore transaction commit error: {}", e))?;
        }

        // 6. Restore Images and Reports folders
        let extracted_images = temp_restore_dir.join("Products").join("Images");
        if extracted_images.exists() {
            let target_images = db.product_images_dir();
            let _ = fs::create_dir_all(&target_images);
            for entry in WalkDir::new(&extracted_images).into_iter().filter_map(|e| e.ok()) {
                if entry.path().is_file() {
                    if let Ok(rel) = entry.path().strip_prefix(&extracted_images) {
                        let dest = target_images.join(rel);
                        if let Some(parent) = dest.parent() { let _ = fs::create_dir_all(parent); }
                        let _ = fs::copy(entry.path(), dest);
                    }
                }
            }
        }

        // Cleanup temp extraction
        let _ = fs::remove_dir_all(&temp_restore_dir);

        Ok(())
    }

    /// List all backup records
    pub fn get_backup_list(db: &Database) -> Result<Vec<BackupRecord>, String> {
        let mut stmt = db.conn.prepare(
            "SELECT id, backup_type, backup_path, manifest_json, size_bytes, created_at
             FROM backup_records
             ORDER BY created_at DESC"
        ).map_err(|e| format!("DB error: {}", e))?;

        let iter = stmt.query_map([], |r| {
            Ok(BackupRecord {
                id: r.get(0)?,
                backup_type: r.get(1)?,
                backup_path: r.get(2)?,
                manifest_json: r.get(3)?,
                size_bytes: r.get(4)?,
                created_at: r.get(5)?,
            })
        }).map_err(|e| format!("Query map error: {}", e))?;

        let mut list = Vec::new();
        for item in iter.flatten() {
            list.push(item);
        }
        Ok(list)
    }
}
