import { getVaultConfig, syncToVaultNow } from "./backup.api";

let schedulerInterval: any = null;

export function initHourlyVaultSync(token: string) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  // Check and run hourly background backup sync
  const checkAndSync = async () => {
    try {
      const config = await getVaultConfig(token);
      if (!config.enabled) return;

      const lastSyncTime = config.last_sync_time ? new Date(config.last_sync_time).getTime() : 0;
      const now = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;

      // If more than 1 hour has elapsed since last sync (or never synced)
      if (now - lastSyncTime >= ONE_HOUR_MS) {
        console.log("[IR Vault] Triggering automated hourly cloud backup sync...");
        await syncToVaultNow(token);
        console.log("[IR Vault] Automated hourly sync completed successfully.");
      }
    } catch (err) {
      console.error("[IR Vault] Background hourly sync error:", err);
    }
  };

  // Run initial check after 10 seconds of app launch
  setTimeout(checkAndSync, 10000);

  // Poll every 5 minutes to verify if the 1-hour interval has elapsed
  schedulerInterval = setInterval(checkAndSync, 5 * 60 * 1000);
}

export function stopHourlyVaultSync() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
