import React, { useCallback, useState, useRef, useEffect } from 'react';
import type { Sound } from '../types/sound';
import { useSoundboardStore } from '../lib/store';
import { audioController } from '../lib/audioController';
import { formatSoundName, generateId } from '../lib/utils';
import { isEffectSlotId, getEffectPreset } from '../lib/voiceEffects';

interface SoundCellProps {
    page: string; // UUID
    slot: number;
    numpadLabel: number;
    onEditSound: (soundId: string) => void;
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.flac'];

const SoundCell: React.FC<SoundCellProps> = ({ page, slot, numpadLabel, onEditSound }) => {
    // page is UUID, slot is number
    const cellKey = `${page}-${slot}`;

    // Slot value: either a sound id or "effect:<presetId>" for voice effects.
    const soundId = useSoundboardStore((s) => s.grid[cellKey]) || null;
    const effectPreset = soundId && isEffectSlotId(soundId) ? getEffectPreset(soundId) : undefined;
    const sound = useSoundboardStore((s) => {
        const id = s.grid[cellKey];
        return id && !isEffectSlotId(id) ? s.library[id] : undefined;
    });
    const activeVoiceEffect = useSoundboardStore((s) => s.activeVoiceEffect);
    const toggleVoiceEffect = useSoundboardStore((s) => s.toggleVoiceEffect);
    const isActive = useSoundboardStore((s) => {
        const id = s.grid[cellKey];
        return id ? s.activeSounds.has(id) : false;
    }) || (!!effectPreset && activeVoiceEffect === effectPreset.id);

    // Legacy volume props removed - controller handles it

    const addToLibrary = useSoundboardStore((s) => s.addToLibrary);
    const assignToSlot = useSoundboardStore((s) => s.assignToSlot);
    const unassignSlot = useSoundboardStore((s) => s.unassignSlot);
    const setActive = useSoundboardStore((s) => s.setActive);
    const setInactive = useSoundboardStore((s) => s.setInactive);

    const [showContextMenu, setShowContextMenu] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
    const [isDragOver, setIsDragOver] = useState(false);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Close context menu on outside click
    useEffect(() => {
        if (!showContextMenu) return;
        const handler = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setShowContextMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showContextMenu]);

    const handleClick = useCallback(async () => {
        if (effectPreset) {
            toggleVoiceEffect(effectPreset.id);
            return;
        }
        if (!sound) return;
        await audioController.playSound(sound, {
            onStart: () => setActive(sound.id),
            onEnd: () => setInactive(sound.id),
        });
    }, [sound, effectPreset, toggleVoiceEffect, setActive, setInactive]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (!sound && !effectPreset) return;
        setContextMenuPos({ x: e.clientX, y: e.clientY });
        setShowContextMenu(true);
    }, [sound, effectPreset]);

