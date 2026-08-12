// ─── updater-types ────────────────────────────────────────────────────────
//
// Shared contract between the main-process updater (src/main/updater.ts),
// the preload bridge, and the renderer's update modal. Keep this file free
// of Electron imports so both sides can use it.

/** Sent from main → renderer when an update should be offered to the user. */
export interface UpdateOffer {
    /** Version of the available update, e.g. "1.5.0" (no leading "v"). */
    version: string;
    /** Version currently running, from app.getVersion(). */
    currentVersion: string;
    /** True when the update's semver major is greater than the current one. */
    isMajor: boolean;
    /**
     * Plain-markdown text of the release's "## Summary" section, or null if
     * the release has none / fetching the release body failed.
     */
    summary: string | null;
    /**
     * Plain-markdown text of the release's "## Breaking Changes" section
     * (with or without a leading ⚠️ in the heading), or null if absent.
     */
    breakingNotes: string | null;
    /**
     * True on Windows/Linux where electron-updater can download and install
     * in place. False on macOS (unsigned build) — there the modal offers
     * "Download" which opens the GitHub release page instead of "Install".
     */
    canAutoInstall: boolean;
    /** GitHub release page URL, e.g. https://github.com/hismindset/hissoundboard/releases/tag/v1.5.0 */
    releaseUrl: string;
    /** True when this offer came from a manual "Check for updates" click. */
    manual: boolean;
}

export interface UpdateProgress {
    /** Download progress 0–100. */
    percent: number;
}

export interface UpdateError {
    message: string;
    /** True when the failed check/download was user-initiated. */
    manual: boolean;
}

export interface UpToDateInfo {
    currentVersion: string;
}

/**
 * Persisted in <userData>/update-state.json. The main process is the sole
 * reader/writer (same ownership rule as configStore).
 */
export interface UpdateState {
    version: 1;
    /** Exact version the user chose "Skip this version" for, or null. */
    skippedVersion: string | null;
    /** Version the user postponed with "Later", or null. */
    postponedVersion: string | null;
    /** Epoch ms of when "Later" was clicked; re-prompt earliest 24h later. */
    postponedAt: number | null;
}

/** IPC channel names — single source of truth. */
export const UPDATER_CHANNELS = {
    // renderer → main (ipcRenderer.invoke / ipcMain.handle)
    checkManual: 'updater:check-manual',
    install: 'updater:install',
    postpone: 'updater:postpone',
    skip: 'updater:skip',
    openDownloadPage: 'updater:open-download-page',
    getCurrentVersion: 'updater:get-current-version',
    // main → renderer (webContents.send / ipcRenderer.on)
    updateAvailable: 'updater:update-available',
    downloadProgress: 'updater:download-progress',
    error: 'updater:error',
    upToDate: 'updater:up-to-date',
} as const;
