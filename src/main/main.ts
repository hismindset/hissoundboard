import { app, BrowserWindow, ipcMain, protocol, net, session, globalShortcut, clipboard, shell, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
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

console.log('[Main] Starting HISSOUNDBOARD...');

// One-time migration: the app was renamed (OpenSoundBoard -> "HIS SoundBoard" ->
// HISSOUNDBOARD); each rename changes Electron's userData directory. Copy the most
// recent previous profile into the new one so users keep their board after a rename.
const migrateLegacyUserData = () => {
    try {
        const newDir = app.getPath('userData');
        // New profile already initialised -> nothing to migrate.
        if (fs.existsSync(path.join(newDir, 'Local Storage'))) return;
        const appData = app.getPath('appData');
        const legacyNames = ['HIS SoundBoard', 'OpenSoundBoard']; // most recent first
        for (const name of legacyNames) {
            const legacyDir = path.join(appData, name);
            if (legacyDir === newDir) continue;
            if (fs.existsSync(path.join(legacyDir, 'Local Storage'))) {
                fs.cpSync(legacyDir, newDir, { recursive: true, force: false, errorOnExist: false });
                console.log(`[Main] Migrated user data from legacy "${name}" profile.`);
                return;
            }
        }
    } catch (err) {
        console.error('[Main] userData migration failed:', err);
    }
};

// Run before anything touches the session/userData (must happen before app 'ready').
migrateLegacyUserData();

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
            // Required so the renderer (origin file://) may fetch() this scheme
            // cross-origin. Without it Chromium blocks the request outright and
            // WaveSurfer can't read the audio to draw the waveform / preview.
            corsEnabled: true,
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

// Build the application menu. We keep the standard roles (so copy/paste,
// dev tools, window controls keep working) and add a Help menu whose items
// ask the renderer to open the in-app help / easter-egg popups.
const buildAppMenu = () => {
    const isMac = process.platform === 'darwin';

    const sendToRenderer = (channel: string) => () => {
        mainWindow?.webContents.send(channel);
    };

    const template: MenuItemConstructorOptions[] = [
        ...(isMac
            ? [{ role: 'appMenu' as const }]
            : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Show Help',
                    accelerator: isMac ? 'Cmd+?' : 'F1',
                    click: sendToRenderer('show-help'),
                },
                {
                    label: 'More Help',
                    click: sendToRenderer('show-easter-egg'),
                },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

// Optional remote PIN. '' = disabled (anyone on the LAN may control, original
// behaviour). When set, clients must authenticate before they can list or
// trigger sounds. Kept in sync from the renderer via the 'set-remote-pin' IPC.
let remotePin = '';

const isAuthed = (ws: WebSocket) => !remotePin || (ws as any).hsbAuthed === true;

const broadcast = (data: object) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        // Don't leak the board to clients that haven't entered the PIN.
        if (client.readyState === WebSocket.OPEN && isAuthed(client)) {
            client.send(message);
        }
    });
};

