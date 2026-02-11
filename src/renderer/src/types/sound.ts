export type PlaybackMode = 'one-shot' | 'loop';

export interface Sound {
    /** Unique ID like "page-slot", e.g. "0-3" */
    id: string;
    /** Display name (derived from filename) */
    name: string;
    /** Absolute path to the audio file */
    filePath: string;
    /** Playback mode */
    playbackMode: PlaybackMode;
}

export interface SoundSlot {
    /** Page index (0-based) */
    page: number;
    /** Slot index within the page (0-8 for 3x3 grid) */
    slot: number;
    /** The sound assigned to this slot, or null if empty */
    sound: Sound | null;
}
