import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
    CONFIG_SCHEMA_VERSION,
    type AudioSettings,
    type SyncedConfig,
    type LocalSettings,
    type SyncSettings,
    type PersistedPayload,
    type PersistedStateFields,
    type FolderPickResult,
    type ApplyFolderAction,
    type ApplyFolderResult,
    type SyncStatus,
} from '../shared/sync-types';

// ─── configStore ──────────────────────────────────────────────────────────
//
// Owns all file I/O for persisted app state. The main process is the sole
// writer/reader of these files; the renderer only ever talks to it via IPC
// (see main.ts's `state:get-initial` / `state:persist` handlers).
//
//   syncRoot = syncSettings.syncFolder ?? app.getPath('userData')
//
//   <syncRoot>/config.json        synced: library, grid, pages, activePageId,
//                                  voiceEffectParams, shortcutMode
//   <syncRoot>/sounds/            audio files
//   userData/local-settings.json  local: audioSettings, remotePin, hasCompletedSetup
//   userData/sync-settings.json   pointer: { syncFolder, legacySoundsDir? }
//
// WP1 scope: no folder picker, no watcher, no startup dialogs — syncFolder
// is always null here, so syncRoot is always userData. Those land in later
// work packages; this module just needs to already speak the on-disk format
// they'll build on top of.

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
    monitorVolume: 1.0,
    outputVolume: 0.5,
    micVolume: 1.0,
    monitorMuted: false,
    outputMuted: false,
    monitorDeviceId: '',
    outputDeviceId: '',
    micDeviceId: '',
};

let syncSettings: SyncSettings = { version: 1, syncFolder: null };

/** In-memory copy of the last known-good combined state, served to the
 *  renderer on hydration. Null until either config.json or local-settings.json
 *  has actually been read (or written) at least once. */
let cachedPayload: PersistedPayload | null = null;

/** Hash of the last config.json we wrote (or read at startup), so unchanged
 *  writes are skipped — avoids needlessly bumping mtime (which would matter
 *  once the watcher lands in WP4) and needlessly rewriting the .bak file. */
let lastWrittenHash: string | null = null;

/** Timestamp until which the (future, WP4) file watcher should ignore
 *  changes to config.json — we just wrote it ourselves. */
let suppressWatcherUntil = 0;

/** True if the last config.json load had to fall back to `config.json.bak`
 *  because the primary file was corrupt. Drives a one-shot renderer notice
 *  (see `wasCorruptRecovered()` / main.ts's 'sync-recovered-from-backup'). */
let corruptRecovered = false;

/** True while the on-disk config.json was written by a newer app version
 *  (`schemaVersion` ahead of ours) and must never be overwritten. Checked by
 *  `persistFromRenderer()`, which then skips the config.json write. */
let writesSuppressed = false;

// ─── Paths ────────────────────────────────────────────────────────────────

const getSyncSettingsPath = (): string =>
    path.join(app.getPath('userData'), 'sync-settings.json');

const getLocalSettingsPath = (): string =>
    path.join(app.getPath('userData'), 'local-settings.json');

const getConfigPath = (): string => path.join(getSyncRoot(), 'config.json');

// ─── File helpers ─────────────────────────────────────────────────────────

const sha1 = (text: string): string =>
    crypto.createHash('sha1').update(text).digest('hex');

/** Read + JSON.parse a file. On a parse error, retry `<file>.bak`. If both
 *  are missing/corrupt, log and return `{ config: null, recovered: false }` —
 *  the caller falls back to defaults (and, for config.json under a sync
 *  folder, offers the corruption-recovery dialog in `init()`).
 *  `recovered` is true only when the primary file was corrupt AND the
 *  `.bak` fallback parsed successfully. */
function readConfigWithRecovery<T>(filePath: string): { config: T | null; recovered: boolean } {
    if (!fs.existsSync(filePath)) return { config: null, recovered: false };
    try {
        return { config: JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T, recovered: false };
    } catch (err) {
        console.error(`[ConfigStore] Failed to parse ${filePath}:`, err);
        const backupPath = `${filePath}.bak`;
        if (fs.existsSync(backupPath)) {
            try {
                console.error(`[ConfigStore] Falling back to ${backupPath}`);
                return { config: JSON.parse(fs.readFileSync(backupPath, 'utf-8')) as T, recovered: true };
            } catch (backupErr) {
                console.error(`[ConfigStore] Backup ${backupPath} is also corrupt:`, backupErr);
            }
        }
        return { config: null, recovered: false };
    }
}

/** Plain read, no recovery bookkeeping — used for sync-settings.json and
 *  local-settings.json, where a corrupt file just falls back to defaults. */
