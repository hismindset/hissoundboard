import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * LinuxAudioManager sets up true OS-level mixing on PulseAudio / PipeWire.
 *
 * Concept:
 *   1. Create a virtual null sink ("OpenSoundBoard_Output").
 *      The app plays soundboard audio into this sink.
 *   2. Loop the user's real hardware microphone INTO the same sink
 *      (module-loopback). PulseAudio mixes mic + sounds automatically.
 *   3. The sink's monitor source ("OpenSoundBoard_Output.monitor") now
 *      carries voice + sounds. The user selects it as the input device in
 *      Discord/Teams/etc.
 *
 * This means the microphone works even when no sound is playing, with no
 * in-app Web Audio passthrough and no added latency.
 */
export class LinuxAudioManager {
    private static SINK_NAME = 'OpenSoundBoard_Output';
    private static PROPS = 'device.description=OpenSoundBoard_Virtual_Mic';
    // The remapped capture source — this is what shows up as a real microphone in apps.
    private static SOURCE_NAME = 'OpenSoundBoard_Mic';

    // Module IDs we created, so we can unload them cleanly on quit.
    private sinkModuleId: string | null = null;
    private loopbackModuleId: string | null = null;
    private sourceModuleId: string | null = null;

    constructor() {
        console.log('[LinuxAudio] Initialized manager.');
    }

    /** Checks if `pactl` is available on the system (works on PulseAudio AND PipeWire). */
    async checkDependency(): Promise<boolean> {
        try {
            await execAsync('which pactl');
            return true;
        } catch (error) {
            console.error('[LinuxAudio] Dependency check failed: pactl not found.', error);
            return false;
        }
    }

