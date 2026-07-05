import type { Sound } from '../types/sound';
import type { AudioSettings } from './store';
import { createVoiceEffectChain, type VoiceEffectChain } from './voiceEffects';

/**
 * AudioController handles dual-output audio playback.
 * It now manages master volume/mute state internally to ensure consistency.
 */
class AudioController {
    private activeSounds: Map<string, HTMLAudioElement[]> = new Map();
    private trimHandlers: Map<HTMLAudioElement, () => void> = new Map();
    // Fade envelope: per-element 0..1 gain factor + the timer driving it.
    private elementFade: WeakMap<HTMLAudioElement, number> = new WeakMap();
    private fadeIntervals: Map<HTMLAudioElement, ReturnType<typeof setInterval>> = new Map();
    // Which master bus an element belongs to (true = monitor, false = output).
    private elementIsMonitor: WeakMap<HTMLAudioElement, boolean> = new WeakMap();

    // Microphone Passthrough State
    private audioContext: AudioContext;
    private micSource: MediaStreamAudioSourceNode | null = null;
    private micGain: GainNode;
    // Voice effect chain sits between effectBus and micGain:
    // micSource -> effectBus -> [effect] -> micGain -> destination
    private effectBus: GainNode;
    private voiceEffect: VoiceEffectChain | null = null;
    private voiceEffectId: string | null = null;

    // Host platform. On Linux the OS (PulseAudio/PipeWire) mixes the mic into the
    // virtual sink, so the in-app Web Audio passthrough is disabled there —
    // except while a voice effect is active (see switchLinuxMicPath).
    private platform: string = '';
    // Linux only: true while the mic runs through the app graph (effect active)
    // instead of the OS loopback.
    private linuxAppMicActive = false;
    // Serializes Linux loopback/app-mic switches so rapid effect toggles can
    // never leave both paths (= doubled voice) or neither path active.
    private linuxMicSwitch: Promise<void> = Promise.resolve();

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