function readJsonFile<T>(filePath: string): T | null {
    return readConfigWithRecovery<T>(filePath).config;
}

/** Atomic write: write `<file>.tmp`, optionally snapshot the current file to
 *  `<file>.bak`, then rename over the real path. `fs.renameSync` is atomic
 *  on the same volume, so a crash mid-write never leaves a half-written
 *  config.json. */
function writeFileAtomic(filePath: string, contents: string, withBackup: boolean): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, contents, 'utf-8');
    if (withBackup && fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, `${filePath}.bak`);
    }
    fs.renameSync(tmpPath, filePath);
}

// ─── Building the on-disk shapes from flat store state ───────────────────
//
// The persisted store state is split by key into the synced config.json
// (SYNCED_KEYS) and the local-only local-settings.json (LOCAL_KEYS). The two
// build functions below encode that split with full type-checking; the key
// lists themselves double as documentation of the split.

const SYNCED_KEYS = ['library', 'grid', 'pages', 'activePageId', 'voiceEffectParams', 'shortcutMode'] as const;
const LOCAL_KEYS = ['audioSettings', 'remotePin', 'hasCompletedSetup'] as const;

function buildSyncedConfig(state: Pick<PersistedStateFields, (typeof SYNCED_KEYS)[number]>): SyncedConfig {
    return {
        app: 'hissoundboard',
        schemaVersion: CONFIG_SCHEMA_VERSION,
        library: state.library,
        grid: state.grid,
        pages: state.pages,
        activePageId: state.activePageId,
        voiceEffectParams: state.voiceEffectParams,
        shortcutMode: state.shortcutMode,
    };
}

function buildLocalSettings(state: Pick<PersistedStateFields, (typeof LOCAL_KEYS)[number]>): LocalSettings {
    return {
        version: 1,
        audioSettings: state.audioSettings,
        remotePin: state.remotePin,
        hasCompletedSetup: state.hasCompletedSetup,
    };
}

// ─── Folder classification (WP2) ───────────────────────────────────────────
//
// Sync clients (Nextcloud, iCloud, Git, ...) leave housekeeping files behind
// in an otherwise "empty" folder, and Git needs `.git` to exist for the
// folder to be usable as a repo. Both are tolerated by the emptiness check.

const IGNORED_FILE_NAMES = new Set(['desktop.ini', 'thumbs.db', 'icon\r']);

function isIgnoredEntry(name: string): boolean {
    return name.startsWith('.') || IGNORED_FILE_NAMES.has(name.toLowerCase());
}

function isValidConfigFolder(folder: string): boolean {
    const configPath = path.join(folder, 'config.json');
    if (!fs.existsSync(configPath)) return false;
    try {
        const json = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return !!json && json.app === 'hissoundboard';
    } catch {
        return false;
    }
}

function isEmptyFolder(folder: string): boolean {
    if (!fs.existsSync(folder)) return true;
    const entries = fs.readdirSync(folder).filter((name) => !isIgnoredEntry(name));
    return entries.length === 0;
}

/** True if `child` is `parent`, or lives anywhere underneath it. */
function isPathInside(child: string, parent: string): boolean {
    if (child === parent) return true;
    const rel = path.relative(parent, child);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function localHasData(): boolean {
    if (!cachedPayload) return false;
    const state = cachedPayload.state;
    return Object.keys(state.library).length > 0 || state.pages.length > 0;
}

/** Classify a folder the user picked as a candidate sync root — used both by
 *  `pickFolder` (after the native dialog) and directly against a path. */
function classifyFolder(folder: string): FolderPickResult {
    const resolved = path.resolve(folder);
    const currentRoot = path.resolve(getSyncRoot());

    if (isPathInside(resolved, currentRoot) || isPathInside(currentRoot, resolved)) {
        return { status: 'invalid-nested', folder };
    }

    if (isValidConfigFolder(resolved)) {
        return { status: 'valid-config', folder, localHasData: localHasData() };
    }

    if (isEmptyFolder(resolved)) {
        return { status: 'empty', folder, localHasData: localHasData() };
    }

    return { status: 'invalid-nonempty', folder };
}

async function pickFolder(win: BrowserWindow): Promise<FolderPickResult> {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { status: 'cancelled' };
    }
    return classifyFolder(result.filePaths[0]);
}

function formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Rename (cheap, same volume) with a copy+delete fallback (cross-volume). */
function moveWithFallback(src: string, dst: string): void {
    if (!fs.existsSync(src)) return;
    try {
        fs.renameSync(src, dst);
    } catch {
        fs.copyFileSync(src, dst);
        fs.unlinkSync(src);
    }
}

