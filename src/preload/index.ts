import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  saveFile: (filePath: string) => ipcRenderer.invoke('save-file', filePath),
  onPanic: (callback: () => void) => ipcRenderer.on('panic', callback),
  onPlaySound: (callback: (soundId: number) => void) =>
    ipcRenderer.on('play-sound', (event, soundId) => callback(soundId)),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  onGetSounds: (callback: () => void) => ipcRenderer.on('get-sounds', callback),
  sendSounds: (sounds: any) => ipcRenderer.send('get-sounds-reply', sounds),
  downloadFile: (url: string) => ipcRenderer.invoke('download-file', url),
});