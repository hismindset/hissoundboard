import type { Sound } from '../types/sound';

/**
 * AudioController handles dual-output audio playback.
 * Each sound is played on both monitor (local speakers) and output (virtual cable) devices
 * simultaneously using HTMLAudioElement + setSinkId().
 */
class AudioController {
    /** Map of soundId → active HTMLAudioElement[] (for stopping) */
    private activeSounds: Map<string, HTMLAudioElement[]> = new Map();

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
        }
    ): Promise<boolean> {
        // For loop mode: if already playing, stop it (toggle behavior)
        if (sound.playbackMode === 'loop' && this.activeSounds.has(sound.id)) {
            this.stopSound(sound.id);
            callbacks.onEnd?.();
            return false;
        }

        const elements: HTMLAudioElement[] = [];

        // Create audio element for monitor device
        const monitorAudio = new Audio(sound.filePath);
        elements.push(monitorAudio);

        // Create audio element for output device
        const outputAudio = new Audio(sound.filePath);
        elements.push(outputAudio);

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

        // Configure loop mode
        if (sound.playbackMode === 'loop') {
            monitorAudio.loop = true;
            outputAudio.loop = true;
        }

        // Track active sounds
        if (sound.playbackMode === 'loop') {
            this.activeSounds.set(sound.id, elements);
        } else {
            // One-shot: track for panic stop, clean up on end
            const existing = this.activeSounds.get(sound.id) || [];
            this.activeSounds.set(sound.id, [...existing, ...elements]);
        }

        // Set up ended handler for one-shot mode
        if (sound.playbackMode === 'one-shot') {
            let endedCount = 0;
            const onEnded = () => {
                endedCount++;
                if (endedCount >= 2) {
                    // Both audio elements finished
                    const current = this.activeSounds.get(sound.id) || [];
                    const remaining = current.filter(
                        (el) => el !== monitorAudio && el !== outputAudio
                    );
                    if (remaining.length === 0) {
                        this.activeSounds.delete(sound.id);
                    } else {
                        this.activeSounds.set(sound.id, remaining);
                    }
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
                el.pause();
                el.currentTime = 0;
                el.src = ''; // Release resource
            });
            this.activeSounds.delete(soundId);
        }
    }

    /** Stop ALL sounds immediately (panic button) */
    stopAll(): void {
        this.activeSounds.forEach((elements) => {
            elements.forEach((el) => {
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
}

export const audioController = new AudioController();
