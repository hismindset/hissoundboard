// Shared contract between the main process (configStore.ts) and the renderer
// (lib/store.ts) describing the persisted-state files on disk.
//
// This module must stay type-only: it is imported by the main process build
// (Node/CJS) as well as the renderer build (browser/ESM), so it must never
// contain runtime code or renderer-only imports. The renderer side MUST
// import from here with `import type` so nothing crosses the process
// boundary at bundle time.

import type { Sound, GridSlot } from '../renderer/src/types/sound';
import type { Page } from '../renderer/src/types/page';

/** Bumped whenever the on-disk config.json shape changes. */
export const CONFIG_SCHEMA_VERSION = 7;

export type ShortcutMode = 'numpad' | 'standard';

/** Device-specific audio routing settings. Never synced (device IDs would be
 *  meaningless on another machine). */
export interface AudioSettings {
    monitorVolume: number; // 0.0 to 1.0
    outputVolume: number; // 0.0 to 1.0
    micVolume: number; // 0.0 to 2.0 (200%)
    monitorMuted: boolean;
    outputMuted: boolean;
    monitorDeviceId: string;
    outputDeviceId: string;
    micDeviceId: string;
}

/** Synced state, written to `<syncRoot>/config.json`. Safe to share via
 *  Nextcloud/iCloud/Git across machines — contains no device-specific data. */
export interface SyncedConfig {
    app: 'hissoundboard';
    schemaVersion: number;
    library: Record<string, Sound>;
    grid: Record<string, GridSlot>;
    pages: Page[];
    activePageId: string;
    voiceEffectParams: Record<string, Record<string, number>>;
    shortcutMode: ShortcutMode;
}

/** Local state, written to `userData/local-settings.json`. Never synced. */
export interface LocalSettings {
    version: 1;
    audioSettings: AudioSettings;
    remotePin: string;
    hasCompletedSetup: boolean;
}

/** Pointer file, written to `userData/sync-settings.json`. Tracks which
 *  folder (if any) acts as the sync root. */
export interface SyncSettings {
    version: 1;
    syncFolder: string | null;
    /** Pre-v7 free-text sounds dir, honored until a real sync folder is chosen. */
    legacySoundsDir?: string;
}

/** The flat, merged fields of `SyncedConfig` + `LocalSettings` as they live
 *  inside the zustand store (and therefore inside the persist payload). */
export interface PersistedStateFields {
    library: Record<string, Sound>;
    grid: Record<string, GridSlot>;
    pages: Page[];
    activePageId: string;
    voiceEffectParams: Record<string, Record<string, number>>;
    shortcutMode: ShortcutMode;
    audioSettings: AudioSettings;
    remotePin: string;
    hasCompletedSetup: boolean;
}

/** The JSON shape zustand's `persist` middleware reads/writes via the
 *  storage adapter's getItem/setItem. */
export interface PersistedPayload {
    state: PersistedStateFields;
    version: number;
}

// ─── Folder selection (WP2) ────────────────────────────────────────────────

/** Result of classifying a folder the user picked as a candidate sync root. */
export type FolderPickResult =
    | { status: 'cancelled' }
    | { status: 'invalid-nonempty'; folder: string }
    | { status: 'invalid-nested'; folder: string } // picked current syncRoot or inside it
    | { status: 'valid-config'; folder: string; localHasData: boolean }
    | { status: 'empty'; folder: string; localHasData: boolean };

/** How to reconcile the picked folder with any data the app already has. */
export type ApplyFolderAction = 'fresh' | 'move-local' | 'adopt';

export interface ApplyFolderResult {
    ok: boolean;
    error?: string;
    /** On 'adopt' (or 'fresh' with a fresh default state): the synced state
     *  now in effect, for the renderer to apply to its store. */
    syncedState?: SyncedConfig;
    /** On 'adopt' with local data: where the previous local board was backed up. */
    backupPath?: string;
}

export interface SyncStatus {
    folder: string | null;
    soundsDir: string;
}
