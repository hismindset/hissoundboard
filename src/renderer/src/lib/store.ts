import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Sound, GridSlot } from '../types/sound';
import type { Page } from '../types/page';
import type { PersistedPayload } from '../../../shared/sync-types';

/** "pageId-slotIndex" */
const slotKey = (pageId: string, slot: number) => `${pageId}-${slot}`;

export type ShortcutMode = 'numpad' | 'standard';

// Re-exported from the shared module so the rest of the renderer (e.g.
// audioController.ts) can keep importing `AudioSettings` from here — the
// main process owns the canonical definition in shared/sync-types.ts since
// it also needs the shape to read/write local-settings.json.
export type { AudioSettings } from '../../../shared/sync-types';
import type { AudioSettings } from '../../../shared/sync-types';

interface SoundboardState {
    // ── Library (source of truth) ────────────────────────────────────────
    library: Record<string, Sound>;

    // ── Grid (view references) ───────────────────────────────────────────
    grid: Record<string, GridSlot>;
    pages: Page[];
    activePageId: string;
    activeSounds: Set<string>;

    // ── Audio Settings ───────────────────────────────────────────────────
    audioSettings: AudioSettings;

    // ── Voice Effect ─────────────────────────────────────────────────────
    /** Active voice-changer preset id (null = clean voice). Not persisted:
     *  the app always starts with the unprocessed voice. */
    activeVoiceEffect: string | null;
    /** User-edited effect parameters per preset id (partial overrides of the
     *  preset defaults). Persisted. */
    voiceEffectParams: Record<string, Record<string, number>>;

    // ── Shortcut Config ──────────────────────────────────────────────────
    shortcutMode: ShortcutMode;

    // ── Remote Control ───────────────────────────────────────────────────
    /** Optional PIN required to control the phone/tablet remote ('' = disabled). */
    remotePin: string;

    // ── Library Drawer ───────────────────────────────────────────────────
    libraryOpen: boolean;

    // ── First Run Setup ──────────────────────────────────────────────────
    hasCompletedSetup: boolean;
    showWaylandWarning: boolean;

    // ── Actions ──────────────────────────────────────────────────────────

    // Library
    addToLibrary: (sound: Sound) => void;
    removeFromLibrary: (soundId: string) => void;
    updateSound: (soundId: string, updates: Partial<Sound>) => void;
    getSoundById: (soundId: string) => Sound | undefined;

    // Grid
    assignToSlot: (pageId: string, slot: number, soundId: string) => void;
    unassignSlot: (pageId: string, slot: number) => void;
    getSoundAtSlot: (pageId: string, slot: number) => Sound | undefined;

    // Pages
    addPage: (name?: string) => void;
    removePage: (pageId: string) => void;
    renamePage: (pageId: string, name: string) => void;
    updatePageOrder: (pages: Page[]) => void;
    setPageModifier: (pageId: string, modifierKeys: number[]) => void;
    setActivePage: (pageId: string) => void;

    // Audio
    setAudioSettings: (settings: Partial<AudioSettings>) => void;

    // Voice effect
    setActiveVoiceEffect: (presetId: string | null) => void;
    toggleVoiceEffect: (presetId: string) => void;
    setVoiceEffectParam: (presetId: string, paramId: string, value: number) => void;
    resetVoiceEffectParams: (presetId: string) => void;

    // Active sounds
    setActive: (soundId: string) => void;
    setInactive: (soundId: string) => void;
    clearAllActive: () => void;

    // Shortcuts
    setShortcutMode: (mode: ShortcutMode) => void;
    setRemotePin: (pin: string) => void;

    // Library drawer
    setLibraryOpen: (open: boolean) => void;
    toggleLibrary: () => void;

    // Setup
    setHasCompletedSetup: (completed: boolean) => void;
    setShowWaylandWarning: (show: boolean) => void;

    // Remote
    getAllSoundsForRemote: () => { pages: Partial<Page>[]; activePageId: string; sounds: { pageId: string; slot: number; sound: Sound }[] };

    // Utility
    getUnusedSounds: () => Sound[];
    getUsedSoundIds: () => Set<string>;
}

