export type PlaybackMode = 'one-shot' | 'loop';

export interface Sound {
    /** Unique UUID */
    id: string;
    /** Original filename as imported */
    originalName: string;
    /** User-editable display name */
    displayName: string;
    /** Absolute path or sound:// URL to the audio file */
    filePath: string;
    /** Gain value 0.0 – 2.0 */
    volume: number;
    /** Non-destructive trim start in seconds */
    trimStart: number;
    /** Non-destructive trim end in seconds (0 = end of file) */
    trimEnd: number;
    /** Fade-in duration in seconds (0 = hard start). Optional for back-compat. */
    fadeIn?: number;
    /** Fade-out duration in seconds (0 = hard end). Optional for back-compat. */
    fadeOut?: number;
    /** Playback mode */
    playbackMode: PlaybackMode;
    /** ISO timestamp */
    createdAt: number;
}

/** Grid only stores a reference to a Sound ID (or null if empty) */
export type GridSlot = string | null;
