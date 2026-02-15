import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Sound, GridSlot } from '../types/sound';
import type { Page } from '../types/page';

/** "pageId-slotIndex" */
const slotKey = (pageId: string, slot: number) => `${pageId}-${slot}`;

export type ShortcutMode = 'numpad' | 'standard';

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
    customSoundsDir: string;

    // ── Shortcut Config ──────────────────────────────────────────────────
    shortcutMode: ShortcutMode;

    // ── Library Drawer ───────────────────────────────────────────────────
    libraryOpen: boolean;

    // ── First Run Setup ──────────────────────────────────────────────────
    hasCompletedSetup: boolean;

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
    setCustomSoundsDir: (dir: string) => void;

    // Active sounds
    setActive: (soundId: string) => void;
    setInactive: (soundId: string) => void;
    clearAllActive: () => void;

    // Shortcuts
    setShortcutMode: (mode: ShortcutMode) => void;

    // Library drawer
    setLibraryOpen: (open: boolean) => void;
    toggleLibrary: () => void;

    // Setup
    setHasCompletedSetup: (completed: boolean) => void;

    // Remote
    getAllSoundsForRemote: () => { pages: Partial<Page>[]; activePageId: string; sounds: { pageId: string; slot: number; sound: Sound }[] };

    // Utility
    getUnusedSounds: () => Sound[];
    getUsedSoundIds: () => Set<string>;
}

// Debounce helper for storage
const debounce = (fn: Function, ms: number) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), ms);
    };
};

// Custom storage with debounce
const debouncedStorage = {
    getItem: (name: string) => {
        const item = localStorage.getItem(name);
        return item ? JSON.parse(item) : null;
    },
    setItem: debounce((name: string, value: any) => {
        localStorage.setItem(name, JSON.stringify(value));
    }, 1000), // 1 second debounce
    removeItem: (name: string) => localStorage.removeItem(name),
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

            customSoundsDir: '',
            shortcutMode: 'numpad',
            libraryOpen: false,
            hasCompletedSetup: false,

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

            setCustomSoundsDir: (dir) => set({ customSoundsDir: dir }),

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

            // ── Library Drawer ───────────────────────────────────────────────

            setLibraryOpen: (open) => set({ libraryOpen: open }),
            toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),

            // ── Setup ────────────────────────────────────────────────────────
            setHasCompletedSetup: (completed) => set({ hasCompletedSetup: completed }),

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
            version: 6, // Bump version to add mic settings
            storage: createJSONStorage(() => debouncedStorage),
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

                return state;
            },
            partialize: (state) => ({
                library: state.library,
                grid: state.grid,
                pages: state.pages,
                activePageId: state.activePageId,
                audioSettings: state.audioSettings,
                shortcutMode: state.shortcutMode,
                // activeSounds: state.activeSounds, // DO NOT PERSIST SETS
                customSoundsDir: state.customSoundsDir,
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
