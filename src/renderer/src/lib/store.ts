import { create } from 'zustand';

interface Sound {
  id: number;
  name: string;
  filePath: string;
  playbackMode: 'one-shot' | 'loop';
  looping?: boolean;
}

interface SoundboardState {
  sounds: Sound[][];
  currentPage: number;
  monitorDevice: string | null;
  outputDevice: string | null;
  addSound: (sound: Omit<Sound, 'playbackMode' | 'looping'>) => void;
  toggleLoop: (soundId: number) => void;
  setPlaybackMode: (soundId: number, mode: 'one-shot' | 'loop') => void;
  resetAllLoops: () => void;
  nextPage: () => void;
  prevPage: () => void;
  playSound: (soundId: number) => void;
  setMonitorDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => void;
}

const NUM_PAGES = 10;
const SLOTS_PER_PAGE = 9;

export const useSoundboardStore = create<SoundboardState>((set, get) => ({
  sounds: Array.from({ length: NUM_PAGES }, () => []),
  currentPage: 0,
  monitorDevice: null,
  outputDevice: null,
  addSound: (sound) =>
    set((state) => {
      const newSound: Sound = { ...sound, playbackMode: 'one-shot', looping: false };
      const newSounds = [...state.sounds];
      const pageIndex = Math.floor(sound.id / SLOTS_PER_PAGE);
      const pageSounds = newSounds[pageIndex];
      const existingSoundIndex = pageSounds.findIndex((s) => s.id === sound.id);

      if (existingSoundIndex !== -1) {
        pageSounds[existingSoundIndex] = newSound;
      } else {
        pageSounds.push(newSound);
      }
      return { sounds: newSounds };
    }),
  toggleLoop: (soundId) =>
    set((state) => ({
      sounds: state.sounds.map((page, pageIndex) =>
        page.map((s) =>
          s.id === soundId && pageIndex === Math.floor(soundId / SLOTS_PER_PAGE)
            ? { ...s, looping: !s.looping }
            : s
        )
      ),
    })),
  setPlaybackMode: (soundId, mode) =>
    set((state) => ({
      sounds: state.sounds.map((page, pageIndex) =>
        page.map((s) =>
          s.id === soundId && pageIndex === Math.floor(soundId / SLOTS_PER_PAGE)
            ? { ...s, playbackMode: mode }
            : s
        )
      ),
    })),
  resetAllLoops: () =>
    set((state) => ({
      sounds: state.sounds.map((page) => page.map((s) => ({ ...s, looping: false }))),
    })),
  nextPage: () =>
    set((state) => ({
      currentPage: (state.currentPage + 1) % NUM_PAGES,
    })),
  prevPage: () =>
    set((state) => ({
      currentPage: (state.currentPage - 1 + NUM_PAGES) % NUM_PAGES,
    })),
  playSound: (soundId) => {
    const state = get();
    const pageIndex = Math.floor(soundId / SLOTS_PER_PAGE);
    const sound = state.sounds[pageIndex].find((s) => s.id === soundId);
    if (sound) {
      // Logic to play sound will be handled in the component
      console.log('Playing sound:', sound);
    }
  },
  setMonitorDevice: (deviceId) => set({ monitorDevice: deviceId }),
  setOutputDevice: (deviceId) => set({ outputDevice: deviceId }),
}));
