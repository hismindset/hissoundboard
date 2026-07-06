import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useSoundboardStore } from '../lib/store';
import type { Sound } from '../types/sound';
import { formatSoundName, generateId } from '../lib/utils';
import { VOICE_EFFECT_PRESETS, effectSlotId } from '../lib/voiceEffects';
import ConfirmModal from './ConfirmModal';

interface LibraryProps {
    onEditSound: (soundId: string) => void;
    onEditEffect: (presetId: string) => void;
}

const Library: React.FC<LibraryProps> = ({ onEditSound, onEditEffect }) => {
    const library = useSoundboardStore((s) => s.library);
    const grid = useSoundboardStore((s) => s.grid);
    const libraryOpen = useSoundboardStore((s) => s.libraryOpen);
    const toggleLibrary = useSoundboardStore((s) => s.toggleLibrary);
    const removeFromLibrary = useSoundboardStore((s) => s.removeFromLibrary);
    const addToLibrary = useSoundboardStore((s) => s.addToLibrary);
    const unassignSlot = useSoundboardStore((s) => s.unassignSlot);
    const getUsedSoundIds = useSoundboardStore((s) => s.getUsedSoundIds);
    const activeVoiceEffect = useSoundboardStore((s) => s.activeVoiceEffect);
    const toggleVoiceEffect = useSoundboardStore((s) => s.toggleVoiceEffect);
    const micDeviceId = useSoundboardStore((s) => s.audioSettings?.micDeviceId || '');

    // On Linux the mic is mixed at OS level and bypasses the in-app effect chain.
    const [platform, setPlatform] = useState('');
    useEffect(() => {
        window.api?.getPlatform?.().then((p: string) => setPlatform(p)).catch(() => { });
    }, []);

    const [search, setSearch] = useState('');
    const [showUnusedOnly, setShowUnusedOnly] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    // Download state
    const [downloadUrl, setDownloadUrl] = useState('');
    const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
    const [downloadMessage, setDownloadMessage] = useState('');

    const usedIds = useMemo(() => getUsedSoundIds(), [grid, getUsedSoundIds]);

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

    const handleDragStart = useCallback((e: React.DragEvent, soundId: string) => {
        e.dataTransfer.setData('application/x-soundboard-id', soundId);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDeleteClick = useCallback((soundId: string) => {
        setDeleteTarget(soundId);
    }, []);

    const handleConfirmDelete = useCallback(() => {
        if (!deleteTarget) return;
        const usage = getSoundUsage(deleteTarget);
        for (const { page, slot } of usage) {
            unassignSlot(page, slot);
        }
        removeFromLibrary(deleteTarget);
        setDeleteTarget(null);
    }, [deleteTarget, getSoundUsage, unassignSlot, removeFromLibrary]);

    const handleDownload = useCallback(async () => {
        if (!downloadUrl.trim()) return;
        setDownloadStatus('downloading');
        setDownloadMessage('');
        try {
            const soundUrl = await window.api.downloadUrl(downloadUrl.trim());

            const urlObj = new URL(downloadUrl.trim());
            const pathParts = urlObj.pathname.split('/');
            const rawName = pathParts[pathParts.length - 1] || 'Downloaded Sound';
            const displayName = formatSoundName(decodeURIComponent(rawName));

            const id = generateId();
            const newSound: Sound = {
                id,
                originalName: rawName,
                displayName,
                filePath: soundUrl,
                volume: 1.0,
                trimStart: 0,
                trimEnd: 0,
                fadeIn: 0,
                fadeOut: 0,
                playbackMode: 'one-shot',
                createdAt: Date.now(),
            };
            addToLibrary(newSound);

            setDownloadStatus('success');
            setDownloadMessage(`✓ ${displayName}`);
            setDownloadUrl('');
            setTimeout(() => { setDownloadStatus('idle'); setDownloadMessage(''); }, 3000);
        } catch (err) {
            console.error('Download failed:', err);
            setDownloadStatus('error');
            setDownloadMessage('Download fehlgeschlagen');
            setTimeout(() => { setDownloadStatus('idle'); setDownloadMessage(''); }, 3000);
        }
    }, [downloadUrl, addToLibrary]);

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

                {/* Download URL */}
                <div className="px-3 py-2 border-b border-surface-700/30">
                    <div className="flex gap-1.5">
                        <input
                            type="text"
                            value={downloadUrl}
                            onChange={(e) => setDownloadUrl(e.target.value)}
                            placeholder="MP3-URL eingeben..."
                            onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
                            className="flex-1 px-2.5 py-1.5 bg-surface-800 border border-surface-600/40 rounded-lg text-xs text-white/90 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
                        />
                        <button
                            onClick={handleDownload}
                            disabled={downloadStatus === 'downloading'}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${downloadStatus === 'downloading'
                                ? 'bg-surface-600 text-surface-400 cursor-wait'
                                : downloadStatus === 'success'
                                    ? 'bg-neon-green/20 text-neon-green'
                                    : downloadStatus === 'error'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-accent hover:bg-accent-dark text-white'
                                }`}
                        >
                            {downloadStatus === 'downloading' ? '⏳' : downloadStatus === 'success' ? '✓' : downloadStatus === 'error' ? '✕' : '↓'}
                        </button>
                    </div>
                    {downloadMessage && (
                        <p className={`text-[10px] mt-1 ${downloadStatus === 'error' ? 'text-red-400' : 'text-neon-green'}`}>
                            {downloadMessage}
                        </p>
                    )}
                </div>

                {/* Search & Filter */}
                <div className="px-3 py-2 space-y-2 border-b border-surface-700/30">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Suchen..."
                        className="w-full px-2.5 py-1.5 bg-surface-800 border border-surface-600/40 rounded-lg text-xs text-white/90 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
                    />
                    <label className="flex items-center gap-2 text-[10px] text-surface-400 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showUnusedOnly}
                            onChange={(e) => setShowUnusedOnly(e.target.checked)}
                            className="rounded border-surface-600 bg-surface-800 text-accent focus:ring-accent/30 w-3 h-3"
                        />
                        Nur unbenutzte anzeigen
                    </label>
                </div>

                {/* Voice Effects */}
                <div className="px-3 py-2 border-b border-surface-700/30">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-400 mb-1.5 flex items-center gap-1.5">
                        🎭 Voice Effects
                    </h4>
                    <div className="grid grid-cols-3 gap-1.5">
                        {VOICE_EFFECT_PRESETS.map((preset) => {
                            const isEffectActive = activeVoiceEffect === preset.id;
                            return (
                                <div
                                    key={preset.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/x-soundboard-id', effectSlotId(preset.id));
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    onClick={() => toggleVoiceEffect(preset.id)}
                                    title={`${preset.description} – click to ${isEffectActive ? 'disable' : 'enable'}, or drag onto the grid`}
                                    className={`
                                        group/effect relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl cursor-grab active:cursor-grabbing
                                        text-[10px] font-medium transition-all duration-150 select-none border
                                        ${isEffectActive
                                            ? 'bg-accent/20 border-accent/60 text-accent-light shadow-glow-purple'
                                            : 'bg-surface-800/60 border-surface-700/40 text-surface-300 hover:border-neon-blue/40 hover:bg-surface-700/50'
                                        }
                                    `}
                                >
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEditEffect(preset.id); }}
                                        title="Edit effect"
                                        className="absolute top-0.5 right-0.5 p-0.5 rounded-md text-surface-500 opacity-0 group-hover/effect:opacity-100 hover:text-accent-light hover:bg-surface-600/60 transition-all"
                                    >
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                                        </svg>
                                    </button>
                                    <span className="text-base leading-none">{preset.emoji}</span>
                                    <span className="truncate max-w-full">{preset.name}</span>
                                </div>
                            );
                        })}
                    </div>
                    {platform === 'linux' ? (
                        <p className="text-[9px] text-surface-500 mt-1.5 leading-snug">
                            While an effect is active, the mic runs through the app (slightly more latency); with no effect, the zero-latency OS routing takes over again.
                        </p>
                    ) : !micDeviceId ? (
                        <p className="text-[9px] text-surface-500 mt-1.5 leading-snug">
                            Effects apply to the microphone passthrough. Select a microphone in Settings first.
                        </p>
                    ) : null}
                </div>

                {/* Sound List */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                    {filteredSounds.length === 0 ? (
                        <div className="text-center py-8 text-surface-500 text-xs">
                            {Object.keys(library).length === 0
                                ? 'MP3 auf das Grid ziehen oder URL herunterladen'
                                : 'Keine Sounds gefunden'}
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
                                    <svg className="w-3 h-3 text-surface-500/50 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="9" cy="6" r="1.5" />
                                        <circle cx="15" cy="6" r="1.5" />
                                        <circle cx="9" cy="12" r="1.5" />
                                        <circle cx="15" cy="12" r="1.5" />
                                        <circle cx="9" cy="18" r="1.5" />
                                        <circle cx="15" cy="18" r="1.5" />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-white/85 truncate">
                                            {sound.displayName}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0 rounded-full ${sound.playbackMode === 'loop'
                                                ? 'bg-accent/15 text-accent-light/80'
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
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onEditSound(sound.id); }}
                                            className="p-1 rounded-lg text-surface-400 hover:text-accent-light hover:bg-surface-700 transition-colors"
                                            title="Bearbeiten"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(sound.id); }}
                                            className="p-1 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Aus Library löschen"
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

            {/* Delete Confirmation */}
            {deleteTarget && deleteSound && (
                <ConfirmModal
                    title="Sound löschen?"
                    message={`"${deleteSound.displayName}" aus der Library löschen? Das kann nicht rückgängig gemacht werden.`}
                    warnings={
                        deleteUsage.length > 0
                            ? deleteUsage.map(
                                (u) => `Dieser Sound wird benutzt auf Seite ${u.page + 1}, Slot ${u.slot + 1}`
                            )
                            : undefined
                    }
                    confirmLabel="Löschen"
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </>
    );
};

export default Library;