function buildEmptySyncedConfig(shortcutMode: SyncedConfig['shortcutMode']): SyncedConfig {
    return {
        app: 'hissoundboard',
        schemaVersion: CONFIG_SCHEMA_VERSION,
        library: {},
        grid: {},
        pages: [],
        activePageId: '',
        voiceEffectParams: {},
        shortcutMode,
    };
}

/** Normalize a parsed config.json payload into a schema-current SyncedConfig,
 *  filling in defaults for anything missing (pre-v7 / partial configs, or a
 *  file caught mid-write before every field landed). Shared by applyAdopt()
 *  and the WP4 watcher's performReload(). */
function normalizeSyncedConfig(raw: any): SyncedConfig {
    return {
        app: 'hissoundboard',
        schemaVersion: CONFIG_SCHEMA_VERSION,
        library: raw.library ?? {},
        grid: raw.grid ?? {},
        pages: raw.pages ?? [],
        activePageId: raw.activePageId ?? '',
        voiceEffectParams: raw.voiceEffectParams ?? {},
        shortcutMode: raw.shortcutMode === 'standard' ? 'standard' : 'numpad',
    };
}

/** Point sync-settings.json + in-memory state at `folder`, given the
 *  `SyncedConfig` that is now in effect there. Shared tail of all three
 *  apply-folder actions. Local-only fields (audio/pin/setup) are carried
 *  over from whatever we had cached before. */
function commitFolder(folder: string, synced: SyncedConfig): void {
    syncSettings = { ...syncSettings, syncFolder: folder, legacySoundsDir: undefined };
    writeFileAtomic(getSyncSettingsPath(), JSON.stringify(syncSettings, null, 2), false);

    const priorState = cachedPayload?.state;
    const nextState: PersistedStateFields = {
        library: synced.library,
        grid: synced.grid,
        pages: synced.pages,
        activePageId: synced.activePageId,
        voiceEffectParams: synced.voiceEffectParams,
        shortcutMode: synced.shortcutMode,
        audioSettings: priorState?.audioSettings ?? DEFAULT_AUDIO_SETTINGS,
        remotePin: priorState?.remotePin ?? '',
        hasCompletedSetup: priorState?.hasCompletedSetup ?? false,
    };
    cachedPayload = { state: nextState, version: CONFIG_SCHEMA_VERSION };
    lastWrittenHash = sha1(JSON.stringify(synced, null, 2));

    // The sync root just changed (or was (re)established) — point the WP4
    // watcher at it. No-op if the watcher hasn't been started yet (e.g. this
    // runs during configStore.init(), before main.ts calls startWatcher()
    // for the first time after createWindow()).
    restartWatcher();
}

/** Case 1/3a "no": start fresh in `folder`. If the app currently has local
 *  data, that data is intentionally left behind (untouched) in the old
 *  root and the new folder starts from an empty board. Otherwise the
 *  (already empty) current state is written there verbatim. */
function applyFresh(folder: string): ApplyFolderResult {
    fs.mkdirSync(path.join(folder, 'sounds'), { recursive: true });

    const currentShortcutMode = cachedPayload?.state.shortcutMode ?? 'numpad';
    const synced = localHasData()
        ? buildEmptySyncedConfig(currentShortcutMode)
        : cachedPayload
            ? buildSyncedConfig(cachedPayload.state)
            : buildEmptySyncedConfig(currentShortcutMode);

    writeFileAtomic(path.join(folder, 'config.json'), JSON.stringify(synced, null, 2), false);
    commitFolder(folder, synced);
    return { ok: true, syncedState: synced };
}

/** Case 3a "yes": move everything (config + sound files) into `folder`,
 *  copy-first so originals are never lost if something fails mid-move. */
