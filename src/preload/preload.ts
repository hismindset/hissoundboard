import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';
import type { PersistedPayload, FolderPickResult, ApplyFolderAction, ApplyFolderResult, SyncStatus, SyncedConfig } from '../shared/sync-types';
import { UPDATER_CHANNELS } from '../shared/updater-types';
import type { UpdateOffer, UpdateProgress, UpdateError, UpToDateInfo } from '../shared/updater-types';

export interface TriggerSoundPayload {
    page?: number; // Legacy index support
    pageId?: string; // New ID support
    slot: number;
}

export interface PageConfig {
    id: string;
    modifierKeys: number[];
}

export interface ShortcutConfig {
    mode: 'numpad' | 'standard';
    pages: PageConfig[];
}

const api = {
    // ─── Main → Renderer Events ──────────────────────────────────────────────

    /** Triggered by global shortcut or remote to play a specific sound */
    onTriggerSound: (callback: (payload: TriggerSoundPayload) => void) => {
        const handler = (_event: IpcRendererEvent, payload: TriggerSoundPayload) =>
            callback(payload);
        ipcRenderer.on('trigger-sound', handler);
        return () => ipcRenderer.removeListener('trigger-sound', handler);
    },

    /** Panic button: stop all sounds immediately */
    onPanicStop: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('panic-stop', handler);
        return () => ipcRenderer.removeListener('panic-stop', handler);
    },

    /** Remote control requests current sounds list */
    onRequestSoundsForRemote: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('request-sounds-for-remote', handler);
        return () =>
            ipcRenderer.removeListener('request-sounds-for-remote', handler);
    },

    /** Listen to Wayland fallback warning */
    onWaylandWarning: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('wayland-warning', handler);
        return () => ipcRenderer.removeListener('wayland-warning', handler);
    },

    /** Notice: config.json was unreadable at startup and got recovered from
     *  its .bak backup (config-sync WP3). */
    onSyncRecoveredFromBackup: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('sync-recovered-from-backup', handler);
        return () => ipcRenderer.removeListener('sync-recovered-from-backup', handler);
    },

    /** Live update: config.json changed on disk outside this app (another
     *  device, a sync client) and was already validated + normalized by main
     *  (config-sync WP4). */
    onExternalStateUpdate: (callback: (synced: SyncedConfig) => void) => {
        const handler = (_event: IpcRendererEvent, synced: SyncedConfig) => callback(synced);
        ipcRenderer.on('state:external-update', handler);
        return () => ipcRenderer.removeListener('state:external-update', handler);
    },

    /** Notice: the sync folder now contains a config.json written by a newer
     *  app version. Writes are paused (writesSuppressed) until the folder is
     *  back at a compatible schema version (config-sync WP4). */
    onSyncNewerVersion: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('sync-newer-version', handler);
        return () => ipcRenderer.removeListener('sync-newer-version', handler);
    },

    /** Receive recorded key codes from main process */
    onKeyRecorded: (callback: (keyCode: number) => void) => {
        const handler = (_event: IpcRendererEvent, keyCode: number) => callback(keyCode);
        ipcRenderer.on('key-recorded', handler);
        return () => ipcRenderer.removeListener('key-recorded', handler);
    },

    /** Help menu → open the in-app help popup */
    onShowHelp: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('show-help', handler);
        return () => ipcRenderer.removeListener('show-help', handler);
    },

    /** Help menu → open the "More Help" easter-egg popup */
    onShowEasterEgg: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('show-easter-egg', handler);
        return () => ipcRenderer.removeListener('show-easter-egg', handler);
    },

    // ─── Renderer → Main Invocations ─────────────────────────────────────────

    /** Copy a dropped sound file to the app's sounds directory */
    saveSoundFile: (sourcePath: string, fileName: string): Promise<string> =>
        ipcRenderer.invoke('save-sound-file', sourcePath, fileName),

    /** Get local network IP and server port for QR code */
    getLocalIp: (): Promise<{ ip: string; port: number }> =>
        ipcRenderer.invoke('get-local-ip'),

    /** Download an MP3 from a URL into the sounds directory */
    downloadUrl: (url: string): Promise<string> =>
        ipcRenderer.invoke('download-url', url),

    /** Get the native file path from a dropped File object */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),

    /** Get the path to the sounds directory */
    getSoundsDir: (): Promise<string> => ipcRenderer.invoke('get-sounds-dir'),

    // ─── Persisted State (config-sync) ───────────────────────────────────────

    /** Synchronously read the current persisted state from main (used to
     *  hydrate the zustand store on startup). Null if main has nothing yet. */
    getInitialPersistedState: (): PersistedPayload | null =>
        ipcRenderer.sendSync('state:get-initial'),

    /** Push the latest persisted state to main (debounced by the caller). */
    persistState: (payload: PersistedPayload) => ipcRenderer.send('state:persist', payload),

    /** One-time migration hint: honor a pre-v7 free-text custom sounds dir
     *  until a real sync folder is chosen. */
    setLegacySoundsDir: (dir: string) => ipcRenderer.send('sync:set-legacy-sounds-dir', dir),

    /** Get the current sync folder (if any) and resolved sounds directory. */
    getSyncStatus: (): Promise<SyncStatus> => ipcRenderer.invoke('sync:get-status'),

    /** Open the native folder picker and classify the chosen folder. */
    pickSyncFolder: (): Promise<FolderPickResult> => ipcRenderer.invoke('sync:pick-folder'),

    /** Apply a folder-selection decision (fresh start / move / adopt). */
    applySyncFolder: (folder: string, action: ApplyFolderAction): Promise<ApplyFolderResult> =>
        ipcRenderer.invoke('sync:apply-folder', folder, action),

    /** Reveal the current sync root in the OS file manager. */
    openSyncFolder: (): Promise<string> => ipcRenderer.invoke('sync:open-folder'),

    /** Create Linux Virtual Sink + mic loopback (PulseAudio / PipeWire) */
    createVirtualSink: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('create-virtual-sink'),

    /** Linux: enable/disable the OS-level mic loopback (off while a voice effect is active) */
    setLinuxMicLoopback: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('set-mic-loopback', enabled),

    /** Get the host platform ('darwin' | 'win32' | 'linux') */
    getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('get-platform'),

    /** Copy text to the system clipboard via the main process */
    copyToClipboard: (text: string): Promise<boolean> =>
        ipcRenderer.invoke('copy-to-clipboard', text),

    /** Open a URL in the user's default browser */
    openExternal: (url: string): Promise<boolean> =>
        ipcRenderer.invoke('open-external', url),

    // ─── Shortcut Config & Recording ─────────────────────────────────────────

    /** Send shortcut configuration to main process */
    setShortcutConfig: (config: ShortcutConfig) => {
        ipcRenderer.send('set-shortcut-config', config);
    },

    /** Set (or clear, with '') the optional remote-control PIN */
    setRemotePin: (pin: string) => ipcRenderer.send('set-remote-pin', pin),

    /** Start listening for keys to record */
    startRecordingKeys: () => ipcRenderer.send('start-recording-keys'),

    /** Stop listening for keys */
    stopRecordingKeys: () => ipcRenderer.send('stop-recording-keys'),

    // ─── Renderer → Main Sends ───────────────────────────────────────────────

    /** Send current sounds data to main for broadcasting to remote clients */
    sendSoundsForRemote: (sounds: unknown) => {
        ipcRenderer.send('sounds-for-remote', sounds);
    },

    /** Log message to main process console */
    log: (message: string) => ipcRenderer.send('log', message),

    // ─── Auto-Updater ────────────────────────────────────────────────────────

    updater: {
        /** Manually trigger an update check (ignores skip/postpone state). */
        checkManual: (): Promise<void> =>
            ipcRenderer.invoke(UPDATER_CHANNELS.checkManual),

        /** Install the currently offered update (Windows/Linux only; no-op on macOS). */
        install: (): Promise<void> =>
            ipcRenderer.invoke(UPDATER_CHANNELS.install),

        /** Postpone the currently offered update until tomorrow (at least 24h later). */
        postpone: (): Promise<void> =>
            ipcRenderer.invoke(UPDATER_CHANNELS.postpone),

        /** Skip a specific version of the update permanently. */
        skip: (version: string): Promise<void> =>
            ipcRenderer.invoke(UPDATER_CHANNELS.skip, version),

        /** Open the release page of the currently offered update in the browser. */
        openDownloadPage: (): Promise<void> =>
            ipcRenderer.invoke(UPDATER_CHANNELS.openDownloadPage),

        /** Get the current app version. */
        getCurrentVersion: (): Promise<string> =>
            ipcRenderer.invoke(UPDATER_CHANNELS.getCurrentVersion),

        /** Subscribe to update availability notifications. */
        onUpdateAvailable: (cb: (offer: UpdateOffer) => void) => {
            const handler = (_event: IpcRendererEvent, offer: UpdateOffer) => cb(offer);
            ipcRenderer.on(UPDATER_CHANNELS.updateAvailable, handler);
            return () => ipcRenderer.removeListener(UPDATER_CHANNELS.updateAvailable, handler);
        },

        /** Subscribe to download progress updates. */
        onDownloadProgress: (cb: (p: UpdateProgress) => void) => {
            const handler = (_event: IpcRendererEvent, p: UpdateProgress) => cb(p);
            ipcRenderer.on(UPDATER_CHANNELS.downloadProgress, handler);
            return () => ipcRenderer.removeListener(UPDATER_CHANNELS.downloadProgress, handler);
        },

        /** Subscribe to update-related errors. */
        onError: (cb: (e: UpdateError) => void) => {
            const handler = (_event: IpcRendererEvent, e: UpdateError) => cb(e);
            ipcRenderer.on(UPDATER_CHANNELS.error, handler);
            return () => ipcRenderer.removeListener(UPDATER_CHANNELS.error, handler);
        },

        /** Subscribe to notifications when the app is already up to date. */
        onUpToDate: (cb: (v: UpToDateInfo) => void) => {
            const handler = (_event: IpcRendererEvent, v: UpToDateInfo) => cb(v);
            ipcRenderer.on(UPDATER_CHANNELS.upToDate, handler);
            return () => ipcRenderer.removeListener(UPDATER_CHANNELS.upToDate, handler);
        },
    },
};

contextBridge.exposeInMainWorld('api', api);

export type ApiType = typeof api;
