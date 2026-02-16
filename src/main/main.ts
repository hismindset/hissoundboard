import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import os from 'os';
import https from 'https';
import { uIOhook, UiohookKey } from 'uiohook-napi';
// @ts-ignore
import squirrelStartup from 'electron-squirrel-startup';
import { LinuxAudioManager } from './LinuxAudioManager';

const linuxAudio = new LinuxAudioManager();

console.log('[Main] Starting OpenSoundBoard...');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
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

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow;

// Sounds directory (can be overridden by renderer)
const defaultSoundsDir = path.join(app.getPath('userData'), 'sounds');
let customSoundsDir = '';

const getSoundsDir = () => customSoundsDir || defaultSoundsDir;

const ensureSoundsDir = () => {
    const dir = getSoundsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// ─── Window Creation ─────────────────────────────────────────────────────────

const createWindow = () => {
    let iconPath = path.join(__dirname, '../../resources/icon.png');
    if (process.platform === 'win32') {
        iconPath = path.join(__dirname, '../../resources/icon.ico');
    }

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 700,
        minHeight: 550,
        backgroundColor: '#0d0e1f',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (process.platform === 'darwin' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        app.dock?.setIcon(iconPath);
    }

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(
            path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
        );
    }

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
};

// ─── Remote Control Server ───────────────────────────────────────────────────

const SERVER_PORT = 8080;
const appServer = express();
const server = http.createServer(appServer);
const wss = new WebSocketServer({ server });

const getRemotePath = () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        return path.join(__dirname, '../../remote');
    }
    return path.join(__dirname, '../../remote');
};

appServer.use(express.static(getRemotePath()));

const broadcast = (data: object) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

