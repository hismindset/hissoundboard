import { app, ipcMain, BrowserWindow, net, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import type { UpdateOffer, UpdateState, ReleaseNotes } from '../shared/updater-types';
import { UPDATER_CHANNELS as CHANNELS } from '../shared/updater-types';

// ─── updater ──────────────────────────────────────────────────────────────
//
// Owns the entire auto-update flow for HISSOUNDBOARD. The main process is the
// sole reader/writer of update-state.json; the renderer communicates only via
// IPC. Delegates to electron-updater on Windows/Linux; uses GitHub API directly
// on macOS (unsigned build, electron-updater can't install).
//

const DEFAULT_UPDATE_STATE: UpdateState = {
    version: 1,
    skippedVersion: null,
    postponedVersion: null,
    postponedAt: null,
};

let currentUpdateOffer: UpdateOffer | null = null;
let updateState: UpdateState = { ...DEFAULT_UPDATE_STATE };
let autoUpdaterListenersRegistered = false;
/** True while a user-approved download is running, so the global electron-updater
 *  'error' listener only surfaces failures the renderer is actually waiting on. */
let downloading = false;

const getUpdateStatePath = (): string =>
    path.join(app.getPath('userData'), 'update-state.json');

const readUpdateState = (): UpdateState => {
    const filePath = getUpdateStatePath();
    if (!fs.existsSync(filePath)) {
        return { ...DEFAULT_UPDATE_STATE };
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content) as UpdateState;
        // Validate schema version
        if (parsed.version === 1) {
            return parsed;
        }
    } catch (err) {
        console.error('[Updater] Failed to read update-state.json:', err);
    }
    return { ...DEFAULT_UPDATE_STATE };
};

const writeUpdateState = (state: UpdateState): void => {
    const filePath = getUpdateStatePath();
    try {
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
        console.error('[Updater] Failed to write update-state.json:', err);
    }
};

/**
 * Parse markdown release notes and extract two sections:
 * "## Summary" and "## Breaking Changes" (or "## ⚠️ Breaking Changes").
 * Returns an object with summary and breakingNotes, or null for missing sections.
 */
const extractReleaseNotes = (markdown: string): { summary: string | null; breakingNotes: string | null } => {
    const lines = markdown.split('\n');
    let summary: string | null = null;
    let breakingNotes: string | null = null;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('## Summary')) {
            // Collect lines after this heading until the next heading or EOF
            const section: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('## ')) {
                section.push(lines[i]);
                i++;
            }
            summary = section.join('\n').trim() || null;
        } else if (line.startsWith('## Breaking Changes') || line.startsWith('## ⚠️ Breaking Changes')) {
            const section: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('## ')) {
                section.push(lines[i]);
                i++;
            }
            breakingNotes = section.join('\n').trim() || null;
        } else {
            i++;
        }
    }

    return { summary, breakingNotes };
};

/**
 * Fetch release notes from the GitHub API for a given version.
 * Returns { summary, breakingNotes } or both null if the fetch fails.
 */
const fetchReleaseNotes = async (version: string): Promise<{ summary: string | null; breakingNotes: string | null }> => {
    try {
        const url = `https://api.github.com/repos/hismindset/hissoundboard/releases/tags/v${version}`;
        const response = await net.fetch(url);
        if (!response.ok) {
            console.error(`[Updater] Failed to fetch release notes (HTTP ${response.status})`);
            return { summary: null, breakingNotes: null };
        }
        const data = (await response.json()) as { body: string };
        return extractReleaseNotes(data.body);
    } catch (err) {
        console.error('[Updater] Failed to fetch release notes:', err);
        return { summary: null, breakingNotes: null };
    }
};

/**
 * Fetch every release between `currentVersion` (exclusive) and `latestVersion`
 * (inclusive), parse each one, and return them in ascending semver order.
 *
 * Rationale: a user skipping several minor versions should see the full
 * change history in the update modal, not just the latest release's notes.
 * Releases that fail to fetch are silently dropped — a single 404 on an
 * intermediate release should not break the whole offer.
 *
 * The function is bounded by GitHub's per-page limit (100). If more than 100
 * releases exist between the two versions we'd only get the first page; in
 * practice this app ships a release per merge to main so we're nowhere near
 * that, but the cap is worth a comment.
 */