function applyMoveLocal(folder: string): ApplyFolderResult {
    try {
        const oldRoot = getSyncRoot();
        const oldSoundsDir = getSoundsDir();
        const synced = cachedPayload ? buildSyncedConfig(cachedPayload.state) : buildEmptySyncedConfig('numpad');

        // 1) Write the synced state + create the sounds dir in the new folder.
        writeFileAtomic(path.join(folder, 'config.json'), JSON.stringify(synced, null, 2), false);
        const newSoundsDir = path.join(folder, 'sounds');
        fs.mkdirSync(newSoundsDir, { recursive: true });

        // 2) Move every sound file. Try the cheap same-volume rename first;
        //    fall back to copy + size-verify + delete for cross-volume moves.
        //    Originals are only ever removed after their copy is verified.
        if (fs.existsSync(oldSoundsDir)) {
            for (const name of fs.readdirSync(oldSoundsDir)) {
                const src = path.join(oldSoundsDir, name);
                if (!fs.statSync(src).isFile()) continue;
                const dst = path.join(newSoundsDir, name);
                try {
                    fs.renameSync(src, dst);
                } catch {
                    fs.copyFileSync(src, dst);
                    if (fs.statSync(src).size !== fs.statSync(dst).size) {
                        throw new Error(`Failed to copy "${name}" to the new folder (size mismatch).`);
                    }
                    fs.unlinkSync(src);
                }
            }
        }

        // 3) Only now that every file made it across: archive the old
        //    config.json (never delete it outright) and drop the old sounds
        //    dir if it's empty.
        const oldConfigPath = path.join(oldRoot, 'config.json');
        if (fs.existsSync(oldConfigPath)) {
            fs.renameSync(oldConfigPath, `${oldConfigPath}.moved-${formatTimestamp(new Date())}`);
        }
        if (fs.existsSync(oldSoundsDir)) {
            try {
                if (fs.readdirSync(oldSoundsDir).length === 0) fs.rmdirSync(oldSoundsDir);
            } catch {
                // Best-effort cleanup only — leaving an empty dir behind is harmless.
            }
        }

        commitFolder(folder, synced);
        return { ok: true, syncedState: synced };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: `${message} Your original files were left untouched; the target folder may contain partial copies.`,
        };
    }
}

/** Case 2/4: adopt the config already sitting in `folder`. If the app has
 *  local data, it's backed up (never deleted) under userData first. */
