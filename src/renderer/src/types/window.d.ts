import type {
    PersistedPayload,
    FolderPickResult,
    ApplyFolderAction,
    ApplyFolderResult,
    SyncStatus,
    SyncedConfig,
} from '../../../shared/sync-types';
import type {
    UpdateOffer,
    UpdateProgress,
    UpdateError,
    UpToDateInfo,
} from '../../../shared/updater-types';

export interface TriggerSoundPayload {
    page?: number;
    pageId?: string;
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

interface UpdaterApi {
    checkManual(): Promise<void>;
    install(): Promise<void>;
    postpone(): Promise<void>;
    skip(version: string): Promise<void>;
    openDownloadPage(): Promise<void>;
    getCurrentVersion(): Promise<string>;
    onUpdateAvailable(cb: (offer: UpdateOffer) => void): () => void;
    onDownloadProgress(cb: (p: UpdateProgress) => void): () => void;
    onError(cb: (e: UpdateError) => void): () => void;
    onUpToDate(cb: (v: UpToDateInfo) => void): () => void;
}

interface ElectronApi {
    onTriggerSound: (callback: (payload: TriggerSoundPayload) => void) => () => void;
    onPanicStop: (callback: () => void) => () => void;
    onRequestSoundsForRemote: (callback: () => void) => () => void;

    // Recording
    onKeyRecorded: (callback: (keyCode: number) => void) => () => void;
    startRecordingKeys: () => void;
    stopRecordingKeys: () => void;

    // Warnings
    onWaylandWarning?: (callback: () => void) => () => void;
    onSyncRecoveredFromBackup?: (callback: () => void) => () => void;

    // Live external updates (config-sync WP4)
    onExternalStateUpdate?: (callback: (synced: SyncedConfig) => void) => () => void;
    onSyncNewerVersion?: (callback: () => void) => () => void;

    // Help menu
    onShowHelp?: (callback: () => void) => () => void;
    onShowEasterEgg?: (callback: () => void) => () => void;

    // Auto-update API
    updater?: UpdaterApi;

    saveSoundFile: (sourcePath: string, fileName: string) => Promise<string>;
    getLocalIp: () => Promise<{ ip: string; port: number }>;
    downloadUrl: (url: string) => Promise<{ filePath: string; originalName: string }>;
    getPathForFile: (file: File) => string;
    getSoundsDir: () => Promise<string>;

    // Persisted State (config-sync)
    getInitialPersistedState: () => PersistedPayload | null;
    persistState: (payload: PersistedPayload) => void;
    setLegacySoundsDir: (dir: string) => void;

    // Sync folder selection (config-sync WP2)
    getSyncStatus: () => Promise<SyncStatus>;
    pickSyncFolder: () => Promise<FolderPickResult>;
    applySyncFolder: (folder: string, action: ApplyFolderAction) => Promise<ApplyFolderResult>;
    openSyncFolder: () => Promise<string>;

    setShortcutConfig: (config: ShortcutConfig) => void;
    getRemoteServerStatus: () => Promise<{ running: boolean; pinConfigured: boolean }>;
    configureRemoteServer: (pin: string) => Promise<{ ok: boolean; error?: string }>;
    startRemoteServer: () => Promise<{ ok: boolean; error?: string }>;
    stopRemoteServer: () => Promise<{ ok: boolean }>;
    sendSoundsForRemote: (sounds: unknown) => void;
    createVirtualSink: () => Promise<{ success: boolean; error?: string }>;
    setLinuxMicLoopback: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
    getPlatform: () => Promise<'darwin' | 'win32' | 'linux' | string>;
    copyToClipboard: (text: string) => Promise<boolean>;
    openExternal: (url: string) => Promise<boolean>;
}

declare global {
    interface Window {
        api: ElectronApi;
    }
}
