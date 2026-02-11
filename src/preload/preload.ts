import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';

export interface TriggerSoundPayload {
    page: number;
    slot: number;
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

    // ─── Renderer → Main Sends ───────────────────────────────────────────────

    /** Send current sounds data to main for broadcasting to remote clients */
    sendSoundsForRemote: (sounds: unknown) => {
        ipcRenderer.send('sounds-for-remote', sounds);
    },
};

contextBridge.exposeInMainWorld('api', api);

export type ApiType = typeof api;
