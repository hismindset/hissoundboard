import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Sound, GridSlot } from '../types/sound';
import type { Page } from '../types/page';

/** "pageId-slotIndex" */
const slotKey = (pageId: string, slot: number) => `${pageId}-${slot}`;

export type ShortcutMode = 'numpad' | 'standard';

interface SoundboardState {
    // ── Library (source of truth) ────────────────────────────────────────
    /** All imported sounds keyed by UUID */
    library: Record<string, Sound>;

    // ── Grid (view references) ───────────────────────────────────────────
    /** "pageId-slotIndex" → Sound UUID or null */
    grid: Record<string, GridSlot>;

    /** List of dynamic pages */
    pages: Page[];

    /** ID of the currently visible page */
    activePageId: string;

    /** Set of sound UUIDs currently playing/looping */
    activeSounds: Set<string>;

    // ── Audio Routing ────────────────────────────────────────────────────
    monitorDeviceId: string;
    outputDeviceId: string;
    /** Master volume for monitor output 0.0–1.0 */
    monitorVolume: number;
    /** Master volume for output device (voicechat) 0.0–1.0 */
    outputVolume: number;
    /** Custom sounds directory (empty = default) */
    customSoundsDir: string;

    // ── Shortcut Config ──────────────────────────────────────────────────
    shortcutMode: ShortcutMode;
    // Note: Modifier keys are now stored in Page objects

    // ── Library Drawer ───────────────────────────────────────────────────
    libraryOpen: boolean;

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
    setMonitorDevice: (deviceId: string) => void;
    setOutputDevice: (deviceId: string) => void;
    setMonitorVolume: (volume: number) => void;
    setOutputVolume: (volume: number) => void;
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

    // Remote
    getAllSoundsForRemote: () => { pageIndex: number; pageId: string; slot: number; sound: Sound }[];

    // Utility
    getUnusedSounds: () => Sound[];
    getUsedSoundIds: () => Set<string>;
}

export const useSoundboardStore = create<SoundboardState>()(
    persist(
        (set, get) => ({
            library: {},
            grid: {},
            pages: [],
            activePageId: '',
            activeSounds: new Set<string>(),
            monitorDeviceId: '',
            outputDeviceId: '',
            monitorVolume: 1.0,
            outputVolume: 0.5,
            customSoundsDir: '',
            shortcutMode: 'numpad',
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
                        // If it's the first page, make it active
                        activePageId: state.pages.length === 0 ? newPage.id : state.activePageId,
                    };
                }),

            removePage: (pageId) =>
                set((state) => {
                    const newPages = state.pages.filter((p) => p.id !== pageId);
                    // If we removed the active page, switch to another
                    let newActiveId = state.activePageId;
                    if (pageId === state.activePageId) {
                        newActiveId = newPages.length > 0 ? newPages[0].id : '';
                    }

                    // Remove grid entries for this page
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

            setMonitorDevice: (deviceId) => set({ monitorDeviceId: deviceId }),
            setOutputDevice: (deviceId) => set({ outputDeviceId: deviceId }),
            setMonitorVolume: (volume) => set({ monitorVolume: Math.max(0, Math.min(1, volume)) }),
            setOutputVolume: (volume) => set({ outputVolume: Math.max(0, Math.min(1, volume)) }),
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

            // ── Remote ───────────────────────────────────────────────────────

            getAllSoundsForRemote: () => {
                const state = get();
                const result: { pageIndex: number; pageId: string; slot: number; sound: Sound }[] = [];

                state.pages.forEach((page, pageIndex) => {
                    for (let slot = 0; slot < 9; slot++) {
                        const soundId = state.grid[slotKey(page.id, slot)];
                        if (soundId) {
                            const sound = state.library[soundId];
                            if (sound) {
                                result.push({
                                    pageIndex,
                                    pageId: page.id,
                                    slot,
                                    sound
                                });
                            }
                        }
                    }
                });
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
            version: 3,
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
            migrate: (persistedState: any, version: number) => {
                let state = persistedState;
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

                // Migration v1 -> v2
                if (version === 0 || version === 1) {
                    const oldSounds = state?.sounds || {};
                    const library: Record<string, Sound> = {};
                    const grid: Record<string, string | null> = {};

                    for (const [key, oldSound] of Object.entries(oldSounds)) {
                        const s = oldSound as any;
                        const newId = uuidv4();
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

                    state = {
                        ...state,
                        library,
                        grid,
                        sounds: undefined,
                        shortcutMode: 'numpad',
                        libraryOpen: false,
                        pageModifiers: DEFAULT_PAGE_MODIFIERS,
                    };
                }

                // Migration v2 -> v3
                if (version <= 2) {
                    const pages: Page[] = [];
                    const newGrid: Record<string, string | null> = {};
                    const oldGrid = state.grid || {};

                    for (let i = 0; i < 10; i++) {
                        const pageId = uuidv4();
                        pages.push({
                            id: pageId,
                            name: `Page ${i + 1}`,
                            order: i,
                            modifierKeys: [],
                        });

                        for (let slot = 0; slot < 9; slot++) {
                            const oldKey = `${i}-${slot}`;
                            if (oldGrid[oldKey]) {
                                newGrid[`${pageId}-${slot}`] = oldGrid[oldKey];
                            }
                        }
                    }

                    return {
                        ...state,
                        grid: newGrid,
                        pages,
                        activePageId: pages[0]?.id || '',
                        currentPage: undefined,
                        pageModifiers: undefined,
                    };
                }

                return state;
            },
            partialize: (state) => ({
                library: state.library,
                grid: state.grid,
                pages: state.pages,
                activePageId: state.activePageId,
                monitorDeviceId: state.monitorDeviceId,
                outputDeviceId: state.outputDeviceId,
                shortcutMode: state.shortcutMode,
                activeSounds: state.activeSounds,
            }),
        }
    )
);
