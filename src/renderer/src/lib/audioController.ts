import type { Sound } from '../types/sound';
import type { AudioSettings } from './store';

/**
 * AudioController handles dual-output audio playback.
 * It now manages master volume/mute state internally to ensure consistency.
 */
class AudioController {
    private activeSounds: Map<string, HTMLAudioElement[]> = new Map();
    private trimHandlers: Map<HTMLAudioElement, () => void> = new Map();

    // Microphone Passthrough State
    private audioContext: AudioContext;
    private micSource: MediaStreamAudioSourceNode | null = null;
    private micGain: GainNode;

    // Host platform. On Linux the OS (PulseAudio/PipeWire) mixes the mic into the
    // virtual sink, so the in-app Web Audio passthrough is disabled there.
    private platform: string = '';

    // Internal state mirrored from store
    private settings: AudioSettings = {
        monitorVolume: 1.0,
        outputVolume: 0.5,
        micVolume: 1.0,
        monitorMuted: false,
        outputMuted: false,
        monitorDeviceId: '',
        outputDeviceId: '',
        micDeviceId: '',
    };

    private log(msg: string) {
        console.log(msg);
        if ((window as any).api && (window as any).api.log) {
            (window as any).api.log(msg);
        }
    }

    private warn(msg: string, ...args: any[]) {
        console.warn(msg, ...args);
        if ((window as any).api && (window as any).api.log) {
            (window as any).api.log(`[WARN] ${msg} ${args.map(a => String(a)).join(' ')}`);
        }
    }

    private error(msg: string, ...args: any[]) {
        console.error(msg, ...args);
        if ((window as any).api && (window as any).api.log) {
            (window as any).api.log(`[ERROR] ${msg} ${args.map(a => String(a)).join(' ')}`);
        }
    }

    constructor() {
        this.log('[AudioController] Initializing...');
        // Initialize AudioContext strictly at 48kHz as requested
        this.audioContext = new AudioContext({
            latencyHint: 'interactive',
            sampleRate: 48000
        });
        this.log(`[AudioController] AudioContext state: ${this.audioContext.state}, SampleRate: ${this.audioContext.sampleRate}`);

        // Create Gain Node for Mic
        this.micGain = this.audioContext.createGain();
        this.micGain.gain.value = 1.0;
        this.micGain.connect(this.audioContext.destination);
    }

    /** Tell the controller which OS it runs on (affects mic routing strategy). */
    setPlatform(platform: string) {
        this.platform = platform;
        this.log(`[AudioController] Platform set to: ${platform}`);
    }

    private get usesOsMicMixing(): boolean {
        // Linux mixes the mic at the OS level (module-loopback), so the app must
        // NOT also pass the mic through — that would double the voice.
        return this.platform === 'linux';
    }

    /** Initialize controller with settings from store */
    async init(settings: AudioSettings) {
        console.log('[AudioController] init with settings:', settings);
        this.settings = { ...settings };
        this.updateActiveSounds(); // Apply to any currently playing sounds

        // Initialize Mic Setup
        await this.updateMicRouting();
    }

    updateSettings(updates: Partial<AudioSettings>) {
        const oldSettings = { ...this.settings };
        this.settings = { ...this.settings, ...updates };
        this.updateActiveSounds();

        // Check if Mic settings changed
        if (
            oldSettings.micDeviceId !== this.settings.micDeviceId ||
            oldSettings.outputDeviceId !== this.settings.outputDeviceId || // Output device affects where Mic goes
            oldSettings.micVolume !== this.settings.micVolume
        ) {
            console.log('[AudioController] Mic settings changed, updating routing...');
            this.updateMicRouting();
        }
    }

    setMonitorVolume(volume: number) {
        this.settings.monitorVolume = volume;
        this.updateAllActiveVolumes();
    }

    setOutputVolume(volume: number) {
        this.settings.outputVolume = volume;
        this.updateAllActiveVolumes();
    }

    setMicVolume(volume: number) {
        this.settings.micVolume = volume;
        this.updateMicGain();
    }

    setMonitorMuted(muted: boolean) {
        this.settings.monitorMuted = muted;
        this.updateAllActiveVolumes();
    }

    setOutputMuted(muted: boolean) {
        this.settings.outputMuted = muted;
        this.updateAllActiveVolumes();
    }

    setMonitorDevice(deviceId: string) {
        this.settings.monitorDeviceId = deviceId;
    }

    setOutputDevice(deviceId: string) {
        this.settings.outputDeviceId = deviceId;
        // Also update Mic output routing
        this.updateMicOutputDevice();
    }

    setMicDevice(deviceId: string) {
        this.settings.micDeviceId = deviceId;
        this.updateMicRouting();
    }

    // ── Microphone Logic ──────────────────────────────────────────────