const fetchIntermediateReleases = async (currentVersion: string, latestVersion: string): Promise<ReleaseNotes[]> => {
    try {
        // List the 100 most recent releases (newest first). We can't filter on
        // the server because the per-page API doesn't take a date range.
        const response = await net.fetch('https://api.github.com/repos/hismindset/hissoundboard/releases?per_page=100');
        if (!response.ok) {
            console.error(`[Updater] Failed to list releases (HTTP ${response.status})`);
            return [];
        }
        const releases = (await response.json()) as Array<{ tag_name: string; body: string }>;

        // Filter to versions strictly above `currentVersion` and at or below
        // `latestVersion`. `tag_name` is "vX.Y.Z"; we strip the prefix.
        const inRange = releases
            .map(r => ({ version: r.tag_name.replace(/^v/, ''), body: r.body }))
            .filter(r => compareSemver(r.version, currentVersion) > 0 && compareSemver(r.version, latestVersion) <= 0);

        // Parse each, then sort ascending so the modal reads top-to-bottom
        // in chronological order (oldest skipped release first, latest at the
        // bottom — the version the user is about to install).
        const parsed = inRange.map<ReleaseNotes>((r) => {
            const { summary, breakingNotes } = extractReleaseNotes(r.body);
            return { version: r.version, summary, breakingNotes };
        });
        parsed.sort((a, b) => compareSemver(a.version, b.version));
        return parsed;
    } catch (err) {
        console.error('[Updater] Failed to fetch intermediate releases:', err);
        return [];
    }
};

/**
 * Compare two semantic version strings (e.g., "1.2.3" vs "1.2.4").
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
const compareSemver = (v1: string, v2: string): number => {
    const parse = (v: string) => v.split('.').map(Number);
    const parts1 = parse(v1);
    const parts2 = parse(v2);
    const len = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < len; i++) {
        const a = parts1[i] ?? 0;
        const b = parts2[i] ?? 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
};

/**
 * Extract the major version from a semantic version string.
 */
const getMajorVersion = (version: string): number => {
    const major = parseInt(version.split('.')[0], 10);
    return Number.isNaN(major) ? 0 : major;
};

/**
 * Decide whether to show the update offer based on skip/postpone state.
 */
const shouldOfferUpdate = (newVersion: string): boolean => {
    // If this exact version was skipped, don't offer
    if (updateState.skippedVersion === newVersion) {
        return false;
    }

    // If this version was postponed and 24h hasn't passed, don't offer
    if (updateState.postponedVersion === newVersion && updateState.postponedAt) {
        const now = Date.now();
        const elapsed = now - updateState.postponedAt;
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        if (elapsed < TWENTY_FOUR_HOURS_MS) {
            return false;
        }
    }

    return true;
};

/** Outcome of a single update check, so callers (manual check) can report back. */
type CheckResult = 'offered' | 'none' | 'error';

/**
 * Check for updates on Windows/Linux using electron-updater.
 * Manual checks ignore skip/postpone state and mark the offer accordingly.
 */
const checkForUpdatesWindows = async (getMainWindow: () => BrowserWindow | null, manual: boolean): Promise<CheckResult> => {
    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result || !result.updateInfo) {
            console.log('[Updater] No update available (Windows/Linux)');
            return 'none';
        }

        const updateVersion = result.updateInfo.version;
        if (compareSemver(updateVersion, app.getVersion()) <= 0) {
            // Version is same or older, skip
            console.log(`[Updater] Installed version is up to date (${app.getVersion()})`);
            return 'none';
        }

        if (!manual && !shouldOfferUpdate(updateVersion)) {
            console.log(`[Updater] Update ${updateVersion} skipped/postponed`);
            return 'none';
        }

        // Fetch detailed release notes for the headline release AND every
        // version in between — the modal stacks them so a multi-version
        // upgrade shows the full change history, not just the last.
        const [{ summary, breakingNotes }, intermediateReleases] = await Promise.all([
            fetchReleaseNotes(updateVersion),
            fetchIntermediateReleases(app.getVersion(), updateVersion),
        ]);

        const offer: UpdateOffer = {
            version: updateVersion,
            currentVersion: app.getVersion(),
            isMajor: getMajorVersion(updateVersion) > getMajorVersion(app.getVersion()),
            summary,
            breakingNotes,
            intermediateReleases,
            canAutoInstall: true,
            releaseUrl: `https://github.com/hismindset/hissoundboard/releases/tag/v${updateVersion}`,
            manual,
        };

        currentUpdateOffer = offer;
        getMainWindow()?.webContents.send(CHANNELS.updateAvailable, offer);
        return 'offered';
    } catch (err) {
        console.error('[Updater] Error checking for updates (Windows/Linux):', err);
        return 'error';
    }
};

/**
 * Check for updates on macOS using GitHub API (app is unsigned, electron-updater can't install).
 */