    /** Checks if our virtual sink already exists (e.g. from a previous run). */
    async checkSinkExists(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('pactl list short modules');
            return stdout.includes(`sink_name=${LinuxAudioManager.SINK_NAME}`);
        } catch (error) {
            console.error('[LinuxAudio] Failed to list modules:', error);
            return false;
        }
    }

    /** Checks if a loopback into our sink already exists. */
    private async checkLoopbackExists(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('pactl list short modules');
            return stdout
                .split('\n')
                .some(line => line.includes('module-loopback') && line.includes(`sink=${LinuxAudioManager.SINK_NAME}`));
        } catch {
            return false;
        }
    }

    /** Returns the system's default *hardware* source (mic), or null if unusable. */
    private async getDefaultSource(): Promise<string | null> {
        try {
            const { stdout } = await execAsync('pactl get-default-source');
            const src = stdout.trim();
            if (!src) return null;
            // Never loop a monitor source back into the sink — that would create feedback.
            if (src.endsWith('.monitor')) {
                console.warn('[LinuxAudio] Default source is a monitor, refusing to loop it back:', src);
                return null;
            }
            return src;
        } catch (error) {
            console.error('[LinuxAudio] Failed to get default source:', error);
            return null;
        }
    }

    /** Attempts to create the virtual sink. Returns the module ID on success. */
    async createSink(): Promise<{ success: boolean; error?: string; id?: string }> {
        console.log('[LinuxAudio] Attempting to create virtual sink...');

        if (!(await this.checkDependency())) {
            return { success: false, error: 'Dependency "pactl" (pulseaudio-utils / pipewire-pulse) is missing.' };
        }

        if (await this.checkSinkExists()) {
            console.log('[LinuxAudio] Virtual sink already exists.');
            return { success: true, id: 'existing' };
        }

        const command = `pactl load-module module-null-sink sink_name=${LinuxAudioManager.SINK_NAME} sink_properties=${LinuxAudioManager.PROPS}`;
        console.log('[LinuxAudio] Executing:', command);

        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr && !stdout) console.warn('[LinuxAudio] stderr output:', stderr);

            const id = stdout.trim();
            this.sinkModuleId = id;
            console.log('[LinuxAudio] Sink created. Module ID:', id);
            return { success: true, id };
        } catch (error: any) {
            console.error('[LinuxAudio] Sink creation failed:', error);
            return { success: false, error: error.message || 'Unknown error during pactl execution' };
        }
    }

    /**
     * Loops the default hardware microphone into our virtual sink so that the
     * sink's monitor carries mic + sounds. Idempotent.
     */
    async createMicLoopback(): Promise<{ success: boolean; error?: string }> {
        if (await this.checkLoopbackExists()) {
            console.log('[LinuxAudio] Mic loopback already exists.');
            return { success: true };
        }

        const source = await this.getDefaultSource();
        if (!source) {
            return { success: false, error: 'No usable hardware microphone (default source) found.' };
        }

        // low latency, and prevent PA from auto-moving the streams elsewhere
        const command =
            `pactl load-module module-loopback source=${source} sink=${LinuxAudioManager.SINK_NAME} ` +
            `latency_msec=20 source_dont_move=true sink_dont_move=true`;
        console.log('[LinuxAudio] Executing:', command);

        try {
            const { stdout } = await execAsync(command);
            this.loopbackModuleId = stdout.trim();
            console.log('[LinuxAudio] Mic loopback created. Module ID:', this.loopbackModuleId, 'from source:', source);
            return { success: true };
        } catch (error: any) {
            console.error('[LinuxAudio] Loopback creation failed:', error);
            return { success: false, error: error.message || 'Unknown error during loopback creation' };
        }
    }

    /** Checks if our remapped virtual source already exists. */
    private async checkSourceExists(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('pactl list short modules');
            return stdout.includes(`source_name=${LinuxAudioManager.SOURCE_NAME}`);
        } catch {
            return false;
        }
    }

    /**
     * Exposes the sink's monitor as a real capture *source* so apps like
     * TeamSpeak/Discord list it as a normal microphone (not a hidden monitor).
     * Idempotent.
     */
    async createVirtualSource(): Promise<{ success: boolean; error?: string }> {
        if (await this.checkSourceExists()) {
            console.log('[LinuxAudio] Virtual source already exists.');
            return { success: true };
        }

        const command =
            `pactl load-module module-remap-source ` +
            `master=${LinuxAudioManager.SINK_NAME}.monitor ` +
            `source_name=${LinuxAudioManager.SOURCE_NAME} ` +
            `source_properties=device.description=${LinuxAudioManager.SOURCE_NAME}`;
        console.log('[LinuxAudio] Executing:', command);

        try {
            const { stdout } = await execAsync(command);
            this.sourceModuleId = stdout.trim();
            console.log('[LinuxAudio] Virtual source created. Module ID:', this.sourceModuleId);
            return { success: true };
        } catch (error: any) {
            console.error('[LinuxAudio] Virtual source creation failed:', error);
            return { success: false, error: error.message || 'Unknown error during source creation' };
        }
    }

    /**
     * High-level: ensure the full OS-mixing chain is ready:
     *   null sink  ←  (sounds from app) + (mic via loopback)
     *   remap source  ←  sink.monitor   (shows up as a real microphone)
     * Safe to call on every startup — it reuses anything that already exists.
     */
    async setupAutoMix(): Promise<{ success: boolean; error?: string }> {
        if (process.platform !== 'linux') return { success: false, error: 'Not supported on this OS' };

        console.log('[LinuxAudio] Setting up automatic OS-level mixing...');
        const sink = await this.createSink();
        if (!sink.success) return sink;

        const loop = await this.createMicLoopback();
        if (!loop.success) {
            // Sink is still useful (sounds work) even without the mic loopback.
            console.warn('[LinuxAudio] Sink ready, but mic loopback failed:', loop.error);
        }

        const source = await this.createVirtualSource();
        if (!source.success) {
            console.warn('[LinuxAudio] Sink ready, but virtual source failed:', source.error);
            return { success: true, error: source.error };
        }

        console.log(`[LinuxAudio] OS-level mixing ready. Select "${LinuxAudioManager.SOURCE_NAME}" as your microphone.`);
        return { success: true };
    }

    /** Back-compat alias used on startup. */
    async ensureAudioSink(): Promise<void> {
        await this.setupAutoMix();
    }

    /** Unload modules we created so we don't leak virtual devices across restarts. */
    async teardown(): Promise<void> {
        if (process.platform !== 'linux') return;

        const unload = async (id: string | null, label: string) => {
            if (!id || id === 'existing') return;
            try {
                await execAsync(`pactl unload-module ${id}`);
                console.log(`[LinuxAudio] Unloaded ${label} (module ${id}).`);
            } catch (error) {
                console.warn(`[LinuxAudio] Failed to unload ${label} (module ${id}):`, error);
            }
        };

        // Unload in reverse dependency order: source → loopback → sink.
        await unload(this.sourceModuleId, 'virtual source');
        await unload(this.loopbackModuleId, 'mic loopback');
        await unload(this.sinkModuleId, 'virtual sink');
        this.sourceModuleId = null;
        this.loopbackModuleId = null;
        this.sinkModuleId = null;
    }
}
