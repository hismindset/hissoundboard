import React, { useEffect, useState, useCallback } from 'react';
import { useSoundboardStore } from '../lib/store';

const Settings: React.FC = () => {
    const monitorDeviceId = useSoundboardStore((s) => s.monitorDeviceId);
    const outputDeviceId = useSoundboardStore((s) => s.outputDeviceId);
    const monitorVolume = useSoundboardStore((s) => s.monitorVolume);
    const outputVolume = useSoundboardStore((s) => s.outputVolume);
    const customSoundsDir = useSoundboardStore((s) => s.customSoundsDir);
    const setMonitorDevice = useSoundboardStore((s) => s.setMonitorDevice);
    const setOutputDevice = useSoundboardStore((s) => s.setOutputDevice);
    const setMonitorVolume = useSoundboardStore((s) => s.setMonitorVolume);
    const setOutputVolume = useSoundboardStore((s) => s.setOutputVolume);
    const setCustomSoundsDir = useSoundboardStore((s) => s.setCustomSoundsDir);
    const shortcutMode = useSoundboardStore((s) => s.shortcutMode);
    const setShortcutMode = useSoundboardStore((s) => s.setShortcutMode);
    const pageModifiers = useSoundboardStore((s) => s.pageModifiers);
    const setPageModifier = useSoundboardStore((s) => s.setPageModifier);

    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [serverUrl, setServerUrl] = useState<string>('');
    const [defaultSoundsDir, setDefaultSoundsDir] = useState<string>('');

    // Load audio output devices
    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then((allDevices) => {
            const audioOutputs = allDevices.filter(
                (d) => d.kind === 'audiooutput' && d.deviceId
            );
            setDevices(audioOutputs);
        });
    }, []);

    // Load default sounds dir
    useEffect(() => {
        window.api.getSoundsDir().then((dir) => setDefaultSoundsDir(dir));
    }, []);

    // Generate QR code
    useEffect(() => {
        window.api.getLocalIp().then(({ ip, port }) => {
            const url = `http://${ip}:${port}`;
            setServerUrl(url);
            setQrCodeUrl(
                `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=0d0e1f&color=a78bfa`
            );
        });
    }, []);

    const sendShortcutConfig = useCallback(() => {
        window.api.setShortcutConfig?.({
            mode: shortcutMode,
            pageModifiers,
        });
    }, [shortcutMode, pageModifiers]);

    useEffect(() => {
        sendShortcutConfig();
    }, [sendShortcutConfig]);

    // Sync custom sounds dir to main process
    useEffect(() => {
        window.api.setSoundsDir(customSoundsDir);
    }, [customSoundsDir]);

    return (
        <div className="w-full max-w-md space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-white/90 flex items-center gap-2">
                <svg className="w-5 h-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Settings
            </h2>

            {/* Audio Devices & Volume */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Audio Routing
                </h3>

                {/* Monitor */}
                <div>
                    <label className="block text-xs text-surface-300 mb-1.5">
                        🔊 Monitor Device (Lokale Lautsprecher)
                    </label>
                    <select
                        value={monitorDeviceId}
                        onChange={(e) => setMonitorDevice(e.target.value)}
                        className="w-full px-3 py-2.5 bg-surface-800 border border-surface-600/50 rounded-xl text-sm text-white/90 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
                    >
                        <option value="">Standard</option>
                        {devices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-surface-400 w-8">
                            {Math.round(monitorVolume * 100)}%
                        </span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(monitorVolume * 100)}
                            onChange={(e) => setMonitorVolume(Number(e.target.value) / 100)}
                            className="flex-1 h-1.5 rounded-full appearance-none bg-surface-700 accent-accent cursor-pointer"
                        />
                    </div>
                </div>

                {/* Output */}
                <div>
                    <label className="block text-xs text-surface-300 mb-1.5">
                        🎧 Output Device (Virtuelles Kabel / Voicechat)
                    </label>
                    <select
                        value={outputDeviceId}
                        onChange={(e) => setOutputDevice(e.target.value)}
                        className="w-full px-3 py-2.5 bg-surface-800 border border-surface-600/50 rounded-xl text-sm text-white/90 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
                    >
                        <option value="">Standard</option>
                        {devices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-surface-400 w-8">
                            {Math.round(outputVolume * 100)}%
                        </span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(outputVolume * 100)}
                            onChange={(e) => setOutputVolume(Number(e.target.value) / 100)}
                            className="flex-1 h-1.5 rounded-full appearance-none bg-surface-700 accent-accent cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Sounds Directory */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Speicherort
                </h3>
                <div className="bg-surface-800/60 rounded-xl border border-surface-600/30 p-3 space-y-2">
                    <p className="text-xs text-surface-300">Aktiver Ordner:</p>
                    <p className="text-[11px] text-white/70 font-mono break-all bg-surface-900/50 rounded-lg px-2.5 py-1.5">
                        {customSoundsDir || defaultSoundsDir || 'Lädt...'}
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customSoundsDir}
                            onChange={(e) => setCustomSoundsDir(e.target.value)}
                            placeholder="Standard verwenden..."
                            className="flex-1 px-2.5 py-1.5 bg-surface-800 border border-surface-600/40 rounded-lg text-xs text-white/90 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
                        />
                        {customSoundsDir && (
                            <button
                                onClick={() => setCustomSoundsDir('')}
                                className="px-3 py-1.5 rounded-lg text-[10px] text-surface-400 hover:text-white bg-surface-700/60 hover:bg-surface-700 transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                    <p className="text-[10px] text-surface-500">
                        Leer lassen = Standard ({defaultSoundsDir})
                    </p>
                </div>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Shortcuts
                </h3>

                {/* Mode Toggle */}
                <div>
                    <label className="block text-xs text-surface-300 mb-2">
                        Key Mode
                    </label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShortcutMode('numpad')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${shortcutMode === 'numpad'
                                ? 'bg-accent/20 text-accent-light border border-accent/30'
                                : 'bg-surface-800 text-surface-400 border border-surface-600/30 hover:text-surface-200'
                                }`}
                        >
                            ⌨ Numpad
                        </button>
                        <button
                            onClick={() => setShortcutMode('standard')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${shortcutMode === 'standard'
                                ? 'bg-accent/20 text-accent-light border border-accent/30'
                                : 'bg-surface-800 text-surface-400 border border-surface-600/30 hover:text-surface-200'
                                }`}
                        >
                            🔢 Standard (1-9)
                        </button>
                    </div>
                </div>

                {/* Per-Page Modifiers */}
                <div>
                    <label className="block text-xs text-surface-300 mb-2">
                        Seiten-Modifikatoren
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 10 }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="text-[10px] text-surface-400 w-10">
                                    Seite {i + 1}
                                </span>
                                <select
                                    value={pageModifiers[i] || 'Ctrl'}
                                    onChange={(e) => setPageModifier(i, e.target.value)}
                                    className="flex-1 px-2 py-1.5 bg-surface-800 border border-surface-600/40 rounded-lg text-xs text-white/90 focus:outline-none focus:border-accent/50 transition-colors"
                                >
                                    <option value="Ctrl">Ctrl</option>
                                    <option value="RCtrl">Right Ctrl</option>
                                    <option value="Alt">Alt</option>
                                    <option value="Shift">Shift</option>
                                    <option value="Ctrl+Alt">Ctrl+Alt</option>
                                    <option value="Ctrl+Shift">Ctrl+Shift</option>
                                    <option value="Alt+Shift">Alt+Shift</option>
                                    <option value="Meta">Meta (⌘/Win)</option>
                                </select>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Reference */}
                <div className="grid grid-cols-2 gap-2 text-xs text-surface-300">
                    <div className="flex items-center gap-2">
                        <kbd className="px-1.5 py-0.5 bg-surface-700 rounded text-surface-200 font-mono text-[10px]">
                            ESC
                        </kbd>
                        <span>Panic Stop</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-1.5 py-0.5 bg-surface-700 rounded text-surface-200 font-mono text-[10px]">
                            Rechtsklick
                        </kbd>
                        <span>Sound Editor</span>
                    </div>
                </div>
            </div>

            {/* Remote Control */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Remote Control
                </h3>
                <div className="flex items-start gap-4 p-4 bg-surface-800/60 rounded-xl border border-surface-600/30">
                    {qrCodeUrl && (
                        <img
                            src={qrCodeUrl}
                            alt="QR Code"
                            className="w-28 h-28 rounded-lg"
                        />
                    )}
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-surface-300">
                            Scanne den QR-Code mit deinem Handy oder öffne:
                        </p>
                        <a
                            href={serverUrl}
                            className="text-sm text-accent-light hover:text-accent font-mono break-all transition-colors"
                        >
                            {serverUrl}
                        </a>
                        <p className="text-[10px] text-surface-400">
                            Beide Geräte müssen im selben Netzwerk sein.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