    private async updateMicRouting() {
        this.log('[AudioController] updateMicRouting');

        // On Linux the OS mixes the hardware mic into the virtual sink, so the
        // in-app passthrough is intentionally disabled to avoid doubling the voice.
        if (this.usesOsMicMixing) {
            this.log('[AudioController] Skipping in-app mic passthrough (OS-level mixing active).');
            this.stopMic();
            return;
        }

        // Ensure AudioContext is running
        if (this.audioContext.state === 'suspended') {
            this.log('[AudioController] Resuming AudioContext...');
            try {
                await this.audioContext.resume();
                this.log('[AudioController] AudioContext resumed.');
            } catch (err) {
                this.error('[AudioController] Failed to resume AudioContext:', err);
            }
        }

        // 1. Update Gain first
        this.updateMicGain();

        // 2. Update Output Device (Where the Mic goes)
        // CRITICAL: We now move the ENTIRE AudioContext to the output device
        await this.updateMicOutputDevice();

        // 3. Update Input Source
        if (!this.settings.micDeviceId) {
            this.log('[AudioController] No mic device selected, stopping.');
            this.stopMic();
            return;
        }

        // Restart mic if needed
        this.stopMic();

        try {
            this.log(`[AudioController] Requesting Mic Access: ${this.settings.micDeviceId}`);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: this.settings.micDeviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                }
            });
            this.log(`[AudioController] Got Mic Stream: ${stream.id}`);

            this.micSource = this.audioContext.createMediaStreamSource(stream);
            this.micSource.connect(this.micGain);
            this.log('[AudioController] Mic Graph Connected: Source -> Gain -> Destination');

            // DEBUG: Check signal level
            this.debugSignalLevel();

        } catch (err) {
            this.error('[AudioController] Failed to access microphone:', err);
        }
    }

    private debugSignalLevel() {
        // Create an analyser to see if we have bits moving
        const analyser = this.audioContext.createAnalyser();
        this.micGain.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        // Check once after a short delay
        setTimeout(() => {
            analyser.getByteFrequencyData(data);
            const sum = data.reduce((a, b) => a + b, 0);
            const average = sum / data.length;
            this.log(`[AudioController] Signal Check - Average Level: ${average}`);
            if (average === 0) {
                this.warn('[AudioController] WARNING: Zero signal detected. Check if Mic is hardware muted or permissions issues.');
            } else {
                this.log('[AudioController] SUCCESS: Signal detected in graph.');
            }
        }, 2000);
    }

    private updateMicGain() {
        if (this.micGain) {
            // Smooth transition
            // this.log(`[AudioController] Setting Mic Volume: ${this.settings.micVolume}`);
            this.micGain.gain.setTargetAtTime(this.settings.micVolume, this.audioContext.currentTime, 0.1);
        }
    }

    private async updateMicOutputDevice() {
        if (this.settings.outputDeviceId) {
            try {
                // Modern Electron/Chrome supports setSinkId on AudioContext
                if ('setSinkId' in this.audioContext && typeof (this.audioContext as any).setSinkId === 'function') {
                    this.log(`[AudioController] AudioContext.setSinkId: ${this.settings.outputDeviceId}`);
                    await (this.audioContext as any).setSinkId(this.settings.outputDeviceId);
                } else {
                    this.warn('[AudioController] AudioContext.setSinkId NOT supported in this environment.');
                }
            } catch (err) {
                this.warn('[AudioController] Failed to set AudioContext output device:', err);
            }
        }
    }

    private stopMic() {
        if (this.micSource) {
            this.log('[AudioController] Stopping Mic...');
            this.micSource.disconnect();
            // Stop all tracks to release hardware
            if ((this.micSource as any).mediaStream) {
                (this.micSource as any).mediaStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
            }
            this.micSource = null;
        }
    }

    // ──────────────────────────────────────────────────────────────────

    /** Update volume/device for all currently playing sounds */
    private async updateActiveSounds() {
        for (const [soundId, elements] of this.activeSounds.entries()) {
            const [monitorAudio, outputAudio] = elements;
            // Ensure outputAudio goes to the right device
            // Note: playing sounds might not update device dynamically perfectly without re-attach, 
            // but setSinkId should work.
            this.applySettingsToElements(monitorAudio, outputAudio, this.elementBaseVolume.get(monitorAudio) || 1.0);
        }
    }

    // Storing base volume for active elements to allow dynamic volume adjustment
    private elementBaseVolume: WeakMap<HTMLAudioElement, number> = new WeakMap();

    async playSound(
        sound: Sound,
        // We no longer need separate args for volume/device, use internal state
        callbacks: { onStart?: () => void; onEnd?: () => void }
    ): Promise<boolean> {
        if (sound.playbackMode === 'loop' && this.activeSounds.has(sound.id)) {
            this.stopSound(sound.id);
            callbacks.onEnd?.();
            return false;
        }

        const elements: HTMLAudioElement[] = [];
        const monitorAudio = new Audio(sound.filePath);
        const outputAudio = new Audio(sound.filePath);
        elements.push(monitorAudio, outputAudio);

        const baseVol = Math.max(0, Math.min(2, sound.volume ?? 1.0));
        this.elementBaseVolume.set(monitorAudio, baseVol);
        this.elementBaseVolume.set(outputAudio, baseVol);

        this.applySettingsToElements(monitorAudio, outputAudio, baseVol);

        // Standard setup (loop, trim, etc.)
        // Apply the trim start only once metadata is loaded. Setting currentTime
        // right after `new Audio()` is lost on a cold cache (metadata not ready yet),
        // which made trimmed sounds occasionally restart from 0 after an idle period.
        if (sound.trimStart > 0) {
            const applyTrimStart = (el: HTMLAudioElement) => {
                const seek = () => { el.currentTime = sound.trimStart; };
                if (el.readyState >= 1 /* HAVE_METADATA */) seek();
                else el.addEventListener('loadedmetadata', seek, { once: true });
            };
            applyTrimStart(monitorAudio);
            applyTrimStart(outputAudio);
        }

        if (sound.playbackMode === 'loop') {
            monitorAudio.loop = true;
            outputAudio.loop = true;
        }

        if (sound.trimEnd > 0) {
            this.setupTrimHandler(monitorAudio, sound);
            this.setupTrimHandler(outputAudio, sound);
        }

        // Active tracking
        if (sound.playbackMode === 'loop') {
            this.activeSounds.set(sound.id, elements);
        } else {
            const existing = this.activeSounds.get(sound.id) || [];
            this.activeSounds.set(sound.id, [...existing, ...elements]);
        }

        // Ended handler for one-shot
        if (sound.playbackMode === 'one-shot') {
            let endedCount = 0;
            const onEnded = () => {
                endedCount++;
                if (endedCount >= 2) {
                    this.removeActiveElement(sound.id, monitorAudio, outputAudio);
                    this.cleanupTrimHandler(monitorAudio);
                    this.cleanupTrimHandler(outputAudio);
                    callbacks.onEnd?.();
                }
            };
            monitorAudio.addEventListener('ended', onEnded);
            outputAudio.addEventListener('ended', onEnded);
        }

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

    private async applySettingsToElements(monitor: HTMLAudioElement, output: HTMLAudioElement, baseVol: number) {
        // Apply Volume
        monitor.volume = this.settings.monitorMuted ? 0 : Math.min(1, baseVol * this.settings.monitorVolume);
        output.volume = this.settings.outputMuted ? 0 : Math.min(1, baseVol * this.settings.outputVolume);

        // Apply Device
        try {
            if (this.settings.monitorDeviceId && typeof (monitor as any).setSinkId === 'function') {
                await (monitor as any).setSinkId(this.settings.monitorDeviceId);
            }
            if (this.settings.outputDeviceId && typeof (output as any).setSinkId === 'function') {
                await (output as any).setSinkId(this.settings.outputDeviceId);
            }
        } catch (err) {
            console.warn('Failed to set audio output device:', err);
        }
    }

    // Public method to force update active sounds (e.g. when slider moves)
    public updateAllActiveVolumes() {
        this.activeSounds.forEach((elements) => {
            const [monitor, output] = elements;
            const base = this.elementBaseVolume.get(monitor) || 1.0;

            monitor.volume = this.settings.monitorMuted ? 0 : Math.min(1, base * this.settings.monitorVolume);
            output.volume = this.settings.outputMuted ? 0 : Math.min(1, base * this.settings.outputVolume);
        });
    }

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

    isPlaying(soundId: string): boolean {
        return this.activeSounds.has(soundId);
    }

    private setupTrimHandler(el: HTMLAudioElement, sound: Sound) {
        const handler = () => {
            if (el.currentTime >= sound.trimEnd) {
                if (sound.playbackMode === 'loop') {
                    el.currentTime = sound.trimStart || 0;
                } else {
                    el.pause();
                    el.dispatchEvent(new Event('ended'));
                }
            }
        };
        el.addEventListener('timeupdate', handler);
        this.trimHandlers.set(el, handler);
    }

    private cleanupTrimHandler(el: HTMLAudioElement): void {
        const handler = this.trimHandlers.get(el);
        if (handler) {
            el.removeEventListener('timeupdate', handler);
            this.trimHandlers.delete(el);
        }
    }

    private removeActiveElement(soundId: string, monitor: HTMLAudioElement, output: HTMLAudioElement) {
        const current = this.activeSounds.get(soundId);
        if (current) {
            const remaining = current.filter(el => el !== monitor && el !== output);
            if (remaining.length === 0) {
                this.activeSounds.delete(soundId);
            } else {
                this.activeSounds.set(soundId, remaining);
            }
        }
    }
}

export const audioController = new AudioController();
