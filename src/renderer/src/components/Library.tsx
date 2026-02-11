import React, { useState, useCallback, useMemo } from 'react';
import { useSoundboardStore } from '../lib/store';
import type { Sound } from '../types/sound';
import ConfirmModal from './ConfirmModal';

interface LibraryProps {
    onEditSound: (soundId: string) => void;
}

const Library: React.FC<LibraryProps> = ({ onEditSound }) => {
    const library = useSoundboardStore((s) => s.library);
    const grid = useSoundboardStore((s) => s.grid);
    const libraryOpen = useSoundboardStore((s) => s.libraryOpen);
    const toggleLibrary = useSoundboardStore((s) => s.toggleLibrary);
    const removeFromLibrary = useSoundboardStore((s) => s.removeFromLibrary);
    const unassignSlot = useSoundboardStore((s) => s.unassignSlot);
    const getUsedSoundIds = useSoundboardStore((s) => s.getUsedSoundIds);

    const [search, setSearch] = useState('');
    const [showUnusedOnly, setShowUnusedOnly] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const usedIds = useMemo(() => getUsedSoundIds(), [grid, getUsedSoundIds]);

    /** Get all grid positions where a given sound is used */
    const getSoundUsage = useCallback((soundId: string) => {
        const usage: { page: number; slot: number }[] = [];
        for (const [key, id] of Object.entries(grid)) {
            if (id === soundId) {
                const [p, s] = key.split('-');
                usage.push({ page: parseInt(p), slot: parseInt(s) });
            }
        }
        return usage.sort((a, b) => a.page - b.page || a.slot - b.slot);
    }, [grid]);

    const filteredSounds = useMemo(() => {
        let sounds = Object.values(library);

        if (showUnusedOnly) {
            sounds = sounds.filter((s) => !usedIds.has(s.id));
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            sounds = sounds.filter(
                (s) =>
                    s.displayName.toLowerCase().includes(q) ||
                    s.originalName.toLowerCase().includes(q)
            );
        }

        sounds.sort((a, b) => b.createdAt - a.createdAt);
        return sounds;
    }, [library, showUnusedOnly, search, usedIds]);

    const handleDragStart = useCallback(
        (e: React.DragEvent, soundId: string) => {
            e.dataTransfer.setData('application/x-soundboard-id', soundId);
            e.dataTransfer.effectAllowed = 'copy';
        },
        []
    );

    const handleDeleteClick = useCallback((soundId: string) => {
        setDeleteTarget(soundId);
    }, []);

    const handleConfirmDelete = useCallback(() => {
        if (!deleteTarget) return;
        // First remove from all grid slots
        const usage = getSoundUsage(deleteTarget);
        for (const { page, slot } of usage) {
            unassignSlot(page, slot);
        }
        // Then remove from library
        removeFromLibrary(deleteTarget);
        setDeleteTarget(null);
    }, [deleteTarget, getSoundUsage, unassignSlot, removeFromLibrary]);

    if (!libraryOpen) return null;

    const deleteSound = deleteTarget ? library[deleteTarget] : null;
    const deleteUsage = deleteTarget ? getSoundUsage(deleteTarget) : [];

    return (
        <>
            <div className="w-72 h-full bg-surface-900/95 border-l border-surface-600/30 flex flex-col animate-fade-in shrink-0">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-3 border-b border-surface-700/50">
                    <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                        <svg className="w-4 h-4 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                        </svg>
                        Library
                        <span className="text-[10px] text-surface-400 font-normal">
                            ({Object.keys(library).length})
                        </span>
                    </h3>
                    <button onClick={toggleLibrary} className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>
                </div>

                {/* Search & Filter */}
                <div className="px-3 py-2 space-y-2 border-b border-surface-700/30">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search sounds..."
                        className="w-full px-2.5 py-1.5 bg-surface-800 border border-surface-600/40 rounded-lg text-xs text-white/90 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
                    />
                    <label className="flex items-center gap-2 text-[10px] text-surface-400 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showUnusedOnly}
                            onChange={(e) => setShowUnusedOnly(e.target.checked)}
                            className="rounded border-surface-600 bg-surface-800 text-accent focus:ring-accent/30 w-3 h-3"
                        />
                        Show only unused sounds
                    </label>
                </div>

                {/* Sound List */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                    {filteredSounds.length === 0 ? (
                        <div className="text-center py-8 text-surface-500 text-xs">
                            {Object.keys(library).length === 0
                                ? 'Drop MP3 files on the grid to import'
                                : 'No sounds match the filter'}
                        </div>
                    ) : (
                        filteredSounds.map((sound) => {
                            const isUsed = usedIds.has(sound.id);
                            return (
                                <div
                                    key={sound.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, sound.id)}
                                    className={`
                                        group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-grab active:cursor-grabbing
                                        transition-all duration-150 select-none
                                        ${isUsed
                                            ? 'bg-surface-800/60 border border-accent/10'
                                            : 'bg-surface-800/40 border border-surface-700/30 hover:border-surface-600/50'
                                        }
                                        hover:bg-surface-700/50
                                    `}
                                >
                                    {/* Drag handle */}
                                    <svg className="w-3 h-3 text-surface-500/50 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="9" cy="6" r="1.5" />
                                        <circle cx="15" cy="6" r="1.5" />
                                        <circle cx="9" cy="12" r="1.5" />
                                        <circle cx="15" cy="12" r="1.5" />
                                        <circle cx="9" cy="18" r="1.5" />
                                        <circle cx="15" cy="18" r="1.5" />
                                    </svg>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-white/85 truncate">
                                            {sound.displayName}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0 rounded-full ${sound.playbackMode === 'loop'
                                                ? 'bg-neon-purple/15 text-neon-purple/80'
                                                : 'bg-neon-blue/10 text-neon-blue/60'
                                                }`}>
                                                {sound.playbackMode}
                                            </span>
                                            {isUsed && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-accent-glow/60" title="In use" />
                                            )}
                                            {sound.volume !== 1.0 && (
                                                <span className="text-[9px] text-surface-400">
                                                    {Math.round(sound.volume * 100)}%
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onEditSound(sound.id); }}
                                            className="p-1 rounded-lg text-surface-400 hover:text-accent-light hover:bg-surface-700 transition-colors"
                                            title="Edit"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(sound.id); }}
                                            className="p-1 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Delete from Library"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && deleteSound && (
                <ConfirmModal
                    title="Delete Sound?"
                    message={`Delete "${deleteSound.displayName}" from your library? This cannot be undone.`}
                    warnings={
                        deleteUsage.length > 0
                            ? deleteUsage.map(
                                (u) => `This sound is used at Page ${u.page + 1}, Slot ${u.slot + 1}`
                            )
                            : undefined
                    }
                    confirmLabel="Delete"
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </>
    );
};

export default Library;
