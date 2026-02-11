import React, { useCallback } from 'react';
import type { Sound } from '../types/sound';
import { useSoundboardStore } from '../lib/store';
import { audioController } from '../lib/audioController';

interface SoundCellProps {
    page: number;
    slot: number;
    numpadLabel: number;
}

const SoundCell: React.FC<SoundCellProps> = ({ page, slot, numpadLabel }) => {
    const sound = useSoundboardStore(
        (s) => s.sounds[`${page}-${slot}`] as Sound | undefined
    );
    const isActive = useSoundboardStore((s) => s.activeSounds.has(`${page}-${slot}`));
    const monitorDeviceId = useSoundboardStore((s) => s.monitorDeviceId);
    const outputDeviceId = useSoundboardStore((s) => s.outputDeviceId);
    const addSound = useSoundboardStore((s) => s.addSound);
    const setPlaybackMode = useSoundboardStore((s) => s.setPlaybackMode);
    const setActive = useSoundboardStore((s) => s.setActive);
    const setInactive = useSoundboardStore((s) => s.setInactive);

    const handleClick = useCallback(async () => {
        if (!sound) return;

        const soundId = `${page}-${slot}`;

        if (sound.playbackMode === 'loop') {
            const started = await audioController.playSound(
                { ...sound, id: soundId },
                monitorDeviceId,
                outputDeviceId,
                {
                    onStart: () => setActive(soundId),
                    onEnd: () => setInactive(soundId),
                }
            );
            // Toggle visual state based on whether we started or stopped
            if (!started) {
                setInactive(soundId);
            }
        } else {
            // One-shot: always play (overlapping)
            await audioController.playSound(
                { ...sound, id: soundId },
                monitorDeviceId,
                outputDeviceId,
                {
                    onStart: () => setActive(soundId),
                    onEnd: () => setInactive(soundId),
                }
            );
        }
    }, [sound, page, slot, monitorDeviceId, outputDeviceId, setActive, setInactive]);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            if (!sound) return;
            const newMode = sound.playbackMode === 'one-shot' ? 'loop' : 'one-shot';
            setPlaybackMode(page, slot, newMode);
        },
        [sound, page, slot, setPlaybackMode]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const file = files[0];

            if (file && (file.type === 'audio/mpeg' || file.name.endsWith('.mp3'))) {
                try {
                    const savedPath = await window.api.saveSoundFile(
                        window.api.getPathForFile(file),
                        file.name
                    );
                    const newSound: Sound = {
                        id: `${page}-${slot}`,
                        name: file.name.replace(/\.mp3$/i, ''),
                        filePath: savedPath,
                        playbackMode: 'one-shot',
                    };
                    addSound(page, slot, newSound);
                } catch (err) {
                    console.error('Failed to save sound file:', err);
                }
            }
        },
        [page, slot, addSound]
    );

    return (
        <div
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`
        group relative aspect-square rounded-2xl cursor-pointer select-none
        flex flex-col items-center justify-center gap-1
        transition-all duration-200 ease-out
        ${isActive
                    ? 'bg-gradient-to-br from-accent/30 to-neon-purple/20 border-2 border-accent-glow animate-pulse-glow scale-[1.02]'
                    : sound
                        ? 'bg-gradient-to-br from-surface-700 to-surface-800 border border-surface-600/50 hover:border-accent/50 hover:shadow-glow-purple hover:scale-[1.03]'
                        : 'bg-surface-800/60 border-2 border-dashed border-surface-600/40 hover:border-accent/40 hover:bg-surface-700/40'
                }
      `}
        >
            {/* Numpad label */}
            <span
                className={`absolute top-2 right-3 text-xs font-mono ${isActive ? 'text-accent-light' : 'text-surface-400/60'
                    }`}
            >
                {numpadLabel}
            </span>

            {sound ? (
                <>
                    {/* Sound name */}
                    <span className="text-sm font-semibold text-white/90 text-center px-2 leading-tight max-w-full truncate">
                        {sound.name}
                    </span>
                    {/* Playback mode badge */}
                    <span
                        className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${sound.playbackMode === 'loop'
                            ? 'bg-neon-purple/20 text-neon-purple'
                            : 'bg-neon-blue/15 text-neon-blue/80'
                            }`}
                    >
                        {sound.playbackMode}
                    </span>
                </>
            ) : (
                <>
                    {/* Empty slot indicator */}
                    <svg
                        className="w-6 h-6 text-surface-500/50 group-hover:text-accent/40 transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4.5v15m7.5-7.5h-15"
                        />
                    </svg>
                    <span className="text-[10px] text-surface-500/50 group-hover:text-surface-400 transition-colors">
                        Drop MP3
                    </span>
                </>
            )}

            {/* Active glow overlay */}
            {isActive && (
                <div className="absolute inset-0 rounded-2xl bg-accent/5 pointer-events-none" />
            )}
        </div>
    );
};

export default SoundCell;