wss.on('connection', (ws: WebSocket) => {
    mainWindow?.webContents.send('request-sounds-for-remote');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'play-sound') {
                if (data.pageId === '__PANIC__' || (data.page === -1 && data.slot === -1)) {
                    mainWindow?.webContents.send('panic-stop');
                } else {
                    mainWindow?.webContents.send('trigger-sound', {
                        pageId: data.pageId, // ID driven
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
        for (const netIf of nets[name]!) {
            if (netIf.family === 'IPv4' && !netIf.internal) {
                return netIf.address;
            }
        }
    }
    return '127.0.0.1';
};

// ─── uiohook-napi: Global Keyboard Hooks ──────────────────────────────────────

const NUMPAD_KEY_MAP: Record<number, number> = {
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

const STANDARD_KEY_MAP: Record<number, number> = {
    [UiohookKey['1']]: 1,
    [UiohookKey['2']]: 2,
    [UiohookKey['3']]: 3,
    [UiohookKey['4']]: 4,
    [UiohookKey['5']]: 5,
    [UiohookKey['6']]: 6,
    [UiohookKey['7']]: 7,
    [UiohookKey['8']]: 8,
    [UiohookKey['9']]: 9,
};

const NUMPAD_TO_SLOT: Record<number, number> = {
    7: 0, 8: 1, 9: 2,
    4: 3, 5: 4, 6: 5,
    1: 6, 2: 7, 3: 8,
};

// Configuration
interface PageConfig {
    id: string;
    modifierKeys: number[];
}

let shortcutConfig = {
    mode: 'numpad' as 'numpad' | 'standard',
    pages: [] as PageConfig[],
};

// State
let isRecording = false;
const pressedKeys = new Set<number>();

// Helper to check if two sets of keys are identical
const areKeysEqual = (keysA: number[], keysB: number[]) => {
    if (keysA.length !== keysB.length) return false;
    const setA = new Set(keysA);
    for (const k of keysB) {
        if (!setA.has(k)) return false;
    }
    return true;
};

// Modifier keys that we care about for filtering
const MODIFIER_KEYS = new Set([
    UiohookKey.Ctrl, UiohookKey.CtrlRight,
    UiohookKey.Alt, UiohookKey.AltRight,
    UiohookKey.Shift, UiohookKey.ShiftRight,
    UiohookKey.Meta, UiohookKey.MetaRight,
]);

const setupGlobalHooks = () => {
    uIOhook.on('keydown', (e) => {
        pressedKeys.add(e.keycode);

        // Recording Mode
        if (isRecording) {
            console.log('[Recorder] Key Pressed:', e.keycode);
            // Allow recording ANY key for debugging, or filter?
            // The prompt said "Only accept Modifier keys".
            // But if user wants to use "Tab" as modifier?
            // Let's stick to MODIFIER_KEYS filter as per requirements but log it.
            if (MODIFIER_KEYS.has(e.keycode)) {
                mainWindow?.webContents.send('key-recorded', e.keycode);
            } else {
                console.log('[Recorder] Ignored non-modifier:', e.keycode);
            }
            return;
        }

        // Panic Stop
        if (e.keycode === UiohookKey.Escape) {
            console.log('[Shortcut] Panic Stop Triggered');
            mainWindow?.webContents.send('panic-stop');
            return;
        }

        // Normal Trigger Logic
        const keyMap = shortcutConfig.mode === 'numpad' ? NUMPAD_KEY_MAP : STANDARD_KEY_MAP;
        const number = keyMap[e.keycode];

        // If a trigger key (Numpad 1-9) is pressed
        if (number) {
            // Check currently pressed modifiers
            const currentModifiers = Array.from(pressedKeys).filter(k => MODIFIER_KEYS.has(k));
            console.log(`[Shortcut] Trigger Key ${number} pressed. Modifiers:`, currentModifiers);
            console.log('[Shortcut] Configured Pages:', JSON.stringify(shortcutConfig.pages));

            // Find a page that matches these modifiers exactly
            const matchedPage = shortcutConfig.pages.find(page =>
                areKeysEqual(page.modifierKeys, currentModifiers)
            );

            if (matchedPage) {
                const slot = NUMPAD_TO_SLOT[number];
                console.log(`[Shortcut] Matched Page: ${matchedPage.id}, Slot: ${slot}`);
                if (slot !== undefined) {
                    mainWindow?.webContents.send('trigger-sound', {
                        pageId: matchedPage.id, // Send ID
                        slot,
                    });
                }
            } else {
                console.log('[Shortcut] No matching page found for modifiers.');
            }
        }
    });

    uIOhook.on('keyup', (e) => {
        pressedKeys.delete(e.keycode);
    });

    uIOhook.start();
    console.log('[Main] Global hooks started');
};

// ─── IPC Handlers ────────────────────────────────────────────────────────────

const setupIpcHandlers = () => {
    protocol.handle('sound', (request) => {
        const reqUrl = new URL(request.url);
        const filePath = decodeURIComponent(reqUrl.pathname.replace(/^\/+/, ''));
        const fullPath = path.join(getSoundsDir(), filePath);
        const fileUrl = `file://${fullPath}`;
        return net.fetch(fileUrl);
    });

    ipcMain.handle(
        'save-sound-file',
        async (_event, sourcePath: string, fileName: string) => {
            ensureSoundsDir();
            const destPath = path.join(getSoundsDir(), fileName);
            if (path.dirname(sourcePath) !== getSoundsDir()) {
                fs.copyFileSync(sourcePath, destPath);
            }
            return `sound://play/${encodeURIComponent(fileName)}`;
        }
    );

    ipcMain.handle('get-local-ip', () => {
        return { ip: getLocalIp(), port: SERVER_PORT };
    });

    ipcMain.handle('download-url', async (_event, url: string) => {
        ensureSoundsDir();
        return new Promise<string>((resolve, reject) => {
            const fileName = `download_${Date.now()}.mp3`;
            const destPath = path.join(getSoundsDir(), fileName);
            const file = fs.createWriteStream(destPath);
            const httpProto = url.startsWith('https') ? https : http;

            const request = httpProto.get(url, (response) => {
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
                            resolve(`sound://play/${encodeURIComponent(fileName)}`);
                        });
                    });
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(`sound://play/${encodeURIComponent(fileName)}`);
                });
            });

            request.on('error', (err) => {
                fs.unlink(destPath, () => { });
                reject(err.message);
            });
        });
    });

    ipcMain.on('sounds-for-remote', (_event, sounds) => {
        broadcast({ type: 'sounds-update', sounds });
    });

    ipcMain.handle('get-sounds-dir', () => {
        ensureSoundsDir();
        return getSoundsDir();
    });

    ipcMain.on('set-sounds-dir', (_event, dir: string) => {
        customSoundsDir = dir || '';
        if (customSoundsDir) {
            ensureSoundsDir();
        }
    });

    // Linux Virtual Sink
    ipcMain.handle('create-virtual-sink', async () => {
        if (process.platform !== 'linux') return { success: false, error: 'Not supported on this OS' };
        return await linuxAudio.createSink();
    });

    // Receive shortcut configuration
    ipcMain.on('set-shortcut-config', (_event, config) => {
        shortcutConfig = {
            mode: config.mode || 'numpad',
            pages: config.pages || [],
        };
        console.log('[Shortcuts] Config updated:', shortcutConfig.pages.length, 'pages');
    });

    // Key Recording IPC
    ipcMain.on('start-recording-keys', () => {
        console.log('[Recorder] Started recording');
        isRecording = true;
        pressedKeys.clear(); // Reset to avoid stuck keys
    });

    ipcMain.on('stop-recording-keys', () => {
        console.log('[Recorder] Stopped recording');
        isRecording = false;
    });

    // Logging Bridge
    ipcMain.on('log', (_event, message) => {
        console.log(message);
    });
};

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.on('ready', () => {
    ensureSoundsDir();
    setupIpcHandlers();
    createWindow();
    setupGlobalHooks();

    // Linux Specific Startup
    linuxAudio.ensureAudioSink();

    server.listen(SERVER_PORT, '0.0.0.0', () => {
        console.log(`Remote control server running on http://${getLocalIp()}:${SERVER_PORT}`);
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

app.on('will-quit', () => {
    uIOhook.stop();
});