// Key the legacy (pre-v7) localStorage persistence used. Kept only as a
// read-only fallback source for the migration below — see `getItem`.
const LEGACY_STORAGE_KEY = 'opensoundboard-storage';

// The persist middleware's setItem fires on every state change; debounce it
// so rapid edits (e.g. dragging a volume slider) don't spam IPC/disk writes.
const PERSIST_DEBOUNCE_MS = 1000;
let pendingPersist: { timeoutId: ReturnType<typeof setTimeout>; value: string } | null = null;

const writeToMain = (value: string) => {
    // main wants the parsed { state, version } object, not a JSON string.
    window.api.persistState(JSON.parse(value) as PersistedPayload);
};

/** Fire any pending debounced write immediately. Called on `beforeunload` so
 *  an edit made right before the app closes isn't dropped. */
export const flushPendingPersist = () => {
    if (!pendingPersist) return;
    clearTimeout(pendingPersist.timeoutId);
    const { value } = pendingPersist;
    pendingPersist = null;
    writeToMain(value);
};

window.addEventListener('beforeunload', flushPendingPersist);

// IPC-backed storage adapter: the main process is the sole owner of the
// persisted files (config.json + local-settings.json). Hydration reads the
// current state from main synchronously (the store hydrates synchronously
// today, so a small blocking IPC call preserves that contract); writes are
// debounced and sent fire-and-forget.
//
// zustand's `createJSONStorage` expects `getItem` to return a JSON STRING
// (it JSON.parses the result itself), so unlike the old localStorage-backed
// adapter, we must stringify here rather than hand back a parsed object.
const ipcStorage = {
    getItem: (_name: string): string | null => {
        const initial = window.api.getInitialPersistedState();
        if (initial != null) {
            return JSON.stringify(initial);
        }
        // Main has nothing yet (first launch on the v7 backend). Fall back to
        // the legacy v6 localStorage payload so the migrate step below can
        // run; the first persistState() call then writes it into main's files.
        return localStorage.getItem(LEGACY_STORAGE_KEY);
    },
    setItem: (_name: string, value: string) => {
        if (pendingPersist) clearTimeout(pendingPersist.timeoutId);
        pendingPersist = {
            value,
            timeoutId: setTimeout(() => {
                pendingPersist = null;
                writeToMain(value);
            }, PERSIST_DEBOUNCE_MS),
        };
    },
    // main owns the files; there is nothing to remove locally.
    removeItem: (_name: string) => { },
};

