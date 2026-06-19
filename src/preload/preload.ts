import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';

export interface TriggerSoundPayload {
    page?: number; // Legacy index support
    pageId?: string; // New ID support
    slot: number;
}

export interface PageConfig {
    id: string;
    modifierKeys: number[];
}

export interface ShortcutConfig {
    mode: 'numpad' | 'standard';
    pages: PageConfig[];
}

const api = {
    // ─── Main → Renderer Events ──────────────────────────────────────────────

    /** Triggered by global shortcut or remote to play a specific sound */
    onTriggerSound: (callback: (payload: TriggerSoundPayload) => void) => {
        const handler = (_event: IpcRendererEvent, payload: TriggerSoundPayload) =>
            callback(payload);
        ipcRenderer.on('trigger-sound', handler);
        return () => ipcRenderer.removeListener('trigger-sound', handler);
    },

    /** Panic button: stop all sounds immediately */
    onPanicStop: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('panic-stop', handler);
        return () => ipcRenderer.removeListener('panic-stop', handler);
    },

    /** Remote control requests current sounds list */
    onRequestSoundsForRemote: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('request-sounds-for-remote', handler);
        return () =>
            ipcRenderer.removeListener('request-sounds-for-remote', handler);
    },

    /** Listen to Wayland fallback warning */
    onWaylandWarning: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('wayland-warning', handler);
        return () => ipcRenderer.removeListener('wayland-warning', handler);
    },

    /** Receive recorded key codes from main process */
    onKeyRecorded: (callback: (keyCode: number) => void) => {
        const handler = (_event: IpcRendererEvent, keyCode: number) => callback(keyCode);
        ipcRenderer.on('key-recorded', handler);
        return () => ipcRenderer.removeListener('key-recorded', handler);
    },

    /** Help menu → open the in-app help popup */
    onShowHelp: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('show-help', handler);
        return () => ipcRenderer.removeListener('show-help', handler);
    },

    /** Help menu → open the "More Help" easter-egg popup */
    onShowEasterEgg: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('show-easter-egg', handler);
        return () => ipcRenderer.removeListener('show-easter-egg', handler);
    },

    // ─── Renderer → Main Invocations ─────────────────────────────────────────

    /** Copy a dropped sound file to the app's sounds directory */
    saveSoundFile: (sourcePath: string, fileName: string): Promise<string> =>
        ipcRenderer.invoke('save-sound-file', sourcePath, fileName),

    /** Get local network IP and server port for QR code */
    getLocalIp: (): Promise<{ ip: string; port: number }> =>
        ipcRenderer.invoke('get-local-ip'),

    /** Download an MP3 from a URL into the sounds directory */
    downloadUrl: (url: string): Promise<string> =>
        ipcRenderer.invoke('download-url', url),

    /** Get the native file path from a dropped File object */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),

    /** Get the path to the sounds directory */
    getSoundsDir: (): Promise<string> => ipcRenderer.invoke('get-sounds-dir'),

    /** Set custom sounds directory */
    setSoundsDir: (dir: string) => ipcRenderer.send('set-sounds-dir', dir),

    /** Create Linux Virtual Sink + mic loopback (PulseAudio / PipeWire) */
    createVirtualSink: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('create-virtual-sink'),

    /** Get the host platform ('darwin' | 'win32' | 'linux') */
    getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('get-platform'),

    /** Copy text to the system clipboard via the main process */
    copyToClipboard: (text: string): Promise<boolean> =>
        ipcRenderer.invoke('copy-to-clipboard', text),

    /** Open a URL in the user's default browser */
    openExternal: (url: string): Promise<boolean> =>
        ipcRenderer.invoke('open-external', url),

    // ─── Shortcut Config & Recording ─────────────────────────────────────────

    /** Send shortcut configuration to main process */
    setShortcutConfig: (config: ShortcutConfig) => {
        ipcRenderer.send('set-shortcut-config', config);
    },

    /** Set (or clear, with '') the optional remote-control PIN */
    setRemotePin: (pin: string) => ipcRenderer.send('set-remote-pin', pin),

    /** Start listening for keys to record */
    startRecordingKeys: () => ipcRenderer.send('start-recording-keys'),

    /** Stop listening for keys */
    stopRecordingKeys: () => ipcRenderer.send('stop-recording-keys'),

    // ─── Renderer → Main Sends ───────────────────────────────────────────────

    /** Send current sounds data to main for broadcasting to remote clients */
    sendSoundsForRemote: (sounds: unknown) => {
        ipcRenderer.send('sounds-for-remote', sounds);
    },

    /** Log message to main process console */
    log: (message: string) => ipcRenderer.send('log', message),
};

contextBridge.exposeInMainWorld('api', api);

export type ApiType = typeof api;
