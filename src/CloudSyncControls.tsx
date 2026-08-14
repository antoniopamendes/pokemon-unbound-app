import type { CloudSyncApi } from "./useCloudSync";

type CloudSyncControlsProps = {
  cloudSync: CloudSyncApi;
};

function CloudUploadIcon() {
  return (
    <svg className="cloud-sync-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
      />
    </svg>
  );
}

function CloudRestoreIcon() {
  return (
    <svg className="cloud-sync-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h8v-2H6a4 4 0 1 1 1.14-7.83l1.06.3.5-.99A5.49 5.49 0 0 1 19.35 10.04zM19 13l-5 5h3v4h4v-4h3l-5-5z"
      />
    </svg>
  );
}

export function CloudSyncControls({ cloudSync }: CloudSyncControlsProps) {
  if (!cloudSync.isCloudEnabled || !cloudSync.user) {
    return null;
  }

  const isSyncing = cloudSync.syncStatus === "syncing";
  const statusText = cloudSync.syncMessage
    ?? (cloudSync.hasPendingChanges ? "Unsaved changes" : "Up to date");

  const restoreCloudVersion = () => {
    if (window.confirm("Replace local data with the cloud version? Any local changes will be discarded.")) {
      void cloudSync.restoreCloudVersion();
    }
  };

  return (
    <div className="cloud-sync-controls">
      <span className={`cloud-sync-status cloud-sync-status-${cloudSync.syncStatus}`}>
        {statusText}
      </span>
      <button
        type="button"
        className="account-btn cloud-sync-btn"
        onClick={() => void cloudSync.pushChanges()}
        disabled={isSyncing}
        title="Upload the complete local snapshot to the cloud"
      >
        <CloudUploadIcon />
        {isSyncing ? "Working…" : "Push changes"}
      </button>
      <button
        type="button"
        className="account-btn cloud-sync-btn cloud-sync-clear-btn"
        onClick={restoreCloudVersion}
        disabled={isSyncing}
        title="Restore the last saved cloud version"
      >
        <CloudRestoreIcon />
        Clear changes
      </button>
    </div>
  );
}
