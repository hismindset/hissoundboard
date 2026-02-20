export interface TriggerSoundPayload {
    page?: number;
    pageId?: string;
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

interface ElectronApi {
    onTriggerSound: (callback: (payload: TriggerSoundPayload) => void) => () => void;
    onPanicStop: (callback: () => void) => () => void;
    onRequestSoundsForRemote: (callback: () => void) => () => void;

    // Recording
    onKeyRecorded: (callback: (keyCode: number) => void) => () => void;
    startRecordingKeys: () => void;
    stopRecordingKeys: () => void;

    // Warnings
    onWaylandWarning?: (callback: () => void) => () => void;

    saveSoundFile: (sourcePath: string, fileName: string) => Promise<string>;
    getLocalIp: () => Promise<{ ip: string; port: number }>;
    downloadUrl: (url: string) => Promise<string>;
    getPathForFile: (file: File) => string;
    getSoundsDir: () => Promise<string>;
    setSoundsDir: (dir: string) => void;
    setShortcutConfig: (config: ShortcutConfig) => void;
    sendSoundsForRemote: (sounds: unknown) => void;
    createVirtualSink: () => Promise<{ success: boolean; error?: string }>;
}

declare global {
    interface Window {
        api: ElectronApi;
    }
}