    // Middle-click removes the sound from this slot (prevents browser autoscroll too)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 && soundId) {
            e.preventDefault();
            unassignSlot(page, slot);
        }
    }, [soundId, page, slot, unassignSlot]);

    // ── Drag: this cell is the SOURCE (dragging a sound out) ──────────────
    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (!soundId) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('application/x-soundboard-id', soundId);
        // Also pass source slot so we can clear it on move
        e.dataTransfer.setData('application/x-source-slot', cellKey);
        e.dataTransfer.effectAllowed = 'move';
    }, [soundId, cellKey]);

    // ── Drop: this cell is the TARGET ─────────────────────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-source-slot') ? 'move' : 'copy';
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        // 1. Library drag or grid-to-grid drag (both carry soundboard-id)
        const droppedSoundId = e.dataTransfer.getData('application/x-soundboard-id');
        if (droppedSoundId) {
            const sourceSlotKey = e.dataTransfer.getData('application/x-source-slot');

            if (sourceSlotKey) {
                // Grid-to-grid move: clear the source slot
                // sourceSlotKey is "pageId-slotIndex"
                const parts = sourceSlotKey.split('-');
                const srcSlot = parseInt(parts.pop() || '0');
                const srcPageId = parts.join('-');

                // If dropping on same slot, do nothing
                if (srcPageId === page && srcSlot === slot) return;

                // If target slot has a sound, swap them
                if (soundId) {
                    assignToSlot(srcPageId, srcSlot, soundId);
                } else {
                    unassignSlot(srcPageId, srcSlot);
                }
            }

            assignToSlot(page, slot, droppedSoundId);
            return;
        }

        // 2. File drop from OS
        const files = Array.from(e.dataTransfer.files);
        const file = files[0];
        if (!file) return;

        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(ext)) return;

        try {
            const savedPath = await window.api.saveSoundFile(
                window.api.getPathForFile(file),
                file.name
            );
            const id = generateId();
            const newSound: Sound = {
                id,
                originalName: file.name,
                displayName: formatSoundName(file.name),
                filePath: savedPath,
                volume: 1.0,
                trimStart: 0,
                trimEnd: 0,
                fadeIn: 0,
                fadeOut: 0,
                playbackMode: 'one-shot',
                createdAt: Date.now(),
            };
            addToLibrary(newSound);
            assignToSlot(page, slot, id);
        } catch (err) {
            console.error('Failed to save sound file:', err);
        }
    }, [page, slot, soundId, addToLibrary, assignToSlot, unassignSlot]);

    return (
        <>
            <div
                draggable={!!sound || !!effectPreset}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onMouseDown={handleMouseDown}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                    group relative aspect-square rounded-2xl cursor-pointer select-none
                    flex flex-col items-center justify-center gap-1
                    transition-all duration-200 ease-out
                    ${isDragOver
                        ? 'bg-accent/10 border-2 border-accent/60 scale-[1.05]'
                        : isActive
                            ? 'bg-gradient-to-br from-accent/30 to-accent/20 border-2 border-accent-glow animate-pulse-glow scale-[1.02]'
                            : effectPreset
                                ? 'bg-gradient-to-br from-surface-700 to-surface-800 border border-neon-blue/40 hover:border-neon-blue/70 hover:scale-[1.03]'
                                : sound
                                    ? 'bg-gradient-to-br from-surface-700 to-surface-800 border border-surface-600/50 hover:border-accent/50 hover:shadow-glow-purple hover:scale-[1.03]'
                                    : 'bg-surface-800/60 border-2 border-dashed border-surface-600/40 hover:border-accent/40 hover:bg-surface-700/40'
                    }
                `}
            >
                {/* Numpad label */}
                <span className={`absolute top-2 right-3 text-xs font-mono ${isActive ? 'text-accent-light' : 'text-surface-400/60'}`}>
                    {numpadLabel}
                </span>

                {effectPreset ? (
                    <>
                        <span className="text-2xl leading-none">{effectPreset.emoji}</span>
                        <span className="text-sm font-semibold text-white/90 text-center px-2 leading-tight max-w-full truncate">
                            {effectPreset.name}
                        </span>
                        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${isActive ? 'bg-accent/20 text-accent-light' : 'bg-neon-blue/15 text-neon-blue/80'}`}>
                            {isActive ? 'Aktiv' : 'Effekt'}
                        </span>
                    </>
                ) : sound ? (
                    <>
                        <span className="text-sm font-semibold text-white/90 text-center px-2 leading-tight max-w-full truncate">
                            {sound.displayName}
                        </span>
                        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${sound.playbackMode === 'loop' ? 'bg-accent/20 text-accent-light' : 'bg-neon-blue/15 text-neon-blue/80'}`}>
                            {sound.playbackMode}
                        </span>
                        {sound.volume !== 1.0 && (
                            <span className="text-[9px] text-surface-400/70 font-mono">{Math.round(sound.volume * 100)}%</span>
                        )}
                    </>
                ) : (
                    <>
                        <svg className="w-6 h-6 text-surface-500/50 group-hover:text-accent/40 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span className="text-[10px] text-surface-500/50 group-hover:text-surface-400 transition-colors">Drop MP3</span>
                    </>
                )}

                {isActive && <div className="absolute inset-0 rounded-2xl bg-accent/5 pointer-events-none" />}
            </div>

            {/* Context Menu */}
            {showContextMenu && (sound || effectPreset) && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-50 bg-surface-800 border border-surface-600/50 rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in"
                    style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                >
                    {sound && (
                        <button
                            onClick={() => { setShowContextMenu(false); onEditSound(sound.id); }}
                            className="w-full text-left px-3 py-2 text-xs text-surface-200 hover:bg-surface-700 hover:text-white transition-colors flex items-center gap-2"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                            </svg>
                            Edit Sound
                        </button>
                    )}
                    <button
                        onClick={() => { setShowContextMenu(false); unassignSlot(page, slot); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                        Remove from Slot
                    </button>
                </div>
            )}
        </>
    );
};

export default SoundCell;
