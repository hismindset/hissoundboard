import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import type { Sound, PlaybackMode } from '../types/sound';
import { useSoundboardStore } from '../lib/store';

interface SoundEditorProps {
    soundId: string;
    onClose: () => void;
}

const SoundEditor: React.FC<SoundEditorProps> = ({ soundId, onClose }) => {
    const sound = useSoundboardStore((s) => s.library[soundId]);
    const updateSound = useSoundboardStore((s) => s.updateSound);

    const waveformRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionRef = useRef<any>(null);

    const [displayName, setDisplayName] = useState(sound?.displayName || '');
    const [volume, setVolume] = useState(sound?.volume ?? 1.0);
    const [trimStart, setTrimStart] = useState(sound?.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(sound?.trimEnd ?? 0);
    const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(sound?.playbackMode || 'one-shot');
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Initialize WaveSurfer
    useEffect(() => {
        if (!waveformRef.current || !sound) return;

        const regions = RegionsPlugin.create();

        const ws = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: 'rgba(139, 92, 246, 0.4)',
            progressColor: 'rgba(139, 92, 246, 0.8)',
            cursorColor: '#a78bfa',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 120,
            normalize: true,
            backend: 'WebAudio',
            plugins: [regions],
        });

        ws.on('ready', () => {
            const dur = ws.getDuration();
            setDuration(dur);
            setIsReady(true);

            // Create trim region
            const start = sound.trimStart || 0;
            const end = sound.trimEnd > 0 ? sound.trimEnd : dur;

            const region = regions.addRegion({
                start,
                end,
                color: 'rgba(139, 92, 246, 0.15)',
                drag: true,
                resize: true,
            });

            regionRef.current = region;

            region.on('update-end', () => {
                setTrimStart(region.start);
                setTrimEnd(region.end);
            });
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));

        ws.load(sound.filePath);
        wavesurferRef.current = ws;

        return () => {
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
            ws.setVolume(Math.min(1, volume));
            if (trimStart > 0) {
                ws.seekTo(trimStart / duration);
            }
            ws.play();
        }
    }, [isPlaying, volume, trimStart, duration]);

    const handleSave = useCallback(() => {
        updateSound(soundId, {
            displayName,
            volume,
            trimStart,
            trimEnd: trimEnd >= duration ? 0 : trimEnd, // 0 means "end of file"
            playbackMode,
        });
        onClose();
    }, [soundId, displayName, volume, trimStart, trimEnd, playbackMode, duration, updateSound, onClose]);

    if (!sound) return null;

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
                        </label>
                        <div className="bg-surface-800/60 border border-surface-600/30 rounded-xl p-3 overflow-hidden">
                            <div ref={waveformRef} className="w-full" />
                        </div>
                        {isReady && (
                            <div className="flex items-center justify-between mt-1.5 text-[10px] text-surface-400">
                                <span>Trim: {trimStart.toFixed(2)}s – {(trimEnd || duration).toFixed(2)}s</span>
                                <span>Region: {((trimEnd || duration) - trimStart).toFixed(2)}s</span>
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
                                        ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30'
                                        : 'bg-surface-800 text-surface-400 border border-surface-600/30 hover:text-surface-200'
                                        }`}
                                >
                                    Loop
                                </button>
                            </div>
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