wss.on('connection', (ws: WebSocket) => {
    (ws as any).hsbAuthed = !remotePin;
    if (remotePin) {
        // Tell the remote to ask the user for the PIN.
        ws.send(JSON.stringify({ type: 'auth-required' }));
    } else {
        mainWindow?.webContents.send('request-sounds-for-remote');
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'auth') {
                if (remotePin && data.pin === remotePin) {
                    (ws as any).hsbAuthed = true;
                    ws.send(JSON.stringify({ type: 'auth-ok' }));
                    mainWindow?.webContents.send('request-sounds-for-remote');
                } else {
                    ws.send(JSON.stringify({ type: 'auth-failed' }));
                }
                return;
            }

            // Every other action requires auth when a PIN is configured.
            if (!isAuthed(ws)) {
                ws.send(JSON.stringify({ type: 'auth-required' }));
                return;
            }

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

// Guard the HTTP control endpoints with the same optional PIN. External tools
// (Stream Deck, Wayland shortcuts) pass it as ?pin=… when one is configured.
const httpPinOk = (req: express.Request, res: express.Response): boolean => {
    if (!remotePin) return true;
    if (req.query.pin === remotePin) return true;
    res.status(401).json({ ok: false, error: 'PIN required' });
    return false;
};

appServer.get('/api/sounds', (req, res) => {
    if (!httpPinOk(req, res)) return;
    mainWindow?.webContents.send('request-sounds-for-remote');
    ipcMain.once('sounds-for-remote', (_event, sounds) => {
        res.json(sounds);
    });
});

// ─── Trigger Endpoints (for OS-level / Wayland global shortcuts, Stream Deck, etc.) ──
// Lets any external tool play a sound via a simple HTTP GET, e.g. bound to a
// KDE custom shortcut: curl "http://localhost:8080/api/trigger/<pageId>/<slot>"
appServer.get('/api/trigger/:pageId/:slot', (req, res) => {
    if (!httpPinOk(req, res)) return;
    const { pageId } = req.params;
    const slot = Number(req.params.slot);
    if (!pageId || Number.isNaN(slot)) {
        res.status(400).json({ ok: false, error: 'pageId and numeric slot required' });
        return;
    }
    mainWindow?.webContents.send('trigger-sound', { pageId, slot });
    res.json({ ok: true, pageId, slot });
});

appServer.get('/api/panic', (req, res) => {
    if (!httpPinOk(req, res)) return;
    mainWindow?.webContents.send('panic-stop');
    res.json({ ok: true });
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
const MODIFIER_KEYS = new Set<number>([
    UiohookKey.Ctrl, UiohookKey.CtrlRight,
    UiohookKey.Alt, UiohookKey.AltRight,
    UiohookKey.Shift, UiohookKey.ShiftRight,
    UiohookKey.Meta, UiohookKey.MetaRight,
]);

let useFallback = false;

const registerFallbackShortcuts = () => {
    globalShortcut.unregisterAll();

    const uioModifierMap: Record<number, string> = {
        [UiohookKey.Ctrl]: 'Control',
        [UiohookKey.CtrlRight]: 'Control',
        [UiohookKey.Alt]: 'Alt',
        [UiohookKey.AltRight]: 'Alt',
        [UiohookKey.Shift]: 'Shift',
        [UiohookKey.ShiftRight]: 'Shift',
        [UiohookKey.Meta]: 'Command',
        [UiohookKey.MetaRight]: 'Command',
    };

    const keys = shortcutConfig.mode === 'numpad'
        ? ['num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9']
        : ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const slotMap = [6, 7, 8, 3, 4, 5, 0, 1, 2];

    shortcutConfig.pages.forEach(page => {
        const electronModifiers = Array.from(new Set(
            page.modifierKeys.map(k => uioModifierMap[k]).filter(Boolean)
        )).join('+');

        const prefix = electronModifiers ? `${electronModifiers}+` : '';

        keys.forEach((key, index) => {
            const slot = slotMap[index];
            const accelerator = `${prefix}${key}`;
            try {
                globalShortcut.register(accelerator, () => {
                    mainWindow?.webContents.send('trigger-sound', {
                        pageId: page.id,
                        slot,
                    });
                });
            } catch (err) {
                console.error(`[Shortcut] Failed to register fallback ${accelerator}`, err);
            }
        });
    });

    try {
        globalShortcut.register('Escape', () => {
            mainWindow?.webContents.send('panic-stop');
        });
    } catch (err) { }
};

const setupGlobalHooks = () => {
    const isWayland = process.env.WAYLAND_DISPLAY !== undefined;
    useFallback = isWayland;

    if (!isWayland) {
        try {
            uIOhook.on('keydown', (e) => {
                pressedKeys.add(e.keycode);

                // Recording Mode
                if (isRecording) {
                    console.log('[Recorder] Key Pressed:', e.keycode);
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

                if (number) {
                    const currentModifiers = Array.from(pressedKeys).filter(k => MODIFIER_KEYS.has(k));
                    const matchedPage = shortcutConfig.pages.find(page =>
                        areKeysEqual(page.modifierKeys, currentModifiers)
                    );

                    if (matchedPage) {
                        const slot = NUMPAD_TO_SLOT[number];
                        if (slot !== undefined) {
                            mainWindow?.webContents.send('trigger-sound', {
                                pageId: matchedPage.id,
                                slot,
                            });
                        }
                    }
                }
            });

            uIOhook.on('keyup', (e) => {
                pressedKeys.delete(e.keycode);
            });

            uIOhook.start();
            console.log('[Main] Global hooks started');
        } catch (e) {
            console.error('[Main] Failed to start uiohook:', e);
            useFallback = true;
        }
    }

    if (useFallback) {
        console.log('[Main] Using fallback (Electron globalShortcut) shortcuts');
        // The "Wayland detected" notice is only relevant on actual Wayland — not when
        // uiohook merely failed to start on macOS/Windows (e.g. missing permissions).
        if (isWayland) {
            setTimeout(() => {
                mainWindow?.webContents.send('wayland-warning');
            }, 2000);
        }
        registerFallbackShortcuts();
    }
};

// ─── IPC Handlers ────────────────────────────────────────────────────────────

const setupIpcHandlers = () => {
    protocol.handle('sound', async (request) => {
        const reqUrl = new URL(request.url);
        const filePath = decodeURIComponent(reqUrl.pathname.replace(/^\/+/, ''));
        const fullPath = path.join(getSoundsDir(), filePath);
        const fileUrl = `file://${fullPath}`;
        const response = await net.fetch(fileUrl);
        // Chromium (Electron 35+) enforces CORS on fetch() to custom schemes.
        // The renderer page origin differs from the `sound://` scheme, so without
        // an explicit ACAO header WaveSurfer's fetch() fails with "Failed to fetch"
        // (waveform + preview break). Media-element playback is unaffected, which is
        // why only the editor regressed. Re-emit the response with CORS allowed.
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
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

    // Expose the host platform to the renderer so audio routing can adapt.
    ipcMain.handle('get-platform', () => process.platform);

    // Native clipboard write (navigator.clipboard is blocked by our permission handler).
    ipcMain.handle('copy-to-clipboard', (_event, text: string) => {
        clipboard.writeText(String(text ?? ''));
        return true;
    });

    // Open a URL in the user's default browser (e.g. the hismindset website link).
    ipcMain.handle('open-external', (_event, url: string) => {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            shell.openExternal(url);
            return true;
        }
        return false;
    });

    // Linux Virtual Sink + automatic OS-level mic mixing
    ipcMain.handle('create-virtual-sink', async () => {
        if (process.platform !== 'linux') return { success: false, error: 'Not supported on this OS' };
        return await linuxAudio.setupAutoMix();
    });

    ipcMain.on('set-shortcut-config', (_event, config) => {
        shortcutConfig = {
            mode: config.mode || 'numpad',
            pages: config.pages || [],
        };
        console.log('[Shortcuts] Config updated:', shortcutConfig.pages.length, 'pages');
        if (useFallback) {
            registerFallbackShortcuts();
        }
    });

    ipcMain.on('set-remote-pin', (_event, pin: string) => {
        remotePin = typeof pin === 'string' ? pin.trim() : '';
        console.log(`[Remote] PIN ${remotePin ? 'enabled' : 'disabled'}`);
        // Drop the auth state of connected clients so the new policy takes
        // effect immediately (they'll be re-prompted if a PIN is now required).
        wss.clients.forEach((client) => {
            (client as any).hsbAuthed = !remotePin;
            if (remotePin && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'auth-required' }));
            }
        });
    });

    // Key Recording IPC
    ipcMain.on('start-recording-keys', () => {
        console.log('[Recorder] Started recording');
        isRecording = true;
        pressedKeys.clear(); // Reset to avoid stuck keys
        if (useFallback) {
            globalShortcut.unregisterAll();
        }
    });

    ipcMain.on('stop-recording-keys', () => {
        console.log('[Recorder] Stopped recording');
        isRecording = false;
        if (useFallback) {
            registerFallbackShortcuts();
        }
    });

    // Logging Bridge
    ipcMain.on('log', (_event, message) => {
        console.log(message);
    });
};

// ─── App Lifecycle ───────────────────────────────────────────────────────────

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}

app.on('ready', () => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    ensureSoundsDir();
    setupIpcHandlers();
    createWindow();
    buildAppMenu();
    setupGlobalHooks();

    // Linux Specific Startup: create virtual sink + loop the mic into it (OS-level mixing)
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

app.on('will-quit', (event) => {
    uIOhook.stop();
    // Clean up Linux virtual audio modules so we don't leak devices across restarts.
    if (process.platform === 'linux') {
        event.preventDefault();
        linuxAudio.teardown().finally(() => app.exit(0));
    }
});
