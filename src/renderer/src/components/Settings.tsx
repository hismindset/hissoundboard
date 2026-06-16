import React, { useEffect, useState } from 'react';
import { useSoundboardStore } from '../lib/store';
import { AudioSetupWizard } from './AudioSetupWizard';
import { WaylandShortcuts } from './WaylandShortcuts';

const Settings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    // New Audio Settings Slice
    const audioSettings = useSoundboardStore((s) => s.audioSettings);
    const setAudioSettings = useSoundboardStore((s) => s.setAudioSettings);

    // Local state for devices
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]); // New state for mics
    const [showWizard, setShowWizard] = useState(false);
    const [platform, setPlatform] = useState<string>('');

    const customSoundsDir = useSoundboardStore((s) => s.customSoundsDir);
    const setCustomSoundsDir = useSoundboardStore((s) => s.setCustomSoundsDir);
    const shortcutMode = useSoundboardStore((s) => s.shortcutMode);
    const setShortcutMode = useSoundboardStore((s) => s.setShortcutMode);

    const showWaylandWarning = useSoundboardStore((s) => s.showWaylandWarning);
    const setShowWaylandWarning = useSoundboardStore((s) => s.setShowWaylandWarning);

    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [serverUrl, setServerUrl] = useState<string>('');
    const [defaultSoundsDir, setDefaultSoundsDir] = useState<string>('');

    // Load audio output devices AND Input devices
    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then((allDevices) => {
            // Outputs
            const audioOutputs = allDevices.filter(
                (d) => d.kind === 'audiooutput' && d.deviceId
            );
            setDevices(audioOutputs);

            // Inputs (Microphones) - WITH STRICT FILTERING
            const audioInputs = allDevices.filter((d) => {
                const label = d.label.toLowerCase();
                return (
                    d.kind === 'audioinput' &&
                    d.deviceId &&
                    // STRICT LOOP PREVENTION FILTER
                    !label.includes('cable') &&
                    !label.includes('output') &&
                    !label.includes('virtual') &&
                    !label.includes('blackhole')
                    // We might also want to filter "stereo mix" or "what u hear" if common, but distinct enough usually.
                );
            });
            setMicDevices(audioInputs);
        });
    }, []);

    // Load default sounds dir
    useEffect(() => {
        window.api.getSoundsDir().then((dir) => setDefaultSoundsDir(dir));
    }, []);

    // Detect host platform (affects how the microphone is mixed)
    useEffect(() => {
        window.api.getPlatform?.().then((p) => setPlatform(p)).catch(() => { });
    }, []);

    // Generate QR code
    useEffect(() => {
        window.api.getLocalIp().then(({ ip, port }) => {
            const url = `http://${ip}:${port}`;
            setServerUrl(url);
            setQrCodeUrl(
                `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=121712&color=5cae6b`
            );
        });
    }, []);

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

            {showWaylandWarning && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex gap-3 items-start relative">
                    <span className="text-amber-500 mt-0.5">⚠️</span>
                    <div className="flex-1 pr-6">
                        <h4 className="text-amber-500 font-medium text-sm">Wayland detected.</h4>
                        <p className="text-amber-500/80 text-xs mt-1">
                            Advanced shortcuts are limited for security reasons. For full Shortcut support, log in using an X11 session.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowWaylandWarning(false)}
                        className="absolute top-2 right-2 p-2 text-amber-500/60 hover:text-amber-500 transition-colors"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Audio Devices & Volume */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Audio Routing
                </h3>

                {/* Monitor */}
                <div>
                    <label className="block text-xs text-surface-300 mb-1.5">
                        🔊 Monitor Device (Local)
                    </label>
                    <select
                        value={audioSettings.monitorDeviceId}
                        onChange={(e) => setAudioSettings({ monitorDeviceId: e.target.value })}
                        className="w-full px-3 py-2.5 bg-surface-800 border border-surface-600/50 rounded-xl text-sm text-white/90 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
                    >
                        <option value="">Default</option>
                        {devices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-3 mt-2">
                        <button
                            onClick={() => setAudioSettings({ monitorMuted: !audioSettings.monitorMuted })}
                            className={`text-xs w-8 ${audioSettings.monitorMuted ? 'text-red-400' : 'text-surface-400'}`}
                        >
                            {audioSettings.monitorMuted ? 'MUTE' : `${Math.round(audioSettings.monitorVolume * 100)}%`}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(audioSettings.monitorVolume * 100)}
                            onChange={(e) => setAudioSettings({ monitorVolume: Number(e.target.value) / 100 })}
                            className="flex-1 h-1.5 rounded-full appearance-none bg-surface-700 accent-accent cursor-pointer"
                        />
                    </div>
                </div>

                {/* Output Device (Cable) */}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Output Device (To Mic)</label>
                        <button
                            onClick={() => setShowWizard(true)}
                            className="w-5 h-5 rounded-full bg-accent/20 text-accent-light flex items-center justify-center text-xs font-bold hover:bg-accent-light hover:text-white transition-colors"
                            title="Help me setup virtual audio"
                        >
                            ?
                        </button>
                    </div>
                    <select
                        value={audioSettings.outputDeviceId}
                        onChange={(e) => setAudioSettings({ outputDeviceId: e.target.value })}
                        className="w-full px-3 py-2.5 bg-surface-800 border border-surface-600/50 rounded-xl text-sm text-white/90 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
                    >
                        <option value="">Default</option>
                        {devices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-3 mt-2">
                        <button
                            onClick={() => setAudioSettings({ outputMuted: !audioSettings.outputMuted })}
                            className={`text-xs w-8 ${audioSettings.outputMuted ? 'text-red-400' : 'text-surface-400'}`}
                        >
                            {audioSettings.outputMuted ? 'MUTE' : `${Math.round(audioSettings.outputVolume * 100)}%`}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(audioSettings.outputVolume * 100)}
                            onChange={(e) => setAudioSettings({ outputVolume: Number(e.target.value) / 100 })}
                            className="flex-1 h-1.5 rounded-full appearance-none bg-surface-700 accent-accent cursor-pointer"
                        />
                    </div>
                </div>

                {/* Microphone Input */}
                <div className="mb-6 pt-2 border-t border-surface-700/50">
                    <label className="block text-xs text-surface-300 mb-1.5">
                        🎤 Microphone {platform === 'linux' ? 'Mixing' : 'Injection (Passthrough)'}
                    </label>

                    {platform === 'linux' ? (
                        // On Linux the OS (PulseAudio/PipeWire) mixes the default mic into the
                        // virtual sink automatically — no in-app passthrough needed.
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 space-y-1.5">
                            <p className="text-xs text-green-400 font-medium">
                                Automatic OS-level mixing is active.
                            </p>
                            <p className="text-[11px] text-surface-300 leading-relaxed">
                                Your default microphone is mixed into the virtual device automatically.
                                In your voice chat, select <b>“OpenSoundBoard_Mic”</b> as the input
                                microphone — your voice and the sounds come through together, even when
                                no sound is playing.
                            </p>
                        </div>
                    ) : (
                        <>
                            <select
                                value={audioSettings.micDeviceId}
                                onChange={(e) => setAudioSettings({ micDeviceId: e.target.value })}
                                className="w-full px-3 py-2.5 bg-surface-800 border border-surface-600/50 rounded-xl text-sm text-white/90 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
                            >
                                <option value="">None (Disabled)</option>
                                {micDevices.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                                    </option>
                                ))}
                            </select>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs w-8 text-surface-400">
                                    {Math.round(audioSettings.micVolume * 100)}%
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max="200" // 200% as requested
                                    value={Math.round(audioSettings.micVolume * 100)}
                                    onChange={(e) => setAudioSettings({ micVolume: Number(e.target.value) / 100 })}
                                    className="flex-1 h-1.5 rounded-full appearance-none bg-surface-700 accent-accent cursor-pointer"
                                />
                            </div>
                            <p className="text-[10px] text-surface-500 mt-1.5">
                                Select your headset mic here. It is routed to the <b>Output Device</b> (Cable)
                                together with the sounds, so others hear your voice + sounds. You will NOT
                                hear yourself on the Monitor (no feedback). Keep this app running while you talk.
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Sounds Directory */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Location
                </h3>
                <div className="bg-surface-800/60 rounded-xl border border-surface-600/30 p-3 space-y-2">
                    <p className="text-xs text-surface-300">Active Directory:</p>
                    <p className="text-[11px] text-white/70 font-mono break-all bg-surface-900/50 rounded-lg px-2.5 py-1.5">
                        {customSoundsDir || defaultSoundsDir || 'Loading...'}
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customSoundsDir}
                            onChange={(e) => setCustomSoundsDir(e.target.value)}
                            placeholder="Use Default..."
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
                </div>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                    Shortcuts
                </h3>

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

                <div className="text-xs text-surface-400 bg-surface-800/50 p-3 rounded-lg">
                    Page modifiers are now managed in the Page Sidebar.
                </div>
            </div>

            {/* Wayland / KDE global shortcut helper (Linux only) */}
            {platform === 'linux' && <WaylandShortcuts />}

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
                            Scan to connect:
                        </p>
                        <a
                            href={serverUrl}
                            className="text-sm text-accent-light hover:text-accent font-mono break-all transition-colors"
                        >
                            {serverUrl}
                        </a>
                    </div>
                </div>

                {showWizard && <AudioSetupWizard onClose={() => setShowWizard(false)} />}
            </div>
        </div>
    );
};

export default Settings;