export const useSoundboardStore = create<SoundboardState>()(
    persist(
        (set, get) => ({
            library: {},
            grid: {},
            pages: [],
            activePageId: '',
            activeSounds: new Set<string>(),

            audioSettings: {
                monitorVolume: 1.0,
                outputVolume: 0.5,
                micVolume: 1.0,
                monitorMuted: false,
                outputMuted: false,
                monitorDeviceId: '',
                outputDeviceId: '',
                micDeviceId: '',
            },

            activeVoiceEffect: null,
            voiceEffectParams: {},
            shortcutMode: 'numpad',
            remotePin: '',
            libraryOpen: false,
            hasCompletedSetup: false,
            showWaylandWarning: false,

            // ── Library Actions ──────────────────────────────────────────────

            addToLibrary: (sound) =>
                set((state) => ({
                    library: { ...state.library, [sound.id]: sound },
                })),

            removeFromLibrary: (soundId) =>
                set((state) => {
                    const newLibrary = { ...state.library };
                    delete newLibrary[soundId];
                    const newGrid = { ...state.grid };
                    for (const [key, val] of Object.entries(newGrid)) {
                        if (val === soundId) {
                            newGrid[key] = null;
                        }
                    }
                    return { library: newLibrary, grid: newGrid };
                }),

            updateSound: (soundId, updates) =>
                set((state) => {
                    const existing = state.library[soundId];
                    if (!existing) return state;
                    return {
                        library: {
                            ...state.library,
                            [soundId]: { ...existing, ...updates },
                        },
                    };
                }),

            getSoundById: (soundId) => get().library[soundId],

            // ── Grid Actions ─────────────────────────────────────────────────

            assignToSlot: (pageId, slot, soundId) =>
                set((state) => ({
                    grid: { ...state.grid, [slotKey(pageId, slot)]: soundId },
                })),

            unassignSlot: (pageId, slot) =>
                set((state) => ({
                    grid: { ...state.grid, [slotKey(pageId, slot)]: null },
                })),

            getSoundAtSlot: (pageId, slot) => {
                const state = get();
                const soundId = state.grid[slotKey(pageId, slot)];
                if (!soundId) return undefined;
                return state.library[soundId];
            },

            // ── Page Actions ─────────────────────────────────────────────────

            addPage: (name = 'New Page') =>
                set((state) => {
                    const newPage: Page = {
                        id: uuidv4(),
                        name,
                        order: state.pages.length,
                        modifierKeys: [],
                    };
                    const newPages = [...state.pages, newPage];
                    return {
                        pages: newPages,
                        activePageId: state.pages.length === 0 ? newPage.id : state.activePageId,
                    };
                }),

            removePage: (pageId) =>
                set((state) => {
                    const newPages = state.pages.filter((p) => p.id !== pageId);
                    let newActiveId = state.activePageId;
                    if (pageId === state.activePageId) {
                        newActiveId = newPages.length > 0 ? newPages[0].id : '';
                    }

                    const newGrid = { ...state.grid };
                    for (const key of Object.keys(newGrid)) {
                        if (key.startsWith(`${pageId}-`)) {
                            delete newGrid[key];
                        }
                    }

                    return {
                        pages: newPages,
                        activePageId: newActiveId,
                        grid: newGrid,
                    };
                }),

            renamePage: (pageId, name) =>
                set((state) => ({
                    pages: state.pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
                })),

            updatePageOrder: (newPages) =>
                set(() => ({
                    pages: newPages.map((p, index) => ({ ...p, order: index })),
                })),

            setPageModifier: (pageId, modifierKeys) =>
                set((state) => ({
                    pages: state.pages.map((p) => (p.id === pageId ? { ...p, modifierKeys } : p)),
                })),

            setActivePage: (pageId) => set({ activePageId: pageId }),

            // ── Audio ────────────────────────────────────────────────────────

            setAudioSettings: (updates) =>
                set((state) => ({
                    audioSettings: { ...state.audioSettings, ...updates },
                })),

            // ── Voice Effect ─────────────────────────────────────────────────

            setActiveVoiceEffect: (presetId) => set({ activeVoiceEffect: presetId }),

            toggleVoiceEffect: (presetId) =>
                set((state) => ({
                    activeVoiceEffect: state.activeVoiceEffect === presetId ? null : presetId,
                })),

            setVoiceEffectParam: (presetId, paramId, value) =>
                set((state) => ({
                    voiceEffectParams: {
                        ...state.voiceEffectParams,
                        [presetId]: { ...state.voiceEffectParams[presetId], [paramId]: value },
                    },
                })),

            resetVoiceEffectParams: (presetId) =>
                set((state) => {
                    const next = { ...state.voiceEffectParams };
                    delete next[presetId];
                    return { voiceEffectParams: next };
                }),

            // ── Active Sounds ────────────────────────────────────────────────

            setActive: (soundId) =>
                set((state) => {
                    const next = new Set(state.activeSounds);
                    next.add(soundId);
                    return { activeSounds: next };
                }),

            setInactive: (soundId) =>
                set((state) => {
                    const next = new Set(state.activeSounds);
                    next.delete(soundId);
                    return { activeSounds: next };
                }),

            clearAllActive: () => set({ activeSounds: new Set() }),

            // ── Shortcuts ────────────────────────────────────────────────────

            setShortcutMode: (mode) => set({ shortcutMode: mode }),
            setRemotePin: (pin) => set({ remotePin: pin }),

            // ── Library Drawer ───────────────────────────────────────────────

            setLibraryOpen: (open) => set({ libraryOpen: open }),
            toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),

            // ── Setup ────────────────────────────────────────────────────────
            setHasCompletedSetup: (completed) => set({ hasCompletedSetup: completed }),
            setShowWaylandWarning: (show) => set({ showWaylandWarning: show }),

            // ── Remote ───────────────────────────────────────────────────────

            getAllSoundsForRemote: () => {
                const state = get();
                const sounds: { pageId: string; slot: number; sound: Sound }[] = [];

                state.pages.forEach((page) => {
                    for (let slot = 0; slot < 9; slot++) {
                        const soundId = state.grid[slotKey(page.id, slot)];
                        if (soundId) {
                            const sound = state.library[soundId];
                            if (sound) {
                                sounds.push({
                                    pageId: page.id,
                                    slot,
                                    sound
                                });
                            }
                        }
                    }
                });

                return {
                    pages: state.pages.map(p => ({ id: p.id, name: p.name, order: p.order })),
                    activePageId: state.activePageId,
                    sounds
                };
            },

            // ── Utility ──────────────────────────────────────────────────────

            getUsedSoundIds: () => {
                const state = get();
                const used = new Set<string>();
                for (const soundId of Object.values(state.grid)) {
                    if (soundId) used.add(soundId);
                }
                return used;
            },

            getUnusedSounds: () => {
                const state = get();
                const usedIds = new Set<string>();
                for (const soundId of Object.values(state.grid)) {
                    if (soundId) usedIds.add(soundId);
                }
                return Object.values(state.library).filter((s) => !usedIds.has(s.id));
            },
        }),
        {
            name: 'opensoundboard-storage',
            version: 7, // Bump version: main process now owns persistence (config.json + local-settings.json)
            storage: createJSONStorage(() => ipcStorage),
            migrate: (persistedState: any, version: number) => {
                let state = persistedState;

                // Migration v3 -> v4 (Audio Settings) ... (Existing logic)
                if (version <= 3) {
                    const monitorVolume = typeof state.monitorVolume === 'number' ? state.monitorVolume : 1.0;
                    const outputVolume = typeof state.outputVolume === 'number' ? state.outputVolume : 0.5;
                    const monitorDeviceId = state.monitorDeviceId || '';
                    const outputDeviceId = state.outputDeviceId || '';

                    state = {
                        ...state,
                        audioSettings: {
                            monitorVolume,
                            outputVolume,
                            monitorMuted: false,
                            outputMuted: false,
                            monitorDeviceId,
                            outputDeviceId,
                        },
                        monitorVolume: undefined,
                        outputVolume: undefined,
                        monitorDeviceId: undefined,
                        outputDeviceId: undefined,
                    };
                }

                // Migration v4 -> v5 (Fix activeSounds Set persistence)
                if (version <= 4) {
                    delete state.activeSounds;
                }

                // Migration v5 -> v6 (Add Mic Settings)
                if (version <= 5) {
                    state = {
                        ...state,
                        audioSettings: {
                            ...state.audioSettings,
                            micVolume: 1.0,
                            micDeviceId: '',
                        }
                    };
                }

                // Migration v6 -> v7 (Main process owns persistence now)
                if (version <= 6) {
                    // Free-text custom sounds dir is gone; hand it to main as the
                    // "legacy" sounds dir so existing users keep their sound files
                    // until they pick a real sync folder (WP2).
                    if (typeof state.customSoundsDir === 'string' && state.customSoundsDir) {
                        window.api.setLegacySoundsDir?.(state.customSoundsDir);
                    }
                    delete state.customSoundsDir;
                    // remotePin used to be lost on every restart (never persisted) —
                    // default it so the field always exists going forward.
                    state.remotePin = state.remotePin ?? '';
                }

                return state;
            },
            partialize: (state) => ({
                library: state.library,
                grid: state.grid,
                pages: state.pages,
                activePageId: state.activePageId,
                audioSettings: state.audioSettings,
                voiceEffectParams: state.voiceEffectParams,
                shortcutMode: state.shortcutMode,
                // activeSounds: state.activeSounds, // DO NOT PERSIST SETS
                remotePin: state.remotePin,
                hasCompletedSetup: state.hasCompletedSetup,
            }),
            merge: (persistedState: any, currentState) => {
                // Custom merge to ensure activeSounds is always a Set
                return {
                    ...currentState,
                    ...persistedState,
                    activeSounds: new Set(), // Always reset active sounds on reload
                };
            },
        }
    )
);
