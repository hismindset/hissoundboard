import { app, BrowserWindow, ipcMain, protocol, net, session, globalShortcut, clipboard, shell, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import os from 'os';
import { uIOhook, UiohookKey } from 'uiohook-napi';
// @ts-ignore
import squirrelStartup from 'electron-squirrel-startup';
import { LinuxAudioManager } from './LinuxAudioManager';
import { configStore } from './configStore';
import { initUpdater } from './updater';
import type { PersistedPayload, ApplyFolderAction } from '../shared/sync-types';

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

// Guard against "Object has been destroyed" crashes: uIOhook keeps firing on
// the JS event loop after the window (or the app) is gone, and
// mainWindow?.webContents.send() then throws because `webContents` itself is
// the destroyed object (optional chaining doesn't help here). Use this for
// every send() from a long-lived hook (uiohook, globalShortcut, web server).
const safeSendToRenderer = (channel: string, payload?: unknown) => {
    if (!mainWindow) return;
    if (mainWindow.isDestroyed()) return;
    const wc = mainWindow.webContents;
    if (wc.isDestroyed()) return;
    wc.send(channel, payload);
};

// Sounds directory: delegated to configStore, which resolves it from
// sync-settings.json (<syncRoot>/sounds, or the legacy custom dir).
const getSoundsDir = () => configStore.getSoundsDir();

const ensureSoundsDir = () => {
    const dir = getSoundsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

type DownloadedSound = {
    filePath: string;
    originalName: string;
};

const AUDIO_FILE_EXTENSION = /\.(?:mp3|m4a|wav|ogg|aac|flac)$/i;

/** Myinstants links point to a sound-page, while the downloadable asset lives
 *  below /media/sounds/. Resolve the page in the trusted main process so the
 *  renderer never has to scrape a cross-origin site. */
const resolveDownloadUrl = async (input: string): Promise<URL> => {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        throw new Error('Enter a valid HTTP(S) URL.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Only HTTP(S) URLs can be downloaded.');
    }

    const isMyinstants = /(^|\.)myinstants\.com$/i.test(url.hostname);
    if (!isMyinstants || url.pathname.startsWith('/media/sounds/')) return url;

    const page = await net.fetch(url.toString(), { redirect: 'follow' });
    if (!page.ok) throw new Error(`Myinstants page could not be loaded (${page.status}).`);

    const html = await page.text();
    const audioMatch = html.match(/(?:href|src)=["']([^"']*\/media\/sounds\/[^"']+\.(?:mp3|m4a|wav|ogg|aac|flac)(?:\?[^"']*)?)["']/i);
    if (!audioMatch) throw new Error('No downloadable audio file was found on this Myinstants page.');

    return new URL(audioMatch[1].replace(/&amp;/g, '&'), page.url);
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

    // One-shot notice: config.json had to be recovered from its .bak backup
    // during configStore.init(). Sent on 'did-finish-load' (rather than right
    // after creation) so the renderer's IPC listener is already mounted.
    mainWindow.webContents.on('did-finish-load', () => {
        if (configStore.wasCorruptRecovered()) {
            mainWindow.webContents.send('sync-recovered-from-backup');
        }
    });

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

// Start watching config.json for changes made outside this app (another
// device, a sync client) and push them live into the renderer (config-sync
// WP4). Started once here, after createWindow() so mainWindow exists by the
// time the debounced watcher callback ever fires; restarted internally by
// configStore whenever applyFolder() switches the sync root.
const startConfigWatcher = () => {
    configStore.startWatcher({
        onExternalUpdate: (synced) => mainWindow?.webContents.send('state:external-update', synced),
        onNewerVersion: () => mainWindow?.webContents.send('sync-newer-version'),
    });
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

// The remote is deliberately opt-in and always PIN protected. The renderer
// keeps this value in the synced config; this process only holds the active
// value required to authenticate HTTP and WebSocket clients.
let remotePin = '';
let remoteServerRunning = false;

const hasValidRemotePin = () => remotePin.length >= 4;

const getRemoteServerStatus = () => ({
    running: remoteServerRunning,
    pinConfigured: hasValidRemotePin(),
});

const startRemoteServer = (): Promise<{ ok: boolean; error?: string }> => {
    if (remoteServerRunning) return Promise.resolve({ ok: true });
    if (!hasValidRemotePin()) {
        return Promise.resolve({ ok: false, error: 'Set a PIN with at least 4 characters before starting the web server.' });
    }

    return new Promise((resolve) => {
        const handleError = (error: Error) => {
            server.off('listening', handleListening);
            remoteServerRunning = false;
            console.error('[Remote] Failed to start server:', error);
            resolve({ ok: false, error: error.message });
        };
        const handleListening = () => {
            server.off('error', handleError);
            remoteServerRunning = true;
            console.log(`Remote control server running on http://${getLocalIp()}:${SERVER_PORT}`);
            resolve({ ok: true });
        };

        server.once('error', handleError);
        server.once('listening', handleListening);
        server.listen(SERVER_PORT, '0.0.0.0');
    });
};

const stopRemoteServer = (): Promise<void> => {
    if (!remoteServerRunning) return Promise.resolve();

    // Close live connections first, otherwise http.Server#close waits for the
    // remote browser to disconnect before the settings change takes effect.
    wss.clients.forEach((client) => client.terminate());
    remoteServerRunning = false;
    return new Promise((resolve) => {
        server.close(() => {
            console.log('[Remote] Web server stopped.');
            resolve();
        });
    });
};

const isAuthed = (ws: WebSocket) => (ws as any).hsbAuthed === true;

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
    (ws as any).hsbAuthed = false;
    // The remote always asks for the PIN before it can see the board.
    ws.send(JSON.stringify({ type: 'auth-required' }));

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
                    safeSendToRenderer('panic-stop');
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

// Guard the HTTP control endpoints with the mandatory PIN. External tools
// (Stream Deck, Wayland shortcuts) pass it as ?pin=….
const httpPinOk = (req: express.Request, res: express.Response): boolean => {
    if (hasValidRemotePin() && req.query.pin === remotePin) return true;
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
    safeSendToRenderer('panic-stop');
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
        // Panic key: Cmd/Ctrl + 0 (Numpad 0 in numpad-mode, top-row 0 in standard-mode).
        // A bare 0 would fire whenever someone types a zero somewhere; Escape used to
        // be the panic key but collides with games / menus / fullscreen apps.
        // `CommandOrControl` resolves to Cmd on macOS and Ctrl on Win/Linux.
        const panicKey = shortcutConfig.mode === 'numpad'
            ? 'CommandOrControl+num0'
            : 'CommandOrControl+0';
        globalShortcut.register(panicKey, () => {
            safeSendToRenderer('panic-stop');
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

                // Panic Stop: Cmd/Ctrl + 0 (Numpad 0 in numpad-mode, top-row 0 in
                // standard-mode). A pure `0` would fire whenever someone types a
                // zero somewhere, so we require a modifier. Escape was the original
                // key but collides with games/menus/fullscreen apps. Use
                // isDestroyed()-safe sender to avoid the "Object has been destroyed"
                // crash if the window is already gone.
                const panicKeycode = shortcutConfig.mode === 'numpad'
                    ? UiohookKey.Numpad0
                    : UiohookKey['0'];
                if (e.keycode === panicKeycode) {
                    const hasCmdOrCtrl = [UiohookKey.Ctrl, UiohookKey.CtrlRight,
                                          UiohookKey.Meta, UiohookKey.MetaRight]
                        .some(k => pressedKeys.has(k));
                    if (hasCmdOrCtrl) {
                        console.log('[Shortcut] Panic Stop Triggered');
                        safeSendToRenderer('panic-stop');
                        return;
                    }
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
        const soundsDir = path.resolve(getSoundsDir());
        const fullPath = path.resolve(soundsDir, filePath);
        // Reject any path that escapes the sounds directory (e.g. via ../ sequences),
        // so a crafted sound:// URL can't be used to read arbitrary files on disk.
        if (fullPath !== soundsDir && !fullPath.startsWith(soundsDir + path.sep)) {
            return new Response('Forbidden', { status: 403 });
        }
        // Config sync can deliver config.json before the referenced sound file has
        // finished downloading on this machine; treat a missing file as a plain 404
        // instead of letting the net.fetch() rejection bubble up as an unhandled error.
        if (!fs.existsSync(fullPath)) {
            return new Response('Not Found', { status: 404 });
        }
        const fileUrl = `file://${fullPath}`;
        try {
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
        } catch (e) {
            console.error('[Main] Failed to fetch sound file:', e);
            return new Response('Not Found', { status: 404 });
        }
    });

    ipcMain.handle(
        'save-sound-file',
        async (_event, sourcePath: string, fileName: string) => {
            ensureSoundsDir();
            const soundsDir = getSoundsDir();
            if (path.dirname(sourcePath) !== soundsDir) {
                // Avoid clobbering an existing file with the same name: if the
                // destination is taken, append " (2)", " (3)", etc. until a free
                // name is found, and copy the source under that name instead.
                const { name, ext } = path.parse(fileName);
                let candidateName = fileName;
                let destPath = path.join(soundsDir, candidateName);
                let counter = 2;
                while (fs.existsSync(destPath)) {
                    candidateName = `${name} (${counter})${ext}`;
                    destPath = path.join(soundsDir, candidateName);
                    counter++;
                }
                fs.copyFileSync(sourcePath, destPath);
                return `sound://play/${encodeURIComponent(candidateName)}`;
            }
            return `sound://play/${encodeURIComponent(fileName)}`;
        }
    );

    ipcMain.handle('get-local-ip', () => {
        return { ip: getLocalIp(), port: SERVER_PORT };
    });

    ipcMain.handle('download-url', async (_event, url: string): Promise<DownloadedSound> => {
        ensureSoundsDir();
        const sourceUrl = await resolveDownloadUrl(url);
        const response = await net.fetch(sourceUrl.toString(), { redirect: 'follow' });
        if (!response.ok) throw new Error(`Download failed (${response.status}).`);

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('audio/') && !AUDIO_FILE_EXTENSION.test(sourceUrl.pathname)) {
            throw new Error('The URL did not return an audio file.');
        }

        const audioData = Buffer.from(await response.arrayBuffer());
        if (audioData.length === 0) throw new Error('The downloaded audio file is empty.');

        const originalName = path.basename(decodeURIComponent(sourceUrl.pathname)) || 'Downloaded Sound.mp3';
        const extension = path.extname(originalName) || '.mp3';
        const fileName = `download_${Date.now()}${extension}`;
        fs.writeFileSync(path.join(getSoundsDir(), fileName), audioData);

        return {
            filePath: `sound://play/${encodeURIComponent(fileName)}`,
            originalName,
        };
    });

    ipcMain.on('sounds-for-remote', (_event, sounds) => {
        broadcast({ type: 'sounds-update', sounds });
    });

    ipcMain.handle('get-sounds-dir', () => {
        ensureSoundsDir();
        return getSoundsDir();
    });

    // ─── Persisted State (config-sync) ───────────────────────────────────
    // Renderer hydrates synchronously from main on startup (store.ts's
    // storage adapter), and pushes debounced updates back.
    ipcMain.on('state:get-initial', (event) => {
        event.returnValue = configStore.getInitialPersistedPayload();
    });

    ipcMain.on('state:persist', (_event, payload: PersistedPayload) => {
        configStore.persistFromRenderer(payload);
    });

    ipcMain.on('sync:set-legacy-sounds-dir', (_event, dir: string) => {
        configStore.setLegacySoundsDir(dir);
    });

    // ─── Folder selection (config-sync WP2) ───────────────────────────────
    ipcMain.handle('sync:get-status', () => configStore.getStatus());

    ipcMain.handle('sync:pick-folder', () => configStore.pickFolder(mainWindow!));

    ipcMain.handle('sync:apply-folder', (_event, folder: string, action: ApplyFolderAction) =>
        configStore.applyFolder(folder, action)
    );

    ipcMain.handle('sync:open-folder', () => shell.openPath(configStore.getSyncRoot()));

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

    // Linux: toggle the OS-level mic loopback. While a voice effect is active
    // the renderer routes the mic through its own audio graph instead, so the
    // loopback must be off — otherwise the voice would be doubled.
    ipcMain.handle('set-mic-loopback', async (_event, enabled: boolean) => {
        if (process.platform !== 'linux') return { success: true };
        return enabled
            ? await linuxAudio.createMicLoopback()
            : await linuxAudio.unloadMicLoopback();
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

    ipcMain.handle('remote-server:get-status', () => getRemoteServerStatus());

    ipcMain.handle('remote-server:configure', (_event, pin: string) => {
        const nextPin = typeof pin === 'string' ? pin.trim() : '';
        // A PIN can be changed, but never removed. This also rejects short
        // values so a malformed synced config cannot weaken the server.
        if (nextPin && nextPin.length < 4) {
            return { ok: false, error: 'The PIN must contain at least 4 characters.' };
        }
        if (!nextPin && remotePin) {
            return { ok: false, error: 'The PIN cannot be removed once it has been set.' };
        }
        remotePin = nextPin;
        console.log(`[Remote] PIN ${remotePin ? 'configured' : 'not configured'}`);
        // Drop the auth state of connected clients so a changed PIN takes
        // effect immediately.
        wss.clients.forEach((client) => {
            (client as any).hsbAuthed = false;
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'auth-required' }));
            }
        });
        return { ok: true };
    });

    ipcMain.handle('remote-server:start', () => startRemoteServer());
    ipcMain.handle('remote-server:stop', async () => {
        await stopRemoteServer();
        return { ok: true };
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

    // Load sync-settings.json / config.json / local-settings.json before the
    // window is created, so getSoundsDir() and initial hydration are correct
    // from the very first frame.
    configStore.init();

    // The server remains off unless the synced startup preference explicitly
    // requests it and its mandatory PIN is valid. It starts before the window
    // has finished rendering, so the remote is ready as soon as the app is.
    const initialRemoteSettings = configStore.getInitialPersistedPayload()?.state;
    remotePin = initialRemoteSettings?.remotePin?.trim() ?? '';

    ensureSoundsDir();
    setupIpcHandlers();
    createWindow();
    initUpdater(() => mainWindow);
    startConfigWatcher();
    buildAppMenu();
    setupGlobalHooks();

    // Linux Specific Startup: create virtual sink + loop the mic into it (OS-level mixing)
    linuxAudio.ensureAudioSink();

    if (initialRemoteSettings?.webServerAutoStart && hasValidRemotePin()) {
        void startRemoteServer();
    }
});

app.on('window-all-closed', () => {
    uIOhook.stop();
    void stopRemoteServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    configStore.flushSync();
    configStore.stopWatcher();
});

app.on('will-quit', (event) => {
    uIOhook.stop();
    // Clean up Linux virtual audio modules so we don't leak devices across restarts.
    if (process.platform === 'linux') {
        event.preventDefault();
        linuxAudio.teardown().finally(() => app.exit(0));
    }
});
