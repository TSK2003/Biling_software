pub mod db;
pub mod commands;
pub mod services;
pub mod models;
pub mod utils;
pub mod network;

use std::sync::{Arc, Mutex};
use db::connection::Database;

/// Application state managed by Tauri
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    let database = Database::init().expect("Failed to initialize database");
    let db_arc = Arc::new(Mutex::new(database));

    // Start background Host API and Discovery services
    {
        let db_lock = db_arc.lock().expect("Failed to lock DB on startup");
        let shop_id: String = db_lock.conn.query_row(
            "SELECT value FROM settings WHERE key = 'shop_id'",
            [],
            |r| r.get(0),
        ).unwrap_or_else(|_| "SHOP-BILLING-000001".to_string());

        let shop_name: String = db_lock.conn.query_row(
            "SELECT value FROM settings WHERE key = 'shop_name'",
            [],
            |r| r.get(0),
        ).unwrap_or_else(|_| "Fruit Shop".to_string());

        let host_port: u16 = db_lock.conn.query_row(
            "SELECT value FROM settings WHERE key = 'host_port'",
            [],
            |r| r.get::<_, String>(0),
        ).unwrap_or_else(|_| "4123".to_string())
        .parse()
        .unwrap_or(4123);

        let (detected_ip, _) = commands::network::get_active_lan_ips();

        drop(db_lock);

        network::start_host_services(
            db_arc.clone(),
            host_port,
            shop_id,
            shop_name,
            detected_ip,
            "0.1.0".to_string(),
        );

        // Start Google Drive resilient background cloud sync queue worker
        services::gdrive_service::GDriveService::start_sync_worker(db_arc.clone());
    }

    let app_state = AppState {
        db: db_arc,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_current_user,
            commands::auth::change_password,
            // Category commands
            commands::categories::get_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            commands::categories::reorder_categories,
            // Product commands
            commands::products::get_products,
            commands::products::get_product,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::restock_product,
            commands::products::delete_product,
            commands::products::search_products,
            commands::products::upload_product_image,
            commands::products::export_products_excel,
            commands::products::export_products_csv,
            commands::products::import_products_csv,
            commands::products::import_products_excel,
            commands::products::seed_demo_products,
            commands::products::clear_demo_products,
            // Billing commands
            commands::billing::get_billing_products,
            commands::billing::get_next_bill_number,
            commands::billing::save_draft,
            commands::billing::load_draft,
            commands::billing::delete_draft,
            commands::billing::complete_bill,
            commands::billing::return_bill,
            // Bill commands
            commands::bills::get_bills,
            commands::bills::get_bill_detail,
            commands::bills::void_bill,
            // Dashboard commands
            commands::dashboard::get_dashboard_stats,
            commands::dashboard::get_recent_bills,
            commands::dashboard::get_sales_trend,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_setting,
            commands::settings::get_setting,
            // User management commands
            commands::users::get_users,
            commands::users::create_user,
            commands::users::update_user,
            commands::users::delete_user,
            // Report commands
            commands::reports::generate_daily_report,
            commands::reports::generate_date_range_report,
            commands::reports::get_report_list,
            // Backup commands
            commands::backup::create_backup,
            commands::backup::validate_backup,
            commands::backup::restore_backup,
            commands::backup::verify_admin_password,
            commands::backup::get_backup_list,
            commands::backup::clear_all_business_data,
            commands::backup::open_downloads_folder,
            commands::backup::show_in_file_manager,
            commands::backup::open_external_url,
            commands::backup::open_file,
            commands::backup::export_master_excel_backup,
            commands::backup::convert_backup_archive_to_excel,
            commands::backup::create_aws_backup,
            commands::backup::sync_to_gdrive,
            commands::backup::check_daily_backup,
            commands::backup::trigger_daily_backup_now,
            commands::backup::get_auto_backup_status,
            commands::backup::set_auto_backup_enabled,
            commands::backup::open_app_backups_folder,
            commands::backup::pick_backup_folder,
            commands::backup::pick_backup_file,
            commands::backup::get_backup_folder_path,
            commands::backup::set_backup_folder_path,
            // Import commands
            commands::import::validate_excel_import,
            commands::import::execute_excel_import,
            // Licensing commands
            commands::licensing::check_license,
            commands::licensing::detect_usb_key,
            commands::licensing::get_all_drives,
            commands::licensing::activate_license,
            commands::licensing::activate_with_code,
            commands::licensing::get_license_info,
            commands::licensing::deactivate_license,
            commands::licensing::create_usb_security_key,
            // Network & Multi-Computer commands
            commands::network::get_network_info,
            commands::network::set_network_mode,
            commands::network::discover_hosts,
            commands::network::test_host_connection,
            commands::network::connect_to_host,
            commands::network::get_registered_devices,
            commands::network::approve_device,
            commands::network::revoke_device,
            commands::network::rename_device,
            commands::network::get_inventory,
            commands::network::adjust_stock,
            commands::network::get_stock_movements,
            commands::network::setup_firewall_rules,
            // Expense commands
            commands::expenses::get_expense_categories,
            commands::expenses::create_expense_category,
            commands::expenses::update_expense_category,
            commands::expenses::delete_expense_category,
            commands::expenses::get_expenses,
            commands::expenses::get_expense_detail,
            commands::expenses::create_expense,
            commands::expenses::update_expense,
            commands::expenses::cancel_expense,
            commands::expenses::get_expense_summary,
            commands::expenses::export_expenses_excel,
            // Printer commands
            commands::printer::get_printers,
            commands::printer::get_default_printer,
            commands::printer::print_receipt,
            commands::printer::test_print,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
