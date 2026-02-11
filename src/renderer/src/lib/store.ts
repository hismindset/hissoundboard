import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Sound, GridSlot } from '../types/sound';

const SLOTS_PER_PAGE = 9;
const NUM_PAGES = 10;

/** "page-slot" key */
const slotKey = (page: number, slot: number) => `${page}-${slot}`;

export type ShortcutMode = 'numpad' | 'standard';

interface SoundboardState {
    // ── Library (source of truth) ────────────────────────────────────────
    /** All imported sounds keyed by UUID */
    library: Record<string, Sound>;

    // ── Grid (view references) ───────────────────────────────────────────
    /** "page-slot" → Sound UUID or null */
    grid: Record<string, GridSlot>;

    /** Currently visible page (0-based) */
    currentPage: number;

    /** Set of sound UUIDs currently playing/looping */
    activeSounds: Set<string>;

    // ── Audio Routing ────────────────────────────────────────────────────
    monitorDeviceId: string;
    outputDeviceId: string;

    // ── Shortcut Config ──────────────────────────────────────────────────
    shortcutMode: ShortcutMode;
    /** Map of page index → modifier key name (e.g. 0 → "Ctrl", 1 → "Alt") */
    pageModifiers: Record<number, string>;

    // ── Library Drawer ───────────────────────────────────────────────────
    libraryOpen: boolean;

    // ── Actions ──────────────────────────────────────────────────────────

    // Library
    addToLibrary: (sound: Sound) => void;
    removeFromLibrary: (soundId: string) => void;
    updateSound: (soundId: string, updates: Partial<Sound>) => void;
    getSoundById: (soundId: string) => Sound | undefined;

    // Grid
    assignToSlot: (page: number, slot: number, soundId: string) => void;
    unassignSlot: (page: number, slot: number) => void;
    getSoundAtSlot: (page: number, slot: number) => Sound | undefined;

    // Pages
    setCurrentPage: (page: number) => void;
    nextPage: () => void;
    prevPage: () => void;

    // Audio
    setMonitorDevice: (deviceId: string) => void;
    setOutputDevice: (deviceId: string) => void;

    // Active sounds
    setActive: (soundId: string) => void;
    setInactive: (soundId: string) => void;
    clearAllActive: () => void;

    // Shortcuts
    setShortcutMode: (mode: ShortcutMode) => void;
    setPageModifier: (page: number, modifier: string) => void;

    // Library drawer
    setLibraryOpen: (open: boolean) => void;
    toggleLibrary: () => void;

    // Remote
    getAllSoundsForRemote: () => { page: number; slot: number; sound: Sound }[];

    // Utility
    getUnusedSounds: () => Sound[];
    getUsedSoundIds: () => Set<string>;
}

// ── Default page modifiers ───────────────────────────────────────────────────
const DEFAULT_PAGE_MODIFIERS: Record<number, string> = {
    0: 'Ctrl',
    1: 'Alt',
    2: 'Shift',
    3: 'Ctrl+Alt',
    4: 'Ctrl+Shift',
    5: 'Alt+Shift',
    6: 'Ctrl+Alt+Shift',
    7: 'Meta',
    8: 'Meta+Shift',
    9: 'Meta+Alt',
};

