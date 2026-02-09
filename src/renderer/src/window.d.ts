export {};

declare global {
  interface Window {
    api: {
      saveFile: (filePath: string) => Promise<string>;
      onPanic: (callback: () => void) => void;
      onPlaySound: (callback: (soundId: number) => void) => void;
      getLocalIp: () => Promise<{ [key: string]: string[] }>;
      onGetSounds: (callback: () => void) => void;
      sendSounds: (sounds: any) => void;
      downloadFile: (url: string) => Promise<void>;
    };
  }
}