        // Effect bus: mic connects here; with no effect it feeds micGain directly.
        this.effectBus = this.audioContext.createGain();
        this.effectBus.gain.value = 1.0;
        this.effectBus.connect(this.micGain);
    }

    /** Tell the controller which OS it runs on (affects mic routing strategy). */
    setPlatform(platform: string) {
        this.platform = platform;
        this.log(`[AudioController] Platform set to: ${platform}`);
    }

    private get usesOsMicMixing(): boolean {
        // Linux mixes the mic at the OS level (module-loopback), so the app must
        // NOT also pass the mic through — that would double the voice. While a
        // voice effect is active the loopback is unloaded and the app takes over.
        return this.platform === 'linux' && !this.linuxAppMicActive;
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
        if (this.platform === 'linux' && !this.settings.outputDeviceId) {
            this.warn('[AudioController] Linux: no Output Device selected — mic/effect will play to the default output instead of the virtual sink.');
        }

        // 3. Update Input Source
        // On Linux users normally never pick a mic in Settings (the OS loopback
        // handles it), so fall back to the default input device there.
        if (!this.settings.micDeviceId && this.platform !== 'linux') {
            this.log('[AudioController] No mic device selected, stopping.');
            this.stopMic();
            return;
        }

        // Restart mic if needed
        this.stopMic();

        try {
            this.log(`[AudioController] Requesting Mic Access: ${this.settings.micDeviceId || '(default)'}`);
            const audio: MediaTrackConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            };
            if (this.settings.micDeviceId) {
                audio.deviceId = { exact: this.settings.micDeviceId };
            } else if (this.platform === 'linux') {
                // Never capture our own virtual source / a monitor — that would
                // feed the sink back into itself (feedback loop). Prefer the
                // first real hardware input if the default looks unsafe.
                const hw = await this.findLinuxHardwareMic();
                if (hw) audio.deviceId = { exact: hw };
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio });

            // Safety net: verify we didn't grab the virtual source after all.
            const trackLabel = stream.getAudioTracks()[0]?.label || '';
            if (this.platform === 'linux' && /HISSOUNDBOARD|monitor/i.test(trackLabel)) {
                this.error(`[AudioController] Refusing to use "${trackLabel}" as mic (would cause feedback). Select a hardware mic in Settings.`);
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            this.log(`[AudioController] Got Mic Stream: ${stream.id}`);

            this.micSource = this.audioContext.createMediaStreamSource(stream);
            this.micSource.connect(this.effectBus);
            this.log('[AudioController] Mic Graph Connected: Source -> EffectBus -> Gain -> Destination');

            // DEBUG: Check signal level
            this.debugSignalLevel();

        } catch (err) {
            this.error('[AudioController] Failed to access microphone:', err);
        }
    }

    /** Linux: find a real hardware mic, skipping our virtual source and monitors. */
    private async findLinuxHardwareMic(): Promise<string | null> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const bad = /HISSOUNDBOARD|monitor/i;
            const hw = devices.find(
                (d) =>
                    d.kind === 'audioinput' &&
                    d.deviceId !== 'default' &&
                    d.deviceId !== 'communications' &&
                    d.label &&
                    !bad.test(d.label)
            );
            return hw ? hw.deviceId : null;
        } catch (err) {
            this.warn('[AudioController] Could not enumerate devices for Linux mic fallback:', err);
            return null;
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

    /**
     * Enable/disable a voice effect on the mic passthrough.
     * Pass null to go back to the clean (unprocessed) voice.
     * On Linux this also switches the mic path: the OS-level loopback is
     * unloaded and the mic routed through the app graph while an effect is
     * active, and restored when the effect is turned off.
     */
    setVoiceEffect(presetId: string | null) {
        if (presetId === this.voiceEffectId) return;
        this.log(`[AudioController] setVoiceEffect: ${presetId ?? 'off'}`);
        this.voiceEffectId = presetId;

        // Tear down the old chain and detach the bus from whatever it fed.
        if (this.voiceEffect) {
            this.voiceEffect.dispose();
            this.voiceEffect = null;
        }
        try { this.effectBus.disconnect(); } catch { /* not connected */ }

        const chain = presetId ? createVoiceEffectChain(this.audioContext, presetId) : null;
        if (chain) {
            this.effectBus.connect(chain.input);
            chain.output.connect(this.micGain);
            this.voiceEffect = chain;
        } else {
            if (presetId) this.warn(`[AudioController] Unknown voice effect preset: ${presetId}`);
            this.effectBus.connect(this.micGain);
        }

        // Make sure the graph is actually running (e.g. effect toggled before
        // any sound/mic activity resumed the context).
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch((err) =>
                this.warn('[AudioController] Failed to resume AudioContext for effect:', err)
            );
        }

        if (this.platform === 'linux') {
            this.queueLinuxMicPathUpdate();
        }
    }

    /**
     * Linux only: reconcile the mic path with the current effect state.
     * Effect active  → unload the OS loopback, then start the in-app passthrough.
     * Effect off     → stop the in-app passthrough, then restore the loopback.
     * Steps are queued so overlapping toggles execute strictly in order, and
     * the handover direction guarantees both paths are never live at once.
     */
    private queueLinuxMicPathUpdate() {
        this.linuxMicSwitch = this.linuxMicSwitch
            .then(async () => {
                const wantAppMic = this.voiceEffectId !== null;
                if (wantAppMic === this.linuxAppMicActive) return;

                const api = (window as any).api;
                if (!api?.setLinuxMicLoopback) {
                    this.warn('[AudioController] setLinuxMicLoopback bridge missing, keeping OS loopback.');
                    return;
                }

                if (wantAppMic) {
                    this.log('[AudioController] Linux: switching mic to in-app path (effect active)...');
                    const res = await api.setLinuxMicLoopback(false);
                    if (!res?.success) {
                        // Loopback still running — do NOT start the app path on top of it.
                        this.error('[AudioController] Failed to unload OS mic loopback:', res?.error);
                        return;
                    }
                    this.linuxAppMicActive = true;
                    await this.updateMicRouting();
                    if (!this.micSource) {
                        // In-app capture failed — without a fallback the user
                        // would be completely muted. Restore the OS loopback
                        // (the effect stays selected but is inaudible).
                        this.error('[AudioController] In-app mic failed to start; restoring OS loopback.');
                        this.linuxAppMicActive = false;
                        await api.setLinuxMicLoopback(true);
                    }
                } else {
                    this.log('[AudioController] Linux: switching mic back to OS loopback...');
                    this.linuxAppMicActive = false;
                    this.stopMic();
                    const res = await api.setLinuxMicLoopback(true);
                    if (!res?.success) {
                        this.error('[AudioController] Failed to restore OS mic loopback:', res?.error);
                    }
                }
            })
            .catch((err) => {
                this.error('[AudioController] Linux mic path switch failed:', err);
            });
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

        if ((sound.fadeIn || 0) > 0 || (sound.fadeOut || 0) > 0) {
            this.setupFadeHandler(monitorAudio, sound, true);
            this.setupFadeHandler(outputAudio, sound, false);
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
                    this.cleanupFadeHandler(monitorAudio);
                    this.cleanupFadeHandler(outputAudio);
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

    /** Final element volume = base × master × fade, muted-aware and clamped to 1. */
    private volumeFor(el: HTMLAudioElement, isMonitor: boolean): number {
        const base = this.elementBaseVolume.get(el) ?? 1.0;
        const fade = this.elementFade.get(el) ?? 1.0;
        const muted = isMonitor ? this.settings.monitorMuted : this.settings.outputMuted;
        const master = isMonitor ? this.settings.monitorVolume : this.settings.outputVolume;
        return muted ? 0 : Math.min(1, base * master * fade);
    }

    private async applySettingsToElements(monitor: HTMLAudioElement, output: HTMLAudioElement, baseVol: number) {
        // Apply Volume
        this.elementIsMonitor.set(monitor, true);
        this.elementIsMonitor.set(output, false);
        monitor.volume = this.volumeFor(monitor, true);
        output.volume = this.volumeFor(output, false);

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
            elements.forEach((el) => {
                // Default to monitor for the rare untracked element; pairs are
                // tagged in applySettingsToElements.
                el.volume = this.volumeFor(el, this.elementIsMonitor.get(el) ?? true);
            });
        });
    }

    stopSound(soundId: string): void {
        const elements = this.activeSounds.get(soundId);
        if (elements) {
            elements.forEach((el) => {
                this.cleanupTrimHandler(el);
                this.cleanupFadeHandler(el);
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
                this.cleanupFadeHandler(el);
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

    /** Compute the fade envelope (0..1) for an element at its current position. */
    private computeFadeFactor(el: HTMLAudioElement, sound: Sound): number {
        const fadeIn = sound.fadeIn || 0;
        const fadeOut = sound.fadeOut || 0;
        if (fadeIn <= 0 && fadeOut <= 0) return 1;
        const start = sound.trimStart || 0;
        const end = sound.trimEnd > 0 ? sound.trimEnd : (el.duration || 0);
        const t = el.currentTime;
        let f = 1;
        if (fadeIn > 0 && t < start + fadeIn) f = Math.min(f, (t - start) / fadeIn);
        if (fadeOut > 0 && end > 0 && t > end - fadeOut) f = Math.min(f, (end - t) / fadeOut);
        return Math.max(0, Math.min(1, f));
    }

    /** Drive a smooth volume envelope for a sound that has fade in/out set. */
    private setupFadeHandler(el: HTMLAudioElement, sound: Sound, isMonitor: boolean) {
        this.elementIsMonitor.set(el, isMonitor);
        // Seed the starting gain so a fade-in begins silent rather than popping.
        this.elementFade.set(el, this.computeFadeFactor(el, sound));
        el.volume = this.volumeFor(el, isMonitor);
        const id = setInterval(() => {
            if (el.paused || el.ended) return;
            this.elementFade.set(el, this.computeFadeFactor(el, sound));
            el.volume = this.volumeFor(el, isMonitor);
        }, 25);
        this.fadeIntervals.set(el, id);
    }

    private cleanupFadeHandler(el: HTMLAudioElement): void {
        const id = this.fadeIntervals.get(el);
        if (id !== undefined) {
            clearInterval(id);
            this.fadeIntervals.delete(el);
        }
        this.elementFade.delete(el);
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