function applyAdopt(folder: string): ApplyFolderResult {
    try {
        const resolved = path.resolve(folder);
        if (!isValidConfigFolder(resolved)) {
            return { ok: false, error: 'The selected folder does not contain a valid HISSOUNDBOARD configuration.' };
        }

        const configPath = path.join(folder, 'config.json');
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > CONFIG_SCHEMA_VERSION) {
            return {
                ok: false,
                error: 'This folder was created by a newer version of HISSOUNDBOARD. Please update the app first.',
            };
        }

        let backupPath: string | undefined;
        if (localHasData()) {
            const oldRoot = getSyncRoot();
            const oldSoundsDir = getSoundsDir();
            const backupDir = path.join(app.getPath('userData'), `backup-${formatTimestamp(new Date())}`);
            fs.mkdirSync(backupDir, { recursive: true });

            moveWithFallback(path.join(oldRoot, 'config.json'), path.join(backupDir, 'config.json'));
            moveWithFallback(path.join(oldRoot, 'config.json.bak'), path.join(backupDir, 'config.json.bak'));

            if (fs.existsSync(oldSoundsDir)) {
                const backupSoundsDir = path.join(backupDir, 'sounds');
                fs.mkdirSync(backupSoundsDir, { recursive: true });
                for (const name of fs.readdirSync(oldSoundsDir)) {
                    moveWithFallback(path.join(oldSoundsDir, name), path.join(backupSoundsDir, name));
                }
                try {
                    if (fs.readdirSync(oldSoundsDir).length === 0) fs.rmdirSync(oldSoundsDir);
                } catch {
                    // Best-effort cleanup only.
                }
            }
            backupPath = backupDir;
        }

        // Normalize: fill in anything missing (pre-v7 / partial configs) with defaults.
        const synced: SyncedConfig = normalizeSyncedConfig(raw);

        fs.mkdirSync(path.join(folder, 'sounds'), { recursive: true });
        commitFolder(folder, synced);
        // Seed the write-suppression hash from what's actually on disk (not our
        // in-memory normalized copy), so an un-normalized-but-valid file isn't
        // immediately rewritten just because we filled in defaults in memory.
        lastWrittenHash = sha1(fs.readFileSync(configPath, 'utf-8'));

        return { ok: true, syncedState: synced, backupPath };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

function applyFolder(folder: string, action: ApplyFolderAction): ApplyFolderResult {
    try {
        switch (action) {
            case 'fresh':
                return applyFresh(folder);
            case 'move-local':
                return applyMoveLocal(folder);
            case 'adopt':
                return applyAdopt(folder);
            default:
                return { ok: false, error: `Unknown folder action: ${action}` };
        }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

function getStatus(): SyncStatus {
    return { folder: syncSettings.syncFolder, soundsDir: getSoundsDir() };
}

// ─── Startup guard (WP3) ────────────────────────────────────────────────────
//
// Only runs when a sync folder is actually configured. Local mode
// (syncFolder === null) never shows a dialog — see the sanity constraint in
// the WP3 plan: local startup must behave exactly as before.

/** A configured sync folder is "reachable" if it exists as a directory AND
 *  already has a config.json in it. Missing either means the mount hasn't
 *  come up yet (or was removed) — starting anyway would mean writing an
 *  empty board over the user's synced data the moment they save. */
function isSyncFolderReachable(folder: string): boolean {
    try {
        if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return false;
    } catch {
        return false;
    }
    return fs.existsSync(path.join(folder, 'config.json'));
}

/** Blocking pre-window loop: retry / pick a different folder / quit, until
 *  the configured sync folder (possibly swapped for a new one) is reachable.
 *  Returns true if the app is quitting (caller must stop `init()` right
 *  away — `app.exit()` is synchronous in the real app, but the test stub
 *  isn't, so every call site still returns explicitly). */
function runStartupFolderGuard(): boolean {
    while (true) {
        const folder = syncSettings.syncFolder;
        if (folder === null || isSyncFolderReachable(folder)) return false;

        const choice = dialog.showMessageBoxSync({
            type: 'error',
            title: 'Sync Folder Unavailable',
            message: `Your sync folder is not reachable:\n${folder}`,
            detail: 'It may not be mounted or fully synced yet. HISSOUNDBOARD will not start with an empty board, to protect your synced data.',
            buttons: ['Retry', 'Choose Another Folder…', 'Quit'],
            defaultId: 0,
            cancelId: 2,
        });

        if (choice === 0) continue; // Retry
        if (choice === 2) {
            app.exit(0);
            return true; // Quit
        }

        // Choose Another Folder…
        const picked = dialog.showOpenDialogSync({
            properties: ['openDirectory', 'createDirectory'],
        });
        if (!picked || picked.length === 0) continue; // cancelled -> show the error dialog again

        const classification = classifyFolder(picked[0]);
        switch (classification.status) {
            case 'valid-config': {
                // The old folder is unreachable, so there's no local data to
                // preserve here — just point at the new folder and let the
                // normal load logic below read its config.json (with the
                // usual corruption/schemaVersion checks).
                syncSettings = { ...syncSettings, syncFolder: classification.folder, legacySoundsDir: undefined };
                writeFileAtomic(getSyncSettingsPath(), JSON.stringify(syncSettings, null, 2), false);
                return false;
            }
            case 'empty': {
                const startChoice = dialog.showMessageBoxSync({
                    type: 'question',
                    title: 'Start Empty Here?',
                    message: 'This folder is empty. Start with an empty soundboard stored in this folder?',
                    buttons: ['Start Empty', 'Back'],
                    defaultId: 0,
                    cancelId: 1,
                });
                if (startChoice !== 0) continue; // Back -> loop, show the error dialog again

                // cachedPayload is still null at this point (nothing loaded
                // yet), so applyFresh's localHasData() check is false and it
                // writes a clean empty-defaults config.json.
                const result = applyFolder(classification.folder, 'fresh');
                if (!result.ok) {
                    dialog.showMessageBoxSync({
                        type: 'error',
                        title: 'Could Not Start Here',
                        message: result.error ?? 'Failed to set up the selected folder.',
                        buttons: ['OK'],
                    });
                    continue;
                }
                return false;
            }
            case 'invalid-nonempty':
            case 'invalid-nested':
                dialog.showMessageBoxSync({
                    type: 'error',
                    title: 'Invalid Folder',
                    message: 'Please choose an empty folder or an existing HISSOUNDBOARD sync folder.',
                    buttons: ['OK'],
                });
                continue;
            case 'cancelled':
                continue;
        }
    }
}

interface GuardedConfigLoad {
    config: SyncedConfig | null;
    recovered: boolean;
    /** True if the app is quitting — see `runStartupFolderGuard()`. */
    exited: boolean;
}

/** Blocking loop around reading config.json once the folder itself is known
 *  reachable: handles total corruption (both config.json and .bak unusable)
 *  and a config written by a newer app version (`schemaVersion` ahead of
 *  ours), both with a Retry/Quit dialog. Only called when a sync folder is
 *  configured — local mode keeps the old silent-fallback behavior. */
function loadSyncedConfigGuarded(): GuardedConfigLoad {
    const configPath = getConfigPath();
    while (true) {
        const { config, recovered } = readConfigWithRecovery<SyncedConfig>(configPath);
        const fileExists = fs.existsSync(configPath);

        if (config === null && fileExists) {
            const choice = dialog.showMessageBoxSync({
                type: 'error',
                title: 'Sync Configuration Corrupted',
                message: 'Your sync configuration file is corrupted and could not be recovered.',
                detail: 'If the folder is still syncing, wait and retry.',
                buttons: ['Retry', 'Quit'],
                defaultId: 0,
                cancelId: 1,
            });
            if (choice === 1) {
                app.exit(0);
                return { config: null, recovered: false, exited: true };
            }
            continue; // Retry
        }

        const tooNew = !!config && typeof config.schemaVersion === 'number' && config.schemaVersion > CONFIG_SCHEMA_VERSION;
        // Set every iteration so a successful (non-too-new) exit always
        // leaves this false, and a Quit-while-too-new exit leaves it true —
        // persistFromRenderer() must never write config.json in that state.
        writesSuppressed = tooNew;
        if (tooNew) {
            const choice = dialog.showMessageBoxSync({
                type: 'error',
                title: 'Update Required',
                message: 'This sync folder was written by a newer version of HISSOUNDBOARD. Please update the app.',
                buttons: ['Retry', 'Quit'],
                defaultId: 0,
                cancelId: 1,
            });
            if (choice === 1) {
                app.exit(0);
                return { config: null, recovered: false, exited: true };
            }
            continue; // Retry
        }

        return { config, recovered, exited: false };
    }
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Read sync-settings.json, config.json and local-settings.json into memory.
 *  Must run before `createWindow()` so `getSoundsDir()` is correct from the
 *  very first frame (fixes the old cold-start bug where main only learned
 *  about a custom sounds dir once Settings was opened).
 *
 *  When a sync folder is configured, this blocks (native sync dialogs, no
 *  window exists yet) until the folder is reachable and its config.json is
 *  readable and not from a newer app version — see the WP3 plan's
 *  "Startup-Guard" section. Local mode (no sync folder) never blocks. */
function init(): void {
    syncSettings = readJsonFile<SyncSettings>(getSyncSettingsPath()) ?? { version: 1, syncFolder: null };

    corruptRecovered = false;
    writesSuppressed = false;
    // Reset the write-suppression hash up front. It only makes sense relative
    // to whatever's on disk for the root we just resolved above — carrying
    // over a hash from a previous root (e.g. after the guard below swaps in
    // a different folder) would risk wrongly suppressing the very first
    // write to the new root.
    lastWrittenHash = null;

    if (syncSettings.syncFolder !== null) {
        if (runStartupFolderGuard()) return; // quitting
    }

    let synced: SyncedConfig | null;
    if (syncSettings.syncFolder !== null) {
        const result = loadSyncedConfigGuarded();
        if (result.exited) return; // quitting
        synced = result.config;
        corruptRecovered = result.recovered;
    } else {
        const { config, recovered } = readConfigWithRecovery<SyncedConfig>(getConfigPath());
        synced = config;
        corruptRecovered = recovered;
    }

    const local = readJsonFile<LocalSettings>(getLocalSettingsPath());

    if (!synced && !local) {
        // Nothing written yet — either a brand-new install, or an existing
        // v6 user upgrading. Either way, the renderer's storage adapter
        // falls back to the legacy localStorage payload and zustand's
        // `migrate` runs; the first persistState() call then creates both
        // files here.
        cachedPayload = null;
        return;
    }

    const state: PersistedStateFields = {
        library: synced?.library ?? {},
        grid: synced?.grid ?? {},
        pages: synced?.pages ?? [],
        activePageId: synced?.activePageId ?? '',
        voiceEffectParams: synced?.voiceEffectParams ?? {},
        // schemaVersion < CONFIG_SCHEMA_VERSION is accepted as-is here: missing
        // fields are simply defaulted below, which is forward-migration enough
        // since v7 is the first on-disk file version.
        shortcutMode: synced?.shortcutMode ?? 'numpad',
        audioSettings: local?.audioSettings ?? DEFAULT_AUDIO_SETTINGS,
        remotePin: local?.remotePin ?? '',
        hasCompletedSetup: local?.hasCompletedSetup ?? false,
    };

    cachedPayload = { state, version: CONFIG_SCHEMA_VERSION };

    // Seed the write-suppression hash from what's on disk so an unmodified
    // session doesn't rewrite an already up-to-date config.json.
    if (synced) {
        lastWrittenHash = sha1(JSON.stringify(buildSyncedConfig(state), null, 2));
    }
}

function getSyncRoot(): string {
    return syncSettings.syncFolder ?? app.getPath('userData');
}

function getSoundsDir(): string {
    if (syncSettings.legacySoundsDir) {
        return syncSettings.legacySoundsDir;
    }
    return path.join(getSyncRoot(), 'sounds');
}

/** Pre-v7 users had a free-text custom sounds dir; honor it until a real
 *  sync folder is chosen (WP2's move flow then migrates it in). */
function setLegacySoundsDir(dir: string): void {
    syncSettings = { ...syncSettings, legacySoundsDir: dir };
    writeFileAtomic(getSyncSettingsPath(), JSON.stringify(syncSettings, null, 2), false);
}

function getInitialPersistedPayload(): PersistedPayload | null {
    return cachedPayload;
}

/** Split the flat zustand persist payload into config.json (synced) and
 *  local-settings.json (local), and write both. Fully synchronous (uses
 *  fs.*Sync throughout) so `flushSync()` never needs to await anything. */
function persistFromRenderer(payload: PersistedPayload): void {
    const state = payload.state;
    const local = buildLocalSettings(state);

    // A newer app version wrote this config.json (schemaVersion ahead of
    // ours) — never overwrite it with our (older-shaped) understanding of
    // the state. local-settings.json is unaffected: it's local-only and has
    // no schemaVersion of its own.
    if (writesSuppressed) {
        console.warn('[ConfigStore] Skipping config.json write: a newer app version owns this sync folder.');
    } else {
        const synced = buildSyncedConfig(state);
        const configJson = JSON.stringify(synced, null, 2);
        const hash = sha1(configJson);

        if (hash !== lastWrittenHash) {
            writeFileAtomic(getConfigPath(), configJson, true);
            lastWrittenHash = hash;
            // Consumed by the WP4 file watcher to ignore the change we just made.
            suppressWatcherUntil = Date.now() + 2000;
        }
    }

    // local-settings.json never leaves the machine and is never watched, so
    // it's always written directly (no .bak — losing a local setting is
    // low-stakes and gets re-derived from the UI on next change).
    writeFileAtomic(getLocalSettingsPath(), JSON.stringify(local, null, 2), false);

    cachedPayload = { state, version: CONFIG_SCHEMA_VERSION };
}

/** Hook for `app.on('before-quit')`. persistFromRenderer() writes
 *  synchronously (fs.*Sync APIs), so there is never a write "in flight" to
 *  flush here — this exists as the contractual hook point for later work
 *  packages (e.g. WP4's watcher) that may need to guarantee a final write. */
function flushSync(): void {
    // Intentionally empty — see comment above.
}

// ─── Watcher (WP4: live external updates) ──────────────────────────────────
//
// Watches the sync root DIRECTORY (not config.json itself), because sync
// clients (Nextcloud, iCloud, Git, ...) typically replace the file via a
// temp-write + rename rather than an in-place write — a watch on the file
// handle itself would silently die the moment that happens. Changes are
// debounced (cloud clients tend to write in bursts) and our own writes are
// recognized — and ignored — by comparing the file's content hash against
// `lastWrittenHash`, which persistFromRenderer() and every applyFolder
// action keep current. Falls back to mtime/size polling if `fs.watch` isn't
// supported on the mount (some network filesystems) or errors at runtime.

interface WatcherHandlers {
    /** Fired once per external change, with the already-normalized config. */
    onExternalUpdate: (synced: SyncedConfig) => void;
    /** Fired when the folder now contains a config.json written by a newer
     *  app version. `writesSuppressed` is already true by the time this fires. */
    onNewerVersion: () => void;
}

const WATCH_DEBOUNCE_MS = 750;
const POLL_INTERVAL_MS = 5000;
const PARSE_RETRY_MAX = 5;
const RETRY_DELAY_MS = 1000;

let watcher: fs.FSWatcher | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollStat: { mtimeMs: number; size: number } | null = null;
let reloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let parseRetryCount = 0;
let watcherHandlers: WatcherHandlers | null = null;

function scheduleReload(): void {
    if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
    reloadDebounceTimer = setTimeout(() => {
        reloadDebounceTimer = null;
        performReload(false);
    }, WATCH_DEBOUNCE_MS);
}

/** Read + validate + apply the current config.json. `isRetry` distinguishes a
 *  scheduled retry (ENOENT / parse-error backoff) from a fresh watcher event,
 *  so a missing file only ever gets one extra attempt and a corrupt one gets
 *  up to PARSE_RETRY_MAX before giving up until the next watcher event. */
function performReload(isRetry: boolean): void {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }

    const configPath = getConfigPath();
    let content: string;
    try {
        content = fs.readFileSync(configPath, 'utf-8');
    } catch {
        // File may be mid-replace (temp+rename) — give it one more beat.
        if (!isRetry) {
            retryTimer = setTimeout(() => performReload(true), RETRY_DELAY_MS);
        }
        return;
    }

    const hash = sha1(content);
    if (hash === lastWrittenHash) return; // our own write — echo, not an external change

    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch (err) {
        parseRetryCount++;
        if (parseRetryCount <= PARSE_RETRY_MAX) {
            retryTimer = setTimeout(() => performReload(true), RETRY_DELAY_MS);
        } else {
            console.error(
                `[ConfigStore] Watcher: config.json failed to parse ${PARSE_RETRY_MAX} times in a row, giving up until the next change:`,
                err
            );
            parseRetryCount = 0;
        }
        return;
    }
    parseRetryCount = 0;

    if (!parsed || parsed.app !== 'hissoundboard') return; // not our config — ignore silently

    const schemaVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
    if (schemaVersion > CONFIG_SCHEMA_VERSION) {
        // A newer app version owns this folder now — never clobber it with our
        // older understanding of the state. Still record the hash so we don't
        // re-trigger on the exact same content next time around.
        writesSuppressed = true;
        lastWrittenHash = hash;
        watcherHandlers?.onNewerVersion();
        return;
    }
    // The folder is at (or back to) a compatible schema version — lift any
    // previous newer-version write suppression.
    writesSuppressed = false;

    const normalized = normalizeSyncedConfig(parsed);
    lastWrittenHash = hash;

    const priorState = cachedPayload?.state;
    cachedPayload = {
        state: {
            library: normalized.library,
            grid: normalized.grid,
            pages: normalized.pages,
            activePageId: normalized.activePageId,
            voiceEffectParams: normalized.voiceEffectParams,
            shortcutMode: normalized.shortcutMode,
            audioSettings: priorState?.audioSettings ?? DEFAULT_AUDIO_SETTINGS,
            remotePin: priorState?.remotePin ?? '',
            hasCompletedSetup: priorState?.hasCompletedSetup ?? false,
        },
        version: CONFIG_SCHEMA_VERSION,
    };

    watcherHandlers?.onExternalUpdate(normalized);
}

function pollOnce(): void {
    try {
        const st = fs.statSync(getConfigPath());
        const changed = !pollStat || st.mtimeMs !== pollStat.mtimeMs || st.size !== pollStat.size;
        pollStat = { mtimeMs: st.mtimeMs, size: st.size };
        if (changed) scheduleReload();
    } catch {
        // Missing (mid-replace, or an unmounted network share) — next tick rechecks.
    }
}

function startPollingFallback(): void {
    if (pollTimer) return; // already polling
    pollStat = null;
    pollOnce(); // seed the baseline without triggering a spurious reload
    pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

function stopPollingFallback(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    pollStat = null;
}

/** Start watching the current sync root for external changes to config.json.
 *  Safe to call repeatedly — always stops any previous watcher/poll first, so
 *  this also serves as the "restart on a new root" entry point (see
 *  `restartWatcher`, called from `commitFolder` whenever applyFolder switches
 *  the sync root). */
function startWatcher(handlers: WatcherHandlers): void {
    stopWatcher();
    watcherHandlers = handlers;
    parseRetryCount = 0;

    const syncRoot = getSyncRoot();
    try {
        watcher = fs.watch(syncRoot, { persistent: true }, (_evt, filename) => {
            if (filename && filename !== 'config.json') return;
            scheduleReload();
        });
        watcher.on('error', (err) => {
            console.error('[ConfigStore] Watcher error, falling back to polling:', err);
            if (watcher) {
                watcher.close();
                watcher = null;
            }
            startPollingFallback();
        });
    } catch (err) {
        // Some network mounts don't support fs.watch at all.
        console.error('[ConfigStore] fs.watch failed, falling back to polling:', err);
        startPollingFallback();
    }
}

function stopWatcher(): void {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    stopPollingFallback();
    if (reloadDebounceTimer) {
        clearTimeout(reloadDebounceTimer);
        reloadDebounceTimer = null;
    }
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    parseRetryCount = 0;
    watcherHandlers = null;
}

/** Re-point the watcher at the (possibly new) sync root. No-op if the
 *  watcher hasn't been started yet at all (e.g. this runs during
 *  configStore.init(), before main.ts's first startWatcher() call). */
function restartWatcher(): void {
    if (!watcherHandlers) return;
    startWatcher(watcherHandlers);
}

export const configStore = {
    init,
    getSyncRoot,
    getSoundsDir,
    setLegacySoundsDir,
    getInitialPersistedPayload,
    persistFromRenderer,
    flushSync,
    /** Exposed for the (future) file watcher to check against. */
    getSuppressWatcherUntil: () => suppressWatcherUntil,
    /** True if the last `init()` had to recover config.json from its .bak
     *  backup — drives a one-shot, non-blocking renderer notice. */
    wasCorruptRecovered: () => corruptRecovered,
    // ─── Folder selection (WP2) ────────────────────────────────────────────
    classifyFolder,
    pickFolder,
    applyFolder,
    getStatus,
    // ─── Watcher (WP4) ──────────────────────────────────────────────────────
    startWatcher,
    stopWatcher,
};
