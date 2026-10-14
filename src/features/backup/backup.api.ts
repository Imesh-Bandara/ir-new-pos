import { invoke } from "@tauri-apps/api/core";

export interface BackupMetadata {
  id: string;
  app_version: string;
  schema_version: string;
  created_at: string;
  notes?: string | null;
}

export interface RestorePreview {
  metadata: BackupMetadata | null;
  is_valid: boolean;
  error_message: string | null;
}

export interface VaultConfig {
  enabled: boolean;
  vault_url: string;
  api_key: string;
  sync_interval: string;
  last_sync_time?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
}

export interface CloudExportData {
  filename: string;
  bytes: number[];
  store_name: string;
  store_id: string;
  app_version: string;
  schema_version: string;
}

export const createBackup = async (token: string, destPath: string): Promise<void> => {
  return await invoke("create_backup_cmd", { token, destPath });
};

export const validateBackup = async (token: string, backupPath: string): Promise<RestorePreview> => {
  return await invoke("validate_backup_cmd", { token, backupPath });
};

export const restoreBackup = async (token: string, backupPath: string): Promise<void> => {
  return await invoke("restore_backup_cmd", { token, backupPath });
};

export const getVaultConfig = async (token: string): Promise<VaultConfig> => {
  return await invoke("get_vault_config_cmd", { token });
};

export const saveVaultConfig = async (token: string, enabled: boolean, vaultUrl: string, apiKey: string): Promise<void> => {
  return await invoke("save_vault_config_cmd", { token, enabled, vaultUrl, apiKey });
};

export const exportBackupForVault = async (token: string): Promise<CloudExportData> => {
  return await invoke("export_backup_for_vault_cmd", { token });
};

export const updateVaultSyncStatus = async (token: string, status: string, errorMsg?: string | null): Promise<void> => {
  return await invoke("update_vault_sync_status_cmd", { token, status, errorMsg: errorMsg || null });
};

export const syncToVaultNow = async (token: string): Promise<{ success: boolean; message: string; filename: string }> => {
  const config = await getVaultConfig(token);
  if (!config.vault_url) {
    throw new Error("Vault Service URL is not configured.");
  }

  const exportData = await exportBackupForVault(token);
  const uint8 = new Uint8Array(exportData.bytes);
  const blob = new Blob([uint8], { type: "application/octet-stream" });

  const formData = new FormData();
  formData.append("file", blob, exportData.filename);
  formData.append("storeId", exportData.store_id);
  formData.append("storeName", exportData.store_name);
  formData.append("appVersion", exportData.app_version);
  formData.append("schemaVersion", exportData.schema_version);

  const cleanUrl = config.vault_url.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/api/vault/upload`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        "x-vault-key": config.api_key,
      },
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) {
      const err = json.error || `HTTP ${res.status}: Upload failed`;
      await updateVaultSyncStatus(token, "FAILED", err);
      throw new Error(err);
    }

    await updateVaultSyncStatus(token, "SUCCESS", null);
    return {
      success: true,
      message: json.message || "Hourly snapshot synced to IR Vault",
      filename: exportData.filename,
    };
  } catch (err: any) {
    const msg = err.message || "Failed to reach IR Vault server";
    await updateVaultSyncStatus(token, "FAILED", msg);
    throw new Error(msg);
  }
};
