import type { Sound } from '../types/sound';

/**
 * AudioController handles dual-output audio playback with per-sound
 * volume (gain) and non-destructive trimming.
 *
 * Each sound plays on both monitor (local speakers) and output (virtual cable)
 * simultaneously using HTMLAudioElement + setSinkId().
 */
class AudioController {
    /** Map of soundId → active HTMLAudioElement[] */
    private activeSounds: Map<string, HTMLAudioElement[]> = new Map();
    /** Map of element → timeupdate handler for trim enforcement */
    private trimHandlers: Map<HTMLAudioElement, () => void> = new Map();

    /**
     * Play a sound on both monitor and output devices.
     * - One-shot: plays to completion, allows overlapping.
     * - Loop: toggles on/off. Returns true if started, false if stopped.
     */
    async playSound(
        sound: Sound,
        monitorDeviceId: string,
        outputDeviceId: string,
        callbacks: {
            onStart?: () => void;
            onEnd?: () => void;
        },
        /** Master volume for monitor device 0.0–1.0 */
        monitorVolume: number = 1.0,
        /** Master volume for output device 0.0–1.0 */
        outputVolume: number = 1.0,
    ): Promise<boolean> {
        // For loop mode: if already playing, stop it (toggle behavior)
        if (sound.playbackMode === 'loop' && this.activeSounds.has(sound.id)) {
            this.stopSound(sound.id);
            callbacks.onEnd?.();
            return false;
        }

        const elements: HTMLAudioElement[] = [];

        // Create audio elements for both outputs
        const monitorAudio = new Audio(sound.filePath);
        const outputAudio = new Audio(sound.filePath);
        elements.push(monitorAudio, outputAudio);

        // Apply per-sound volume * master volume for each device
        const soundVol = Math.max(0, Math.min(2, sound.volume ?? 1.0));
        monitorAudio.volume = Math.min(1, soundVol * monitorVolume);
        outputAudio.volume = Math.min(1, soundVol * outputVolume);

        // For volume > 1.0, use Web Audio API gain node if possible
        // Otherwise cap at 1.0 (HTMLAudioElement limit)
        // We could use AudioContext for > 1.0 gain but keeping it simple for now

        // Set sink IDs (audio output devices)
        try {
            if (monitorDeviceId && typeof (monitorAudio as any).setSinkId === 'function') {
                await (monitorAudio as any).setSinkId(monitorDeviceId);
            }
            if (outputDeviceId && typeof (outputAudio as any).setSinkId === 'function') {
                await (outputAudio as any).setSinkId(outputDeviceId);
            }
        } catch (err) {
            console.warn('Failed to set audio output device:', err);
        }

        // Apply trim start
        if (sound.trimStart > 0) {
            monitorAudio.currentTime = sound.trimStart;
            outputAudio.currentTime = sound.trimStart;
        }

        // Configure loop mode
        if (sound.playbackMode === 'loop') {
            monitorAudio.loop = true;
            outputAudio.loop = true;
        }

        // Set up trim end enforcement via timeupdate
        if (sound.trimEnd > 0) {
            const createTrimHandler = (el: HTMLAudioElement) => {
                const handler = () => {
                    if (el.currentTime >= sound.trimEnd) {
                        if (sound.playbackMode === 'loop') {
                            // Loop back to trim start
                            el.currentTime = sound.trimStart || 0;
                        } else {
                            // One-shot: pause at trim end
                            el.pause();
                            el.dispatchEvent(new Event('ended'));
                        }
                    }
                };
                el.addEventListener('timeupdate', handler);
                this.trimHandlers.set(el, handler);
            };
            createTrimHandler(monitorAudio);
            createTrimHandler(outputAudio);
        }

        // Track active sounds
        if (sound.playbackMode === 'loop') {
            this.activeSounds.set(sound.id, elements);
        } else {
            const existing = this.activeSounds.get(sound.id) || [];
            this.activeSounds.set(sound.id, [...existing, ...elements]);
        }

        // Set up ended handler for one-shot mode
        if (sound.playbackMode === 'one-shot') {
            let endedCount = 0;
            const onEnded = () => {
                endedCount++;
                if (endedCount >= 2) {
                    const current = this.activeSounds.get(sound.id) || [];
                    const remaining = current.filter(
                        (el) => el !== monitorAudio && el !== outputAudio
                    );
                    if (remaining.length === 0) {
                        this.activeSounds.delete(sound.id);
                    } else {
                        this.activeSounds.set(sound.id, remaining);
                    }
                    // Clean up trim handlers
                    this.cleanupTrimHandler(monitorAudio);
                    this.cleanupTrimHandler(outputAudio);
                    callbacks.onEnd?.();
                }
            };
            monitorAudio.addEventListener('ended', onEnded);
            outputAudio.addEventListener('ended', onEnded);
        }

        // Play both simultaneously
        try {
            await Promise.all([monitorAudio.play(), outputAudio.play()]);
            callbacks.onStart?.();
        } catch (err) {
            console.error('Failed to play audio:', err);
            this.stopSound(sound.id);
            callbacks.onEnd?.();
            return false;
        }

        return true;
    }

    /** Stop a specific sound */
    stopSound(soundId: string): void {
        const elements = this.activeSounds.get(soundId);
        if (elements) {
            elements.forEach((el) => {
                this.cleanupTrimHandler(el);
                el.pause();
                el.currentTime = 0;
                el.src = '';
            });
            this.activeSounds.delete(soundId);
        }
    }

    /** Stop ALL sounds immediately (panic button) */
    stopAll(): void {
        this.activeSounds.forEach((elements) => {
            elements.forEach((el) => {
                this.cleanupTrimHandler(el);
                el.pause();
                el.currentTime = 0;
                el.src = '';
            });
        });
        this.activeSounds.clear();
    }

    /** Check if a sound is currently playing */
    isPlaying(soundId: string): boolean {
        return this.activeSounds.has(soundId);
    }

    /** Clean up a trim handler for an element */
    private cleanupTrimHandler(el: HTMLAudioElement): void {
        const handler = this.trimHandlers.get(el);
        if (handler) {
            el.removeEventListener('timeupdate', handler);
            this.trimHandlers.delete(el);
        }
    }
}

export const audioController = new AudioController();
