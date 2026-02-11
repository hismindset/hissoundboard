import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Sound, PlaybackMode } from '../types/sound';

const SLOTS_PER_PAGE = 9;
const NUM_PAGES = 10;

// Create a unique key for a page+slot combination
const slotKey = (page: number, slot: number) => `${page}-${slot}`;

interface SoundboardState {
    /** Map of "page-slot" → Sound */
    sounds: Record<string, Sound>;
    /** Currently visible page (0-based) */
    currentPage: number;
    /** IDs of currently looping sounds */
    activeSounds: Set<string>;
    /** Monitor device ID (local speakers) */
    monitorDeviceId: string;
    /** Output device ID (virtual cable for voicechat) */
    outputDeviceId: string;

    // Actions
    addSound: (page: number, slot: number, sound: Sound) => void;
    removeSound: (page: number, slot: number) => void;
    setPlaybackMode: (page: number, slot: number, mode: PlaybackMode) => void;
    getSound: (page: number, slot: number) => Sound | undefined;
    setCurrentPage: (page: number) => void;
    nextPage: () => void;
    prevPage: () => void;
    setMonitorDevice: (deviceId: string) => void;
    setOutputDevice: (deviceId: string) => void;
    setActive: (soundId: string) => void;
    setInactive: (soundId: string) => void;
    clearAllActive: () => void;
    getAllSoundsForRemote: () => { page: number; slot: number; sound: Sound }[];
}

export const useSoundboardStore = create<SoundboardState>()(
    persist(
        (set, get) => ({
            sounds: {},
            currentPage: 0,
            activeSounds: new Set<string>(),
            monitorDeviceId: '',
            outputDeviceId: '',

            addSound: (page, slot, sound) =>
                set((state) => ({
                    sounds: { ...state.sounds, [slotKey(page, slot)]: sound },
                })),

            removeSound: (page, slot) =>
                set((state) => {
                    const newSounds = { ...state.sounds };
                    delete newSounds[slotKey(page, slot)];
                    return { sounds: newSounds };
                }),

            setPlaybackMode: (page, slot, mode) =>
                set((state) => {
                    const key = slotKey(page, slot);
                    const sound = state.sounds[key];
                    if (!sound) return state;
                    return {
                        sounds: {
                            ...state.sounds,
                            [key]: { ...sound, playbackMode: mode },
                        },
                    };
                }),

            getSound: (page, slot) => {
                return get().sounds[slotKey(page, slot)];
            },

            setCurrentPage: (page) => set({ currentPage: page }),

            nextPage: () =>
                set((state) => ({
                    currentPage: (state.currentPage + 1) % NUM_PAGES,
                })),

            prevPage: () =>
                set((state) => ({
                    currentPage: (state.currentPage - 1 + NUM_PAGES) % NUM_PAGES,
                })),

            setMonitorDevice: (deviceId) => set({ monitorDeviceId: deviceId }),
            setOutputDevice: (deviceId) => set({ outputDeviceId: deviceId }),

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

            getAllSoundsForRemote: () => {
                const state = get();
                const result: { page: number; slot: number; sound: Sound }[] = [];
                for (const [key, sound] of Object.entries(state.sounds)) {
                    const [pageStr, slotStr] = key.split('-');
                    result.push({
                        page: parseInt(pageStr),
                        slot: parseInt(slotStr),
                        sound,
                    });
                }
                return result;
            },
        }),
        {
            name: 'opensoundboard-storage',
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
            partialize: (state) => ({
                sounds: state.sounds,
                currentPage: state.currentPage,
                monitorDeviceId: state.monitorDeviceId,
                outputDeviceId: state.outputDeviceId,
                activeSounds: state.activeSounds,
            }),
        }
    )
);
