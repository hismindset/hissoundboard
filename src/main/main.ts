import { app, BrowserWindow, ipcMain, globalShortcut, dialog, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import os from 'os';
import https from 'https';
import httpModule from 'http';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

// Register custom protocol for serving sound files
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'sound',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true,
            bypassCSP: true,
        },
    },
]);

// Vite dev server URL declaration
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow;

// Ensure sounds directory exists
const soundsDir = path.join(app.getPath('userData'), 'sounds');

const ensureSoundsDir = () => {
    if (!fs.existsSync(soundsDir)) {
        fs.mkdirSync(soundsDir, { recursive: true });
    }
};

// ─── Window Creation ─────────────────────────────────────────────────────────

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 700,
        minHeight: 550,
        backgroundColor: '#0d0e1f',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(
            path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
        );
    }

    // Open DevTools in development
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
};

// ─── Remote Control Server ───────────────────────────────────────────────────

const SERVER_PORT = 8080;
const appServer = express();
const server = http.createServer(appServer);
const wss = new WebSocketServer({ server });

// Serve remote control page
const getRemotePath = () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        return path.join(__dirname, '../../remote');
    }
    return path.join(__dirname, '../../remote');
};

appServer.use(express.static(getRemotePath()));

// Broadcast to all connected WebSocket clients
const broadcast = (data: object) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

wss.on('connection', (ws: WebSocket) => {
    // Send current state to newly connected client
    mainWindow?.webContents.send('request-sounds-for-remote');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'play-sound') {
                // Panic from remote: page=-1, slot=-1
                if (data.page === -1 && data.slot === -1) {
                    mainWindow?.webContents.send('panic-stop');
                } else {
                    mainWindow?.webContents.send('trigger-sound', {
                        page: data.page,
                        slot: data.slot,
                    });
                }
            } else if (data.type === 'request-sounds') {
                mainWindow?.webContents.send('request-sounds-for-remote');
            }
        } catch (e) {
            console.error('Invalid WebSocket message:', e);
        }
    });
});

// REST endpoint for sounds
appServer.get('/api/sounds', (_req, res) => {
    mainWindow?.webContents.send('request-sounds-for-remote');
    ipcMain.once('sounds-for-remote', (_event, sounds) => {
        res.json(sounds);
    });
});

// ─── Helper: Get local IP ────────────────────────────────────────────────────

const getLocalIp = (): string => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
};

// ─── IPC Handlers ────────────────────────────────────────────────────────────

const setupIpcHandlers = () => {
    // Register the sound:// protocol handler to serve audio files
    protocol.handle('sound', (request) => {
        const reqUrl = new URL(request.url);
        const filePath = decodeURIComponent(reqUrl.pathname.replace(/^\/+/, ''));
        // Serve from the sounds directory
        const fullPath = path.join(soundsDir, filePath);
        const fileUrl = `file://${fullPath}`;
        console.log(`[sound://] Serving: ${request.url} -> ${fileUrl}`);
        return net.fetch(fileUrl);
    });

    // Save dropped sound file to app data directory
    ipcMain.handle(
        'save-sound-file',
        async (_event, sourcePath: string, fileName: string) => {
            ensureSoundsDir();
            const destPath = path.join(soundsDir, fileName);
            // Only copy if not already in sounds directory
            if (path.dirname(sourcePath) !== soundsDir) {
                fs.copyFileSync(sourcePath, destPath);
            }
            // Return a sound:// URL that the renderer can load
            return `sound://play/${encodeURIComponent(fileName)}`;
        }
    );

    // Get local IP for QR code
    ipcMain.handle('get-local-ip', () => {
        return { ip: getLocalIp(), port: SERVER_PORT };
    });

    // Download file from URL
    ipcMain.handle('download-url', async (_event, url: string) => {
        ensureSoundsDir();
        return new Promise<string>((resolve, reject) => {
            const fileName = `download_${Date.now()}.mp3`;
            const destPath = path.join(soundsDir, fileName);
            const file = fs.createWriteStream(destPath);

            const httpProto = url.startsWith('https') ? https : httpModule;

            const request = httpProto.get(url, (response) => {
                // Follow redirects
                if (
                    response.statusCode &&
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {
                    httpProto.get(response.headers.location, (redirectResponse) => {
                        redirectResponse.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve(`sound://${encodeURIComponent(fileName)}`);
                        });
                    });
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(`sound://${encodeURIComponent(fileName)}`);
                });
            });

            request.on('error', (err) => {
                fs.unlink(destPath, () => { }); // cleanup
                reject(err.message);
            });
        });
    });

    // Send sounds data to remote clients
    ipcMain.on('sounds-for-remote', (_event, sounds) => {
        broadcast({ type: 'sounds-update', sounds });
    });

    // Get sounds directory path
    ipcMain.handle('get-sounds-dir', () => {
        ensureSoundsDir();
        return soundsDir;
    });
};

// ─── Global Shortcuts ────────────────────────────────────────────────────────

const registerShortcuts = () => {
    // Panic button: Escape stops all sounds
    globalShortcut.register('Escape', () => {
        mainWindow?.webContents.send('panic-stop');
    });

    // Numpad shortcuts: Ctrl+Num1-9 = Page 1, Alt+Num1-9 = Page 2
    for (let i = 1; i <= 9; i++) {
        try {
            globalShortcut.register(`CommandOrControl+num${i}`, () => {
                mainWindow?.webContents.send('trigger-sound', { page: 0, slot: i - 1 });
            });
        } catch (e) {
            /* Numpad keys may not be available on all keyboards */
        }

        try {
            globalShortcut.register(`Alt+num${i}`, () => {
                mainWindow?.webContents.send('trigger-sound', { page: 1, slot: i - 1 });
            });
        } catch (e) {
            /* Numpad keys may not be available on all keyboards */
        }
    }
};

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.on('ready', () => {
    ensureSoundsDir();
    setupIpcHandlers();
    createWindow();
    registerShortcuts();

    server.listen(SERVER_PORT, () => {
        console.log(`Remote control server running on http://${getLocalIp()}:${SERVER_PORT}`);
    });
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
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

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
