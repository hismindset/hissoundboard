export interface TriggerSoundPayload {
    page: number;
    slot: number;
}

export interface ShortcutConfig {
    mode: 'numpad' | 'standard';
    pageModifiers: Record<number, string>;
}

interface ElectronApi {
    onTriggerSound: (callback: (payload: TriggerSoundPayload) => void) => () => void;
    onPanicStop: (callback: () => void) => () => void;
    onRequestSoundsForRemote: (callback: () => void) => () => void;
    saveSoundFile: (sourcePath: string, fileName: string) => Promise<string>;
    getLocalIp: () => Promise<{ ip: string; port: number }>;
    downloadUrl: (url: string) => Promise<string>;
    getPathForFile: (file: File) => string;
    getSoundsDir: () => Promise<string>;
    setSoundsDir: (dir: string) => void;
    setShortcutConfig: (config: ShortcutConfig) => void;
    sendSoundsForRemote: (sounds: unknown) => void;
}

declare global {
    interface Window {
        api: ElectronApi;
    }
}
