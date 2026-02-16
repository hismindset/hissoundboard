import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class LinuxAudioManager {
    private static SINK_NAME = 'OpenSoundBoard_Output';
    private static PROPS = 'device.description="OpenSoundBoard_Virtual_Mic"';
    private loadedModuleId: string | null = null;

    constructor() {
        console.log('[LinuxAudio] Initialized manager.');
    }

    /**
     * Checks if `pactl` is available on the system.
     */
    async checkDependency(): Promise<boolean> {
        try {
            await execAsync('which pactl');
            return true;
        } catch (error) {
            console.error('[LinuxAudio] Dependency check failed: pactl not found.', error);
            return false;
        }
    }

    /**
     * Checks if the virtual sink already exists.
     */
    async checkSinkExists(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('pactl list short modules');
            // Look for our specific sink name argument
            const exists = stdout.includes(`sink_name=${LinuxAudioManager.SINK_NAME}`);
            if (exists) {
                console.log('[LinuxAudio] Virtual sink already exists.');
            }
            return exists;
        } catch (error) {
            console.error('[LinuxAudio] Failed to list modules:', error);
            return false;
        }
    }

    /**
     * Attempts to create the virtual sink.
     * Returns the module ID on success.
     */
    async createSink(): Promise<{ success: boolean; error?: string; id?: string }> {
        console.log('[LinuxAudio] Attempting to create virtual sink...');

        // 1. Check Dependency
        if (!(await this.checkDependency())) {
            return { success: false, error: 'Dependency "pulseaudio-utils" (pactl) is missing.' };
        }

        // 2. Check Exists
        if (await this.checkSinkExists()) {
            return { success: true, id: 'existing' };
        }

        // 3. Create
        const command = `pactl load-module module-null-sink sink_name=${LinuxAudioManager.SINK_NAME} sink_properties=${LinuxAudioManager.PROPS}`;
        console.log('[LinuxAudio] Executing:', command);

        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr && !stdout) {
                console.warn('[LinuxAudio] stderr output:', stderr);
            }

            const id = stdout.trim();
            this.loadedModuleId = id;
            console.log('[LinuxAudio] Success. Module ID:', id);

            return { success: true, id };
        } catch (error: any) {
            console.error('[LinuxAudio] Execution failed:', error);
            return { success: false, error: error.message || 'Unknown error during pactl execution' };
        }
    }

    /**
     * High-level method to ensure the sink is ready.
     * Can be called on app startup.
     */
    async ensureAudioSink(): Promise<void> {
        if (process.platform !== 'linux') return;

        console.log('[LinuxAudio] Ensuring audio sink on startup...');
        const result = await this.createSink();
        if (!result.success) {
            console.error('[LinuxAudio] Startup check failed:', result.error);
        }
    }
}