export const useSoundboardStore = create<SoundboardState>()(
    persist(
        (set, get) => ({
            library: {},
            grid: {},
            currentPage: 0,
            activeSounds: new Set<string>(),
            monitorDeviceId: '',
            outputDeviceId: '',
            shortcutMode: 'numpad',
            pageModifiers: { ...DEFAULT_PAGE_MODIFIERS },
            libraryOpen: false,

            // ── Library Actions ──────────────────────────────────────────────

            addToLibrary: (sound) =>
                set((state) => ({
                    library: { ...state.library, [sound.id]: sound },
                })),

            removeFromLibrary: (soundId) =>
                set((state) => {
                    const newLibrary = { ...state.library };
                    delete newLibrary[soundId];
                    // Also remove from any grid slots
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

            assignToSlot: (page, slot, soundId) =>
                set((state) => ({
                    grid: { ...state.grid, [slotKey(page, slot)]: soundId },
                })),

            unassignSlot: (page, slot) =>
                set((state) => ({
                    grid: { ...state.grid, [slotKey(page, slot)]: null },
                })),

            getSoundAtSlot: (page, slot) => {
                const state = get();
                const soundId = state.grid[slotKey(page, slot)];
                if (!soundId) return undefined;
                return state.library[soundId];
            },

            // ── Page Actions ─────────────────────────────────────────────────

            setCurrentPage: (page) => set({ currentPage: page }),

            nextPage: () =>
                set((state) => ({
                    currentPage: (state.currentPage + 1) % NUM_PAGES,
                })),

            prevPage: () =>
                set((state) => ({
                    currentPage: (state.currentPage - 1 + NUM_PAGES) % NUM_PAGES,
                })),

            // ── Audio ────────────────────────────────────────────────────────

            setMonitorDevice: (deviceId) => set({ monitorDeviceId: deviceId }),
            setOutputDevice: (deviceId) => set({ outputDeviceId: deviceId }),

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

            setPageModifier: (page, modifier) =>
                set((state) => ({
                    pageModifiers: { ...state.pageModifiers, [page]: modifier },
                })),

            // ── Library Drawer ───────────────────────────────────────────────

            setLibraryOpen: (open) => set({ libraryOpen: open }),
            toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),

            // ── Remote ───────────────────────────────────────────────────────

            getAllSoundsForRemote: () => {
                const state = get();
                const result: { page: number; slot: number; sound: Sound }[] = [];
                for (const [key, soundId] of Object.entries(state.grid)) {
                    if (!soundId) continue;
                    const sound = state.library[soundId];
                    if (!sound) continue;
                    const [pageStr, slotStr] = key.split('-');
                    result.push({
                        page: parseInt(pageStr),
                        slot: parseInt(slotStr),
                        sound,
                    });
                }
                return result;
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
            version: 2,
            // Serialize/deserialize Set<string>
            storage: {
                getItem: (name) => {
                    const raw = localStorage.getItem(name);
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    if (parsed?.state?.activeSounds) {
                        parsed.state.activeSounds = new Set(parsed.state.activeSounds);
                    }
                    return parsed;
                },
                setItem: (name, value) => {
                    const toStore = {
                        ...value,
                        state: {
                            ...value.state,
                            activeSounds: Array.from(value.state.activeSounds || []),
                        },
                    };
                    localStorage.setItem(name, JSON.stringify(toStore));
                },
                removeItem: (name) => localStorage.removeItem(name),
            },
            // Migration from v1 (old flat sounds map) to v2 (library + grid)
            migrate: (persistedState: any, version: number) => {
                if (version === 0 || version === 1) {
                    // Old schema: sounds: Record<"page-slot", { id, name, filePath, playbackMode }>
                    const oldSounds = persistedState?.sounds || {};
                    const library: Record<string, Sound> = {};
                    const grid: Record<string, string | null> = {};

                    for (const [key, oldSound] of Object.entries(oldSounds)) {
                        const s = oldSound as any;
                        // Generate a new UUID for each old sound
                        const newId = crypto.randomUUID ? crypto.randomUUID() : `migrated-${key}`;
                        const migrated: Sound = {
                            id: newId,
                            originalName: s.name || 'Unknown',
                            displayName: s.name || 'Unknown',
                            filePath: s.filePath || '',
                            volume: 1.0,
                            trimStart: 0,
                            trimEnd: 0,
                            playbackMode: s.playbackMode || 'one-shot',
                            createdAt: Date.now(),
                        };
                        library[newId] = migrated;
                        grid[key] = newId;
                    }

                    return {
                        ...persistedState,
                        library,
                        grid,
                        sounds: undefined, // Remove old key
                        shortcutMode: 'numpad' as ShortcutMode,
                        pageModifiers: { ...DEFAULT_PAGE_MODIFIERS },
                        libraryOpen: false,
                    };
                }
                return persistedState;
            },
            partialize: (state) => ({
                library: state.library,
                grid: state.grid,
                currentPage: state.currentPage,
                monitorDeviceId: state.monitorDeviceId,
                outputDeviceId: state.outputDeviceId,
                shortcutMode: state.shortcutMode,
                pageModifiers: state.pageModifiers,
                activeSounds: state.activeSounds,
            }),
        }
    )
);
