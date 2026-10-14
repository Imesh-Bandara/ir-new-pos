pub mod database;
pub mod models;
pub mod security;
pub mod commands;
pub mod services;

use database::db::{init_db, AppState};
use log::{LevelFilter, Log, Metadata, Record};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::sync::Mutex;
use tauri::Manager;
use commands::auth_cmds::{check_is_first_run, setup_first_run, login, check_session, logout};
use commands::product_cmds::{
    get_categories, create_category, update_category, delete_category,
    get_brands, create_brand, update_brand, delete_brand,
    get_units, create_unit, update_unit, delete_unit,
    create_product, get_products, get_product, update_product
};
use commands::inventory_cmds::{get_inventory, adjust_stock, get_stock_movements};
use commands::pos_cmds::{checkout, search_products_pos, quick_add_product};
use commands::sales_cmds::{get_sales, get_sale_details, void_sale, process_return, get_sale_returns, get_sale_refunds};
use commands::held_sales_cmds::{save_held_sale, get_held_sales, delete_held_sale};
use commands::supplier_cmds::{get_suppliers, get_supplier, create_supplier, update_supplier, deactivate_supplier};
use commands::purchase_cmds::{create_purchase_order, receive_goods, process_purchase_return, record_supplier_payment, get_purchase_orders, get_purchases, get_purchase_order_details, get_purchase_details};
use commands::report_cmds::{get_dashboard_summary, get_sales_report, get_product_performance, get_inventory_report, get_supplier_report};
use commands::backup_cmds::{
    create_backup_cmd, validate_backup_cmd, restore_backup_cmd,
    export_backup_for_vault_cmd, get_vault_config_cmd, save_vault_config_cmd, update_vault_sync_status_cmd
};
use commands::hardware_cmds::{print_receipt_cmd, test_printer_cmd, open_cash_drawer_cmd, test_display_cmd, get_hardware_settings_cmd, update_hardware_settings_cmd};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn check_db_status(state: tauri::State<'_, AppState>) -> Result<String, String> {
    // Attempt a simple query to verify the database is accessible and migrations applied
    let row: (i64,) = sqlx::query_as("SELECT count(*) FROM products")
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(format!("Database is online. Products count: {}", row.0))
}

struct FileLogger {
    writer: Mutex<std::fs::File>,
}

impl Log for FileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= log::Level::Info
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let mut writer = self.writer.lock().unwrap();
        let _ = writeln!(
            writer,
            "{} [{}] {}",
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
            record.level(),
            record.args()
        );
        let _ = writer.flush();
    }

    fn flush(&self) {}
}

fn init_logger(app_data_dir: &std::path::Path) -> Result<(), String> {
    let logs_dir = app_data_dir.join("logs");
    fs::create_dir_all(&logs_dir).map_err(|e| format!("Failed to create log directory: {}", e))?;

    let log_path = logs_dir.join("ir-pos.log");
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let logger = FileLogger { writer: Mutex::new(file) };
    log::set_boxed_logger(Box::new(logger)).map_err(|e| format!("Failed to initialize logger: {}", e))?;
    log::set_max_level(LevelFilter::Info);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
                std::path::PathBuf::from("./")
            });

            if let Err(err) = init_logger(&app_data_dir) {
                eprintln!("{}", err);
            }

            // Block on async init_db
            let pool = tauri::async_runtime::block_on(async {
                init_db(app_data_dir).await.expect("Failed to initialize database")
            });

            app.manage(AppState { db: pool });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            check_db_status,
            check_is_first_run,
            setup_first_run,
            login,
            check_session,
            logout,
            get_categories,
            create_category,
            update_category,
            delete_category,
            get_brands,
            create_brand,
            update_brand,
            delete_brand,
            get_units,
            create_unit,
            update_unit,
            delete_unit,
            create_product,
            get_products,
            get_product,
            update_product,
            get_inventory,
            adjust_stock,
            get_stock_movements,
            checkout,
            search_products_pos,
            quick_add_product,
            get_sales,
            get_sale_details,
            void_sale,
            process_return,
            get_sale_returns,
            get_sale_refunds,
            save_held_sale,
            get_held_sales,
            delete_held_sale,
            get_suppliers,
            get_supplier,
            create_supplier,
            update_supplier,
            deactivate_supplier,
            create_purchase_order,
            receive_goods,
            process_purchase_return,
            record_supplier_payment,
            get_purchase_orders,
            get_purchases,
            get_purchase_order_details,
            get_purchase_details,
            get_dashboard_summary,
            get_sales_report,
            get_product_performance,
            get_inventory_report,
            get_supplier_report,
            create_backup_cmd,
            validate_backup_cmd,
            restore_backup_cmd,
            export_backup_for_vault_cmd,
            get_vault_config_cmd,
            save_vault_config_cmd,
            update_vault_sync_status_cmd,
            print_receipt_cmd,
            test_printer_cmd,
            open_cash_drawer_cmd,
            test_display_cmd,
            get_hardware_settings_cmd,
            update_hardware_settings_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
