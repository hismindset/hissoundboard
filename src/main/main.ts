import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import os from 'os';
import https from 'https';
import httpModule from 'http';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import squirrelStartup from 'electron-squirrel-startup';

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

// Vite dev server URL declaration
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
    // Determine icon path based on platform
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

    // On macOS, the Dock icon might need explicit setting in dev mode
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

// Key code maps for uiohook-napi
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

// Current shortcut configuration
let shortcutConfig = {
    mode: 'numpad' as 'numpad' | 'standard',
    pageModifiers: {
        0: 'Ctrl',
        1: 'Alt',
        2: 'Shift',
        3: 'Ctrl+Alt',
        4: 'Ctrl+Shift',
    } as Record<number, string>,
};

// Track currently pressed keycodes to distinguish left/right modifiers
const pressedKeys = new Set<number>();

/**
 * Build possible modifier strings for the current key state.
 * Returns multiple candidates so e.g. RCtrl is tried alongside Ctrl.
 */
function getModifierCandidates(
    ctrlKey: boolean,
    altKey: boolean,
    shiftKey: boolean,
    metaKey: boolean
): string[] {
    const candidates: string[] = [];
    const isRCtrl = pressedKeys.has(UiohookKey.CtrlRight);

    const parts: string[] = [];
    if (ctrlKey) parts.push('Ctrl');
    if (altKey) parts.push('Alt');
    if (shiftKey) parts.push('Shift');
    if (metaKey) parts.push('Meta');

    if (parts.length === 0) return [];
    candidates.push(parts.join('+'));

    // If right ctrl is pressed, also try RCtrl variant
    if (ctrlKey && isRCtrl) {
        const rParts = parts.map((p) => (p === 'Ctrl' ? 'RCtrl' : p));
        candidates.push(rParts.join('+'));
    }

    return candidates;
}

/**
 * Find which page matches any of the given modifier strings
 */
function getPageForModifiers(modifiers: string[]): number | null {
    for (const [pageStr, mod] of Object.entries(shortcutConfig.pageModifiers)) {
        if (modifiers.includes(mod)) {
            return parseInt(pageStr);
        }
    }
    return null;
}

const setupGlobalHooks = () => {
    uIOhook.on('keydown', (e) => {
        pressedKeys.add(e.keycode);

        // Handle Escape = Panic Stop (no modifiers needed)
        if (e.keycode === UiohookKey.Escape) {
            mainWindow?.webContents.send('panic-stop');
            return;
        }

        // Determine which key map to use
        const keyMap = shortcutConfig.mode === 'numpad' ? NUMPAD_KEY_MAP : STANDARD_KEY_MAP;
        const number = keyMap[e.keycode];
        if (!number) return;

        // Check modifiers
        const modifiers = getModifierCandidates(
            e.ctrlKey || false,
            e.altKey || false,
            e.shiftKey || false,
            e.metaKey || false
        );

        if (modifiers.length === 0) return;

        const page = getPageForModifiers(modifiers);
        if (page === null) return;

        // Convert numpad number to grid slot index
        // Numpad layout: 7=0, 8=1, 9=2, 4=3, 5=4, 6=5, 1=6, 2=7, 3=8
        const NUMPAD_TO_SLOT: Record<number, number> = {
            7: 0, 8: 1, 9: 2,
            4: 3, 5: 4, 6: 5,
            1: 6, 2: 7, 3: 8,
        };
        const slot = NUMPAD_TO_SLOT[number];
        if (slot === undefined) return;

        mainWindow?.webContents.send('trigger-sound', { page, slot });
    });

    uIOhook.on('keyup', (e) => {
        pressedKeys.delete(e.keycode);
    });

    uIOhook.start();
};

// ─── IPC Handlers ────────────────────────────────────────────────────────────

const setupIpcHandlers = () => {
    // Register the sound:// protocol handler
    protocol.handle('sound', (request) => {
        const reqUrl = new URL(request.url);
        const filePath = decodeURIComponent(reqUrl.pathname.replace(/^\/+/, ''));
        const fullPath = path.join(getSoundsDir(), filePath);
        const fileUrl = `file://${fullPath}`;
        console.log(`[sound://] Serving: ${request.url} -> ${fileUrl}`);
        return net.fetch(fileUrl);
    });

    // Save dropped sound file
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

    // Get local IP for QR code
    ipcMain.handle('get-local-ip', () => {
        return { ip: getLocalIp(), port: SERVER_PORT };
    });

    // Download file from URL
    ipcMain.handle('download-url', async (_event, url: string) => {
        ensureSoundsDir();
        return new Promise<string>((resolve, reject) => {
            const fileName = `download_${Date.now()}.mp3`;
            const destPath = path.join(getSoundsDir(), fileName);
            const file = fs.createWriteStream(destPath);

            const httpProto = url.startsWith('https') ? https : httpModule;

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

    // Send sounds data to remote clients
    ipcMain.on('sounds-for-remote', (_event, sounds) => {
        broadcast({ type: 'sounds-update', sounds });
    });

    // Get sounds directory path
    ipcMain.handle('get-sounds-dir', () => {
        ensureSoundsDir();
        return getSoundsDir();
    });

    // Set custom sounds directory
    ipcMain.on('set-sounds-dir', (_event, dir: string) => {
        customSoundsDir = dir || '';
        if (customSoundsDir) {
            ensureSoundsDir();
        }
        console.log('[Sounds] Directory set to:', getSoundsDir());
    });

    // Receive shortcut configuration from renderer
    ipcMain.on('set-shortcut-config', (_event, config) => {
        shortcutConfig = {
            mode: config.mode || 'numpad',
            pageModifiers: config.pageModifiers || shortcutConfig.pageModifiers,
        };
        console.log('[Shortcuts] Config updated:', shortcutConfig);
    });
};

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.on('ready', () => {
    ensureSoundsDir();
    setupIpcHandlers();
    createWindow();
    setupGlobalHooks();

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
