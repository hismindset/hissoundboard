import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import os from 'os';
import electronDl from 'electron-dl';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const numpadKeyMap: { [key: number]: number } = {
  [UiohookKey.Numpad1]: 1,
  [UiohookKey.Numpad2]: 2,
  [UiohookKey.Numpad3]: 3,
  [UiohookKey.Numpad4]: 4,
  [UiohookKey.Numpad5]: 5,
  [UiohookKey.Numpad6]: 6,
  [UiohookKey.Numpad7]: 7,
  [UiohookKey.Numpad8]: 8,
  [UiohookKey.Numpad9]: 9,
};

let mainWindow: BrowserWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/main_window/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  uIOhook.on('keydown', (event) => {
    if (event.keycode === UiohookKey.Escape) {
      mainWindow.webContents.send('panic');
      return;
    }

    const numpadNumber = numpadKeyMap[event.keycode];
    if (numpadNumber) {
      let page = 0;
      if (event.ctrlKey) {
        page = 0; // Page 1
      } else if (event.altKey) {
        page = 1; // Page 2
      }
      const soundId = page * 9 + (numpadNumber - 1);
      mainWindow.webContents.send('play-sound', soundId);
    }
  });

  uIOhook.start();
};

const appServer = express();
const server = http.createServer(appServer);
const wss = new WebSocket.Server({ server });

appServer.use(express.static(path.join(__dirname, '../../remote')));

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    if (data.type === 'play-sound') {
      mainWindow.webContents.send('play-sound', data.soundId);
    }
  });
});

appServer.get('/sounds', async (req, res) => {
  mainWindow.webContents.send('get-sounds');
  ipcMain.once('get-sounds-reply', (event, sounds) => {
    res.json(sounds);
  });
});

app.on('ready', () => {
  createWindow();

  ipcMain.handle('download-file', async (event, url: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      await electronDl.download(win, url);
    }
  });

  ipcMain.handle('get-local-ip', () => {
    const nets = os.networkInterfaces();
    const results: { [key: string]: string[] } = {};
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (net.family === 'IPv4' && !net.internal) {
          if (!results[name]) {
            results[name] = [];
          }
          results[name].push(net.address);
        }
      }
    }
    return results;
  });

  server.listen(8080, () => {
    console.log('Server started on port 8080');
  });
});

app.on('window-all-closed', () => {
  uIOhook.stop();
  server.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('save-file', async (event, filePath: string) => {
  console.log('File path received in main process:', filePath);
  return filePath;
});