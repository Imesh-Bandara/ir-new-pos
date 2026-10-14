use tauri::{State, AppHandle, Manager};
use crate::database::db::AppState;
use crate::security::auth::validate_permission;
use crate::services::backup::{create_backup, validate_backup, perform_restore};
use crate::models::backup::RestorePreview;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Serialize, Deserialize, Debug)]
pub struct CloudExportData {
    pub filename: String,
    pub bytes: Vec<u8>,
    pub store_name: String,
    pub store_id: String,
    pub app_version: String,
    pub schema_version: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VaultConfig {
    pub enabled: bool,
    pub vault_url: String,
    pub api_key: String,
    pub sync_interval: String,
    pub last_sync_time: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
}

#[tauri::command]
pub async fn create_backup_cmd(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    token: String,
    dest_path: String,
) -> Result<(), String> {
    let user_id = validate_permission(&state.db, &token, "backup.create").await?;
    
    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id) VALUES (?, ?, 'CREATE_BACKUP', 'SYSTEM', ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&user_id)
        .bind("backup")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    
    let app_version = app_handle.package_info().version.to_string();
    create_backup(&state.db, &PathBuf::from(dest_path), &app_version).await
}

#[tauri::command]
pub async fn validate_backup_cmd(
    state: State<'_, AppState>,
    token: String,
    backup_path: String,
) -> Result<RestorePreview, String> {
    validate_permission(&state.db, &token, "backup.view").await?;
    validate_backup(&PathBuf::from(backup_path)).await
}

#[tauri::command]
pub async fn restore_backup_cmd(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    token: String,
    backup_path: String,
) -> Result<(), String> {
    let user_id = validate_permission(&state.db, &token, "backup.restore").await?;
    
    let app_data_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./"));
    let db_path = app_data_dir.join("irpos.db");
    
    let _ = sqlx::query("INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id) VALUES (?, ?, 'RESTORE_STARTED', 'SYSTEM', ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&user_id)
        .bind("restore")
        .execute(&state.db)
        .await; 
    
    perform_restore(&state.db, &db_path, &PathBuf::from(backup_path)).await?;
    
    app_handle.restart();
    
    Ok(())
}

#[tauri::command]
pub async fn export_backup_for_vault_cmd(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    token: String,
) -> Result<CloudExportData, String> {
    validate_permission(&state.db, &token, "backup.create").await?;

    let app_version = app_handle.package_info().version.to_string();
    let app_data_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./"));
    let backups_dir = app_data_dir.join("backups");
    if !backups_dir.exists() {
        let _ = std::fs::create_dir_all(&backups_dir);
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H%M%S").to_string();
    let filename = format!("IRPOS_Hourly_{}.irposbackup", timestamp);
    let temp_path = backups_dir.join(format!("temp_vault_{}.irposbackup", uuid::Uuid::new_v4()));

    create_backup(&state.db, &temp_path, &app_version).await?;

    let bytes = std::fs::read(&temp_path).map_err(|e| format!("Failed to read backup bytes: {}", e))?;
    let _ = std::fs::remove_file(&temp_path);

    let bus_row = sqlx::query("SELECT id, name FROM businesses LIMIT 1")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let (store_id, store_name) = match bus_row {
        Some(r) => (r.get::<String, _>("id"), r.get::<String, _>("name")),
        None => ("default-store".to_string(), "IR POS Terminal".to_string()),
    };

    let schema_version: String = sqlx::query("SELECT version FROM _sqlx_migrations ORDER BY version DESC LIMIT 1")
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None)
        .map(|row| row.try_get::<i64, _>("version").map(|v| v.to_string()).unwrap_or_else(|_| "1".to_string()))
        .unwrap_or_else(|| "1".to_string());

    Ok(CloudExportData {
        filename,
        bytes,
        store_name,
        store_id,
        app_version,
        schema_version,
    })
}

#[tauri::command]
pub async fn get_vault_config_cmd(
    state: State<'_, AppState>,
    token: String,
) -> Result<VaultConfig, String> {
    validate_permission(&state.db, &token, "backup.view").await?;

    let rows = sqlx::query("SELECT key, value FROM settings WHERE section = 'cloud_vault'")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let mut enabled = false;
    let mut vault_url = "http://localhost:3000".to_string();
    let mut api_key = "ir-vault-secret-key-2026".to_string();
    let mut sync_interval = "1h".to_string();
    let mut last_sync_time = None;
    let mut last_sync_status = None;
    let mut last_sync_error = None;

    for row in rows {
        let key: String = row.get("key");
        let val: Option<String> = row.get("value");
        match key.as_str() {
            "enabled" => enabled = val.as_deref() == Some("true"),
            "vault_url" => if let Some(v) = val { vault_url = v; },
            "api_key" => if let Some(v) = val { api_key = v; },
            "sync_interval" => if let Some(v) = val { sync_interval = v; },
            "last_sync_time" => last_sync_time = val,
            "last_sync_status" => last_sync_status = val,
            "last_sync_error" => last_sync_error = val,
            _ => {}
        }
    }

    Ok(VaultConfig {
        enabled,
        vault_url,
        api_key,
        sync_interval,
        last_sync_time,
        last_sync_status,
        last_sync_error,
    })
}

#[tauri::command]
pub async fn save_vault_config_cmd(
    state: State<'_, AppState>,
    token: String,
    enabled: bool,
    vault_url: String,
    api_key: String,
) -> Result<(), String> {
    validate_permission(&state.db, &token, "backup.create").await?;

    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;

    let items = [
        ("enabled", if enabled { "true" } else { "false" }),
        ("vault_url", vault_url.as_str()),
        ("api_key", api_key.as_str()),
    ];

    for (k, v) in items {
        sqlx::query(
            "INSERT INTO settings (section, key, value, updated_at) VALUES ('cloud_vault', ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(section, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
        )
        .bind(k)
        .bind(v)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_vault_sync_status_cmd(
    state: State<'_, AppState>,
    token: String,
    status: String,
    error_msg: Option<String>,
) -> Result<(), String> {
    validate_permission(&state.db, &token, "backup.create").await?;

    let now_str = chrono::Utc::now().to_rfc3339();
    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO settings (section, key, value, updated_at) VALUES ('cloud_vault', 'last_sync_time', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(section, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&now_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO settings (section, key, value, updated_at) VALUES ('cloud_vault', 'last_sync_status', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(section, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&status)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(err) = error_msg {
        sqlx::query(
            "INSERT INTO settings (section, key, value, updated_at) VALUES ('cloud_vault', 'last_sync_error', ?, CURRENT_TIMESTAMP)
             ON CONFLICT(section, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
        )
        .bind(&err)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