const checkForUpdatesMacOS = async (getMainWindow: () => BrowserWindow | null, manual: boolean): Promise<CheckResult> => {
    try {
        const response = await net.fetch('https://api.github.com/repos/hismindset/hissoundboard/releases/latest');
        if (!response.ok) {
            console.error(`[Updater] Failed to check for updates (macOS) - HTTP ${response.status}`);
            return 'error';
        }

        const release = (await response.json()) as { tag_name: string; body: string; html_url: string };
        const updateVersion = release.tag_name.replace(/^v/, '');

        if (compareSemver(updateVersion, app.getVersion()) <= 0) {
            // Version is same or older
            console.log(`[Updater] Installed version is up to date (${app.getVersion()})`);
            return 'none';
        }

        if (!manual && !shouldOfferUpdate(updateVersion)) {
            console.log(`[Updater] Update ${updateVersion} skipped/postponed`);
            return 'none';
        }

        const { summary, breakingNotes } = extractReleaseNotes(release.body);
        // Pull every release between the running version and the offered one
        // so a multi-version upgrade shows the full change history.
        const intermediateReleases = await fetchIntermediateReleases(app.getVersion(), updateVersion);

        const offer: UpdateOffer = {
            version: updateVersion,
            currentVersion: app.getVersion(),
            isMajor: getMajorVersion(updateVersion) > getMajorVersion(app.getVersion()),
            summary,
            breakingNotes,
            intermediateReleases,
            canAutoInstall: false, // macOS: unsigned, must download manually
            releaseUrl: release.html_url,
            manual,
        };

        currentUpdateOffer = offer;
        getMainWindow()?.webContents.send(CHANNELS.updateAvailable, offer);
        return 'offered';
    } catch (err) {
        console.error('[Updater] Error checking for updates (macOS):', err);
        return 'error';
    }
};

/**
 * Perform the update check, skipping entirely if not packaged (dev mode).
 */
const performUpdateCheck = async (getMainWindow: () => BrowserWindow | null, manual: boolean = false): Promise<CheckResult> => {
    // Only check in packaged mode (production builds)
    if (!app.isPackaged) {
        return 'none';
    }

    if (process.platform === 'darwin') {
        return checkForUpdatesMacOS(getMainWindow, manual);
    }
    return checkForUpdatesWindows(getMainWindow, manual);
};

/**
 * Initialize the auto-updater: set up IPC handlers and schedule startup check.
 */
export const initUpdater = (getMainWindow: () => BrowserWindow | null): void => {
    // Load persisted state
    updateState = readUpdateState();

    // Configure electron-updater for Windows/Linux
    if (process.platform !== 'darwin') {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
    }

    // Register event listeners for electron-updater (once only)
    if (!autoUpdaterListenersRegistered && process.platform !== 'darwin') {
        autoUpdater.on('download-progress', (progress) => {
            getMainWindow()?.webContents.send(CHANNELS.downloadProgress, {
                percent: progress.percent,
            });
        });

        autoUpdater.on('update-downloaded', () => {
            downloading = false;
            setImmediate(() => autoUpdater.quitAndInstall());
        });

        autoUpdater.on('error', (err) => {
            console.error('[Updater] electron-updater error:', err);
            if (downloading) {
                downloading = false;
                getMainWindow()?.webContents.send(CHANNELS.error, {
                    message: err instanceof Error ? err.message : String(err),
                    manual: false,
                });
            }
        });

        autoUpdaterListenersRegistered = true;
    }

    // Schedule automatic check ~5 seconds after mainWindow has finished loading
    const window = getMainWindow();
    if (window) {
        if (window.webContents.isLoading()) {
            window.webContents.once('did-finish-load', () => {
                setTimeout(() => performUpdateCheck(getMainWindow), 5000);
            });
        } else {
            // Already loaded
            setTimeout(() => performUpdateCheck(getMainWindow), 5000);
        }
    }

    // IPC Handlers
    ipcMain.handle(CHANNELS.checkManual, async (): Promise<void> => {
        const window = getMainWindow();
        const result = await performUpdateCheck(getMainWindow, true);
        if (result === 'none') {
            window?.webContents.send(CHANNELS.upToDate, { currentVersion: app.getVersion() });
        } else if (result === 'error') {
            window?.webContents.send(CHANNELS.error, {
                message: 'Could not check for updates. Please check your internet connection and try again.',
                manual: true,
            });
        }
        // 'offered' needs no extra event: the update-available offer was already sent.
    });

    ipcMain.handle(CHANNELS.install, async (): Promise<void> => {
        // No-op on macOS (can't auto-install)
        if (process.platform === 'darwin') return;

        downloading = true;
        try {
            await autoUpdater.downloadUpdate();
        } catch (err) {
            downloading = false;
            const message = err instanceof Error ? err.message : String(err);
            getMainWindow()?.webContents.send(CHANNELS.error, { message, manual: false });
        }
    });

    ipcMain.handle(CHANNELS.postpone, async (): Promise<void> => {
        if (currentUpdateOffer) {
            updateState.postponedVersion = currentUpdateOffer.version;
            updateState.postponedAt = Date.now();
            writeUpdateState(updateState);
        }
    });

    ipcMain.handle(CHANNELS.skip, async (_event, version: string): Promise<void> => {
        updateState.skippedVersion = version;
        updateState.postponedVersion = null;
        updateState.postponedAt = null;
        writeUpdateState(updateState);
    });

    ipcMain.handle(CHANNELS.openDownloadPage, async (): Promise<void> => {
        if (currentUpdateOffer) {
            shell.openExternal(currentUpdateOffer.releaseUrl);
        }
    });

    ipcMain.handle(CHANNELS.getCurrentVersion, async (): Promise<string> => {
        return app.getVersion();
    });

    console.log('[Updater] Initialized');
};
