import { useState, useEffect } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { toast } from "react-hot-toast";
import { useAuthStore } from "../../features/auth/auth.store";
import { 
  createBackup, 
  validateBackup, 
  restoreBackup, 
  RestorePreview,
  getVaultConfig,
  saveVaultConfig,
  syncToVaultNow,
  VaultConfig
} from "../../features/backup/backup.api";
import { 
  UploadCloud, 
  DownloadCloud, 
  ShieldAlert, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Key, 
  Globe, 
  Clock, 
  Save 
} from "lucide-react";
import { RestorePreviewModal } from "./RestorePreviewModal";

export function BackupRestorePage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(null);

  // Cloud Vault Configuration State
  const [vaultConfig, setVaultConfig] = useState<VaultConfig>({
    enabled: false,
    vault_url: "http://localhost:3000",
    api_key: "ir-vault-secret-key-2026",
    sync_interval: "1h",
  });
  const [savingVault, setSavingVault] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);

  useEffect(() => {
    async function loadVault() {
      if (!token) return;
      try {
        const config = await getVaultConfig(token);
        setVaultConfig(config);
      } catch (err) {
        console.error("Failed to load vault config", err);
      }
    }
    loadVault();
  }, [token]);

  const handleSaveVaultConfig = async () => {
    if (!token) return;
    setSavingVault(true);
    try {
      await saveVaultConfig(token, vaultConfig.enabled, vaultConfig.vault_url, vaultConfig.api_key);
      toast.success("IR Vault settings saved!");
    } catch (err: any) {
      toast.error(err.toString() || "Failed to save settings");
    } finally {
      setSavingVault(false);
    }
  };

  const handleSyncToVaultNow = async () => {
    if (!token) return;
    setSyncingNow(true);
    const toastId = toast.loading("Creating snapshot and syncing to IR Vault...");
    try {
      const res = await syncToVaultNow(token);
      toast.success(`Synced successfully: ${res.filename}`, { id: toastId });
      // Refresh config to get updated timestamp
      const updated = await getVaultConfig(token);
      setVaultConfig(updated);
    } catch (err: any) {
      toast.error(err.message || "Cloud sync failed. Check URL and API key.", { id: toastId });
      // Refresh status
      const updated = await getVaultConfig(token);
      setVaultConfig(updated);
    } finally {
      setSyncingNow(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!token) return;
    try {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      
      const defaultPath = `IRPOS_Backup_${dateStr}.irposbackup`;
      
      const destPath = await save({
        title: "Save Backup",
        defaultPath,
        filters: [{ name: "IR POS Backup", extensions: ["irposbackup"] }]
      });

      if (!destPath) return; // User cancelled

      setLoading(true);
      const toastId = toast.loading("Creating backup...");
      
      await createBackup(token, destPath);
      
      toast.success("Backup created successfully!", { id: toastId });
    } catch (error: any) {
      toast.error(error.toString() || "Failed to create backup.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBackup = async () => {
    if (!token) return;
    try {
      const backupPath = await open({
        title: "Select Backup File",
        filters: [{ name: "IR POS Backup", extensions: ["irposbackup", "db"] }]
      });

      if (!backupPath || Array.isArray(backupPath)) return;

      setLoading(true);
      const toastId = toast.loading("Validating backup...");

      const validationPreview = await validateBackup(token, backupPath);
      setSelectedBackupPath(backupPath);
      setPreview(validationPreview);
      setIsModalOpen(true);

      toast.dismiss(toastId);
    } catch (error: any) {
      toast.error(error.toString() || "Failed to read backup.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!token || !selectedBackupPath) return;
    try {
      setLoading(true);
      const toastId = toast.loading("Restoring database and restarting application...");
      
      await restoreBackup(token, selectedBackupPath);
      
      toast.success("Restore successful! Restarting...", { id: toastId });
    } catch (error: any) {
      toast.error(error.toString() || "Failed to restore backup.");
      setLoading(false);
      setIsModalOpen(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Backup & Restore</h2>
          <p className="text-gray-500 mt-1">Manage and protect your business data offline and in the cloud.</p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* IR VAULT CLOUD SYNC SECTION */}
      {/* ======================================================== */}
      <section className="bg-white rounded-2xl shadow-xs border border-blue-100 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-blue-100 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shadow-blue-500/30">
              <Cloud size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">IR Vault Cloud Sync</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                  Hourly Auto-Backup
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Automatically backup and sync all your database snapshots to IR Vault every hour.
              </p>
            </div>
          </div>

          {/* Sync Status Badge */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            {vaultConfig.last_sync_status === "SUCCESS" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Synced to Cloud
              </span>
            ) : vaultConfig.last_sync_status === "FAILED" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                <AlertCircle size={13} className="text-red-600" />
                Sync Issue
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                <Clock size={13} />
                Awaiting First Sync
              </span>
            )}
          </div>
        </div>

        {/* Configuration Body */}
        <div className="p-6 space-y-6">
          
          {/* Hourly Auto-Sync Toggle */}
          <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl border border-blue-100">
            <div>
              <span className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" />
                Automated Hourly Cloud Backup
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                Takes a secure snapshot of your POS database and uploads it to IR Vault every 60 minutes in the background.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={vaultConfig.enabled}
                onChange={(e) => setVaultConfig({ ...vaultConfig, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Connection Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                <Globe size={14} className="text-blue-600" />
                IR Vault Web URL
              </label>
              <input
                type="text"
                value={vaultConfig.vault_url}
                onChange={(e) => setVaultConfig({ ...vaultConfig, vault_url: e.target.value })}
                placeholder="e.g. https://ir-vault.vercel.app or http://localhost:3000"
                className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
              <p className="text-[11px] text-gray-400 mt-1">The URL of your deployed IR Vault instance on Vercel.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                <Key size={14} className="text-blue-600" />
                Vault Secret API Key
              </label>
              <input
                type="password"
                value={vaultConfig.api_key}
                onChange={(e) => setVaultConfig({ ...vaultConfig, api_key: e.target.value })}
                placeholder="Enter secret key..."
                className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
              <p className="text-[11px] text-gray-400 mt-1">Matches the VAULT_SECRET_KEY in your IR Vault settings.</p>
            </div>
          </div>

          {/* Last Sync Info & Error Banner */}
          {vaultConfig.last_sync_time && (
            <div className="text-xs text-gray-500 flex items-center justify-between pt-1 border-t border-gray-100">
              <span>
                Last Cloud Sync: <strong className="text-gray-700">{new Date(vaultConfig.last_sync_time).toLocaleString()}</strong>
              </span>
              {vaultConfig.last_sync_error && (
                <span className="text-red-600 text-xs truncate max-w-sm" title={vaultConfig.last_sync_error}>
                  Error: {vaultConfig.last_sync_error}
                </span>
              )}
            </div>
          )}

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveVaultConfig}
                disabled={savingVault}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Save size={14} />
                <span>{savingVault ? "Saving..." : "Save Settings"}</span>
              </button>

              <button
                type="button"
                onClick={handleSyncToVaultNow}
                disabled={syncingNow}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs shadow-blue-500/20"
              >
                <RefreshCw size={14} className={syncingNow ? "animate-spin" : ""} />
                <span>{syncingNow ? "Syncing..." : "Sync to IR Vault Now"}</span>
              </button>
            </div>

            <a
              href={vaultConfig.vault_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-xl transition-colors border border-blue-200"
            >
              <span>Open IR Vault Web App</span>
              <ExternalLink size={13} />
            </a>
          </div>

        </div>
      </section>

      {/* ======================================================== */}
      {/* MANUAL OFFLINE BACKUP & RESTORE SECTION */}
      {/* ======================================================== */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Manual Backup Card */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-start gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <UploadCloud size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Export Local Backup</h3>
              <p className="text-gray-500 text-xs mt-1">
                Save an offline snapshot of all your products, sales, and settings to your local computer or an external USB drive.
              </p>
            </div>
          </div>
          <div className="p-4 bg-gray-50/70 flex justify-end">
            <button
              onClick={handleCreateBackup}
              disabled={loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
            >
              {loading ? "Processing..." : "Export File"}
            </button>
          </div>
        </div>

        {/* Restore Card */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-start gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <DownloadCloud size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Restore from File</h3>
              <p className="text-gray-500 text-xs mt-1">
                Restore your business data from a previously saved offline backup file. Requires application restart.
              </p>
            </div>
          </div>
          <div className="p-4 bg-gray-50/70 flex justify-end">
            <button
              onClick={handleSelectBackup}
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
            >
              Select Backup File
            </button>
          </div>
        </div>
      </div>
      
      {/* Guarantee Notice */}
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-200 flex items-start gap-3.5">
        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
          <ShieldAlert size={24} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-800">Dual-Layer Data Protection</h3>
          <p className="text-gray-500 text-xs mt-0.5">
            Your offline and cloud backups are validated using SHA-256 integrity checksums. With IR Vault enabled, your business data is continuously preserved every hour so you can recover quickly from hardware failure or accidental data loss.
          </p>
        </div>
      </div>

      <RestorePreviewModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmRestore}
        preview={preview}
        loading={loading}
      />
    </div>
  );
}
