import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import type { Sound, PlaybackMode } from '../types/sound';
import { useSoundboardStore } from '../lib/store';

interface SoundEditorProps {
    soundId: string;
    onClose: () => void;
}

const WAVE_HEIGHT = 120;

const SoundEditor: React.FC<SoundEditorProps> = ({ soundId, onClose }) => {
    const sound = useSoundboardStore((s) => s.library[soundId]);
    const updateSound = useSoundboardStore((s) => s.updateSound);

    const waveformRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionRef = useRef<any>(null);

    const [displayName, setDisplayName] = useState(sound?.displayName || '');
    const [volume, setVolume] = useState(sound?.volume ?? 1.0);
    const [trimStart, setTrimStart] = useState(sound?.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(sound?.trimEnd ?? 0);
    const [fadeIn, setFadeIn] = useState(sound?.fadeIn ?? 0);
    const [fadeOut, setFadeOut] = useState(sound?.fadeOut ?? 0);
    const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(sound?.playbackMode || 'one-shot');
    const [duration, setDuration] = useState(0);
    const [width, setWidth] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Effective region end (0 trimEnd means "play to the end of the file").
    const effectiveEnd = trimEnd > 0 ? trimEnd : duration;
    const regionLength = Math.max(0, effectiveEnd - trimStart);

    // Refs so WaveSurfer event handlers always read the latest values.
    const liveRef = useRef({ volume, trimStart, effectiveEnd, fadeIn, fadeOut });
    liveRef.current = { volume, trimStart, effectiveEnd, fadeIn, fadeOut };

    // ── Volume envelope (fade in/out + clamp) used for the audible preview ──────
    const envelopeFactor = useCallback((t: number) => {
        const { trimStart: s, effectiveEnd: e, fadeIn: fi, fadeOut: fo } = liveRef.current;
        let f = 1;
        if (fi > 0 && t < s + fi) f = Math.min(f, (t - s) / fi);
        if (fo > 0 && t > e - fo) f = Math.min(f, (e - t) / fo);
        return Math.max(0, Math.min(1, f));
    }, []);

    // Initialize WaveSurfer
    useEffect(() => {
        if (!waveformRef.current || !sound) return;

        const regions = RegionsPlugin.create();

        const ws = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: 'rgba(92, 174, 107, 0.35)',
            progressColor: 'rgba(63, 154, 77, 0.9)',
            cursorColor: '#d4a373',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: WAVE_HEIGHT,
            normalize: true,
            backend: 'WebAudio',
            plugins: [regions],
        });

        ws.on('ready', () => {
            const dur = ws.getDuration();
            setDuration(dur);
            setWidth(waveformRef.current?.clientWidth ?? 0);
            setIsReady(true);

            const start = sound.trimStart || 0;
            const end = sound.trimEnd > 0 ? sound.trimEnd : dur;

            const region = regions.addRegion({
                start,
                end,
                color: 'rgba(63, 154, 77, 0.18)',
                drag: true,
                resize: true,
            });

            regionRef.current = region;

            // Track the region live so the fade overlay follows the trim handles.
            const sync = () => {
                setTrimStart(region.start);
                setTrimEnd(region.end);
            };
            region.on('update', sync);
            region.on('update-end', sync);
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));

        // Drive the audible fade preview + stop at the region end.
        ws.on('timeupdate', (t: number) => {
            if (!wavesurferRef.current) return;
            const { volume: vol, trimStart: s, effectiveEnd: e } = liveRef.current;
            if (t >= e) {
                ws.pause();
                ws.setTime(s);
                return;
            }
            ws.setVolume(Math.min(1, vol) * envelopeFactor(t));
        });

        ws.load(sound.filePath);
        wavesurferRef.current = ws;

        const onResize = () => setWidth(waveformRef.current?.clientWidth ?? 0);
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            ws.destroy();
            wavesurferRef.current = null;
        };
    }, [sound?.filePath]);

    const handlePreview = useCallback(() => {
        const ws = wavesurferRef.current;
        if (!ws) return;

        if (isPlaying) {
            ws.pause();
        } else {
            ws.setVolume(Math.min(1, volume) * envelopeFactor(trimStart));
            ws.setTime(trimStart);
            ws.play();
        }
    }, [isPlaying, volume, trimStart, envelopeFactor]);

    const handleSave = useCallback(() => {
        updateSound(soundId, {
            displayName,
            volume,
            trimStart,
            trimEnd: trimEnd >= duration ? 0 : trimEnd, // 0 means "end of file"
            fadeIn,
            fadeOut,
            playbackMode,
        });
        onClose();
    }, [soundId, displayName, volume, trimStart, trimEnd, fadeIn, fadeOut, playbackMode, duration, updateSound, onClose]);

    // ── Fade handle dragging ───────────────────────────────────────────────────
    const dragRef = useRef<null | 'in' | 'out'>(null);

    const onHandleDown = useCallback((which: 'in' | 'out') => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Capture so the drag stays with the handle even though WaveSurfer's
        // region resize grips sit directly underneath the corners.
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
        dragRef.current = which;
    }, []);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const which = dragRef.current;
            if (!which || !waveformRef.current || duration <= 0) return;
            const rect = waveformRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const t = (x / rect.width) * duration;
            const maxLen = Math.max(0, effectiveEnd - trimStart);
            if (which === 'in') {
                const len = Math.max(0, Math.min(t - trimStart, maxLen - fadeOut));
                setFadeIn(Number(len.toFixed(3)));
            } else {
                const len = Math.max(0, Math.min(effectiveEnd - t, maxLen - fadeIn));
                setFadeOut(Number(len.toFixed(3)));
            }
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [duration, trimStart, effectiveEnd, fadeIn, fadeOut]);

    if (!sound) return null;

    // Pixel mapping for the fade overlay (seconds → px across the waveform).
    const px = (t: number) => (duration > 0 ? (t / duration) * width : 0);
    const startX = px(trimStart);
    const endX = px(effectiveEnd);
    const fadeInX = px(trimStart + fadeIn);
    const fadeOutX = px(effectiveEnd - fadeOut);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-2xl mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700/40">
                    <h2 className="text-lg font-bold text-white/90 flex items-center gap-2">
                        <svg className="w-5 h-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                        Sound Editor
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-5">
                    {/* Display Name */}
                    <div>
                        <label className="block text-xs text-surface-300 mb-1.5">Display Name</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full px-3 py-2 bg-surface-800 border border-surface-600/50 rounded-xl text-sm text-white/90 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
                        />
                    </div>

                    {/* Waveform */}
                    <div>
                        <label className="block text-xs text-surface-300 mb-1.5">
                            Waveform
                            {isReady && (
                                <span className="text-surface-500 ml-2">
                                    ({duration.toFixed(1)}s)
                                </span>
                            )}
                            <span className="text-surface-500 ml-2">— drag the top corners to fade</span>
                        </label>
                        <div className="bg-surface-800/60 border border-surface-600/30 rounded-xl p-3 overflow-hidden">
                            <div ref={wrapperRef} className="relative w-full" style={{ height: WAVE_HEIGHT }}>
                                <div ref={waveformRef} className="w-full" />

                                {/* Fade overlay (DaVinci-Resolve style corner handles) */}
                                {isReady && width > 0 && (
                                    <>
                                        <svg
                                            className="absolute top-0 left-0 pointer-events-none"
                                            width={width}
                                            height={WAVE_HEIGHT}
                                        >
                                            {fadeIn > 0 && (
                                                <>
                                                    <polygon
                                                        points={`${startX},0 ${fadeInX},0 ${startX},${WAVE_HEIGHT}`}
                                                        fill="rgba(13,14,31,0.55)"
                                                    />
                                                    <line
                                                        x1={startX} y1={WAVE_HEIGHT} x2={fadeInX} y2={0}
                                                        stroke="#d4a373" strokeWidth={1.5}
                                                    />
                                                </>
                                            )}
                                            {fadeOut > 0 && (
                                                <>
                                                    <polygon
                                                        points={`${fadeOutX},0 ${endX},0 ${endX},${WAVE_HEIGHT}`}
                                                        fill="rgba(13,14,31,0.55)"
                                                    />
                                                    <line
                                                        x1={fadeOutX} y1={0} x2={endX} y2={WAVE_HEIGHT}
                                                        stroke="#d4a373" strokeWidth={1.5}
                                                    />
                                                </>
                                            )}
                                        </svg>

                                        {/* Fade-in handle */}
                                        <div
                                            onPointerDown={onHandleDown('in')}
                                            title={`Fade In: ${fadeIn.toFixed(2)}s`}
                                            className="absolute -top-1 w-3.5 h-3.5 rounded-full bg-[#d4a373] border-2 border-surface-900 shadow cursor-ew-resize hover:scale-125 transition-transform touch-none"
                                            style={{ left: fadeInX - 7, zIndex: 10 }}
                                        />
                                        {/* Fade-out handle */}
                                        <div
                                            onPointerDown={onHandleDown('out')}
                                            title={`Fade Out: ${fadeOut.toFixed(2)}s`}
                                            className="absolute -top-1 w-3.5 h-3.5 rounded-full bg-[#d4a373] border-2 border-surface-900 shadow cursor-ew-resize hover:scale-125 transition-transform touch-none"
                                            style={{ left: fadeOutX - 7, zIndex: 10 }}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                        {isReady && (
                            <div className="flex items-center justify-between mt-1.5 text-[10px] text-surface-400">
                                <span>Trim: {trimStart.toFixed(2)}s – {effectiveEnd.toFixed(2)}s</span>
                                <span>Fade ▸ {fadeIn.toFixed(2)}s · ◂ {fadeOut.toFixed(2)}s</span>
                                <span>Region: {regionLength.toFixed(2)}s</span>
                            </div>
                        )}
                    </div>

                    {/* Controls Row */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Volume */}
                        <div>
                            <label className="block text-xs text-surface-300 mb-1.5">
                                Volume
                                <span className="text-accent-light ml-1 font-mono text-[11px]">
                                    {Math.round(volume * 100)}%
                                </span>
                            </label>
                            <input
                                type="range"
                                min={0}
                                max={200}
                                value={volume * 100}
                                onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
                                className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                            <div className="flex justify-between text-[9px] text-surface-500 mt-0.5">
                                <span>0%</span>
                                <span>100%</span>
                                <span>200%</span>
                            </div>
                        </div>

                        {/* Playback Mode */}
                        <div>
                            <label className="block text-xs text-surface-300 mb-1.5">Playback Mode</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPlaybackMode('one-shot')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${playbackMode === 'one-shot'
                                        ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                                        : 'bg-surface-800 text-surface-400 border border-surface-600/30 hover:text-surface-200'
                                        }`}
                                >
                                    One-Shot
                                </button>
                                <button
                                    onClick={() => setPlaybackMode('loop')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${playbackMode === 'loop'
                                        ? 'bg-accent/20 text-accent-light border border-accent/30'
                                        : 'bg-surface-800 text-surface-400 border border-surface-600/30 hover:text-surface-200'
                                        }`}
                                >
                                    Loop
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Fade sliders (precise control, mirror the corner handles) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-surface-300 mb-1.5">
                                Fade In
                                <span className="text-accent-light ml-1 font-mono text-[11px]">{fadeIn.toFixed(2)}s</span>
                            </label>
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0.01, regionLength)}
                                step={0.01}
                                value={Math.min(fadeIn, regionLength)}
                                disabled={!isReady}
                                onChange={(e) => setFadeIn(Math.min(parseFloat(e.target.value), regionLength - fadeOut))}
                                className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-accent disabled:opacity-40"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-surface-300 mb-1.5">
                                Fade Out
                                <span className="text-accent-light ml-1 font-mono text-[11px]">{fadeOut.toFixed(2)}s</span>
                            </label>
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0.01, regionLength)}
                                step={0.01}
                                value={Math.min(fadeOut, regionLength)}
                                disabled={!isReady}
                                onChange={(e) => setFadeOut(Math.min(parseFloat(e.target.value), regionLength - fadeIn))}
                                className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-accent disabled:opacity-40"
                            />
                        </div>
                    </div>

                    {/* Preview button */}
                    <button
                        onClick={handlePreview}
                        disabled={!isReady}
                        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isPlaying
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-surface-700 text-surface-200 border border-surface-600/30 hover:bg-surface-600 hover:text-white'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                        {isPlaying ? '⏸ Stop Preview' : '▶ Preview'}
                    </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-surface-700/40">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent-dark hover:shadow-glow-purple transition-all duration-200"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SoundEditor;
