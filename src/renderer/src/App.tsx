import React, { useEffect, useState, useCallback } from 'react';
import Grid from './components/Grid';
import PageNav from './components/PageNav';
import Settings from './components/Settings';
import Library from './components/Library';
import SoundEditor from './components/SoundEditor';
import { useSoundboardStore } from './lib/store';
import { audioController } from './lib/audioController';

type View = 'grid' | 'settings';

function App() {
    const [view, setView] = useState<View>('grid');
    const [editingSoundId, setEditingSoundId] = useState<string | null>(null);

    const clearAllActive = useSoundboardStore((s) => s.clearAllActive);
    const library = useSoundboardStore((s) => s.library);
    const grid = useSoundboardStore((s) => s.grid);
    const currentPage = useSoundboardStore((s) => s.currentPage);
    const monitorDeviceId = useSoundboardStore((s) => s.monitorDeviceId);
    const outputDeviceId = useSoundboardStore((s) => s.outputDeviceId);
    const monitorVolume = useSoundboardStore((s) => s.monitorVolume);
    const outputVolume = useSoundboardStore((s) => s.outputVolume);
    const setActive = useSoundboardStore((s) => s.setActive);
    const setInactive = useSoundboardStore((s) => s.setInactive);
    const getAllSoundsForRemote = useSoundboardStore((s) => s.getAllSoundsForRemote);
    const libraryOpen = useSoundboardStore((s) => s.libraryOpen);
    const toggleLibrary = useSoundboardStore((s) => s.toggleLibrary);

    const handleEditSound = useCallback((soundId: string) => {
        setEditingSoundId(soundId);
    }, []);

    const handleCloseEditor = useCallback(() => {
        setEditingSoundId(null);
    }, []);

    // Handle IPC events from main process
    useEffect(() => {
        const cleanupPanic = window.api.onPanicStop(() => {
            audioController.stopAll();
            clearAllActive();
        });

        const cleanupTrigger = window.api.onTriggerSound(async (payload) => {
            const key = `${payload.page}-${payload.slot}`;
            const soundId = grid[key];
            if (soundId) {
                const sound = library[soundId];
                if (sound) {
                    await audioController.playSound(
                        sound,
                        monitorDeviceId,
                        outputDeviceId,
                        {
                            onStart: () => setActive(sound.id),
                            onEnd: () => setInactive(sound.id),
                        },
                        monitorVolume,
                        outputVolume,
                    );
                }
            }
        });

        const cleanupRemote = window.api.onRequestSoundsForRemote(() => {
            window.api.sendSoundsForRemote(getAllSoundsForRemote());
        });

        return () => {
            cleanupPanic();
            cleanupTrigger();
            cleanupRemote();
        };
    }, [library, grid, monitorDeviceId, outputDeviceId, clearAllActive, setActive, setInactive, getAllSoundsForRemote]);

    return (
        <div className="dark h-screen w-screen bg-surface-950 text-white flex flex-col overflow-hidden">
            {/* Titlebar drag region */}
            <div
                className="h-10 flex items-center justify-between px-4 shrink-0"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 pl-16">
                    <div className="w-2 h-2 rounded-full bg-accent-glow animate-pulse" />
                    <span className="text-xs font-bold text-surface-300 uppercase tracking-[0.2em]">
                        OpenSoundBoard
                    </span>
                </div>
                <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    {/* Library toggle */}
                    <button
                        onClick={toggleLibrary}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${libraryOpen
                            ? 'bg-accent/20 text-accent-light'
                            : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white'
                            }`}
                    >
                        ♫ Library
                    </button>
                    {/* Settings toggle */}
                    <button
                        onClick={() => setView(view === 'grid' ? 'settings' : 'grid')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${view === 'settings'
                            ? 'bg-accent text-white shadow-glow-purple'
                            : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white'
                            }`}
                    >
                        {view === 'grid' ? '⚙ Settings' : '◻ Grid'}
                    </button>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Grid / Settings area */}
                <div className={`flex-1 flex flex-col px-6 pb-6 gap-4 overflow-auto ${view === 'grid' ? 'items-center justify-center' : 'items-start pt-4'}`}>
                    {view === 'grid' ? (
                        <>
                            <PageNav />
                            <Grid onEditSound={handleEditSound} />
                            <p className="text-[10px] text-surface-500 mt-1">
                                Seite {currentPage + 1} von 10 · Rechtsklick = Editor · Mittelklick = Entfernen · ESC = Panic Stop
                            </p>
                        </>
                    ) : (
                        <Settings />
                    )}
                </div>

                {/* Library sidebar */}
                {libraryOpen && (
                    <Library onEditSound={handleEditSound} />
                )}
            </div>

            {/* Bottom gradient line */}
            <div className="h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

            {/* Library toggle tab (when closed) */}
            {!libraryOpen && view === 'grid' && (
                <button
                    onClick={toggleLibrary}
                    className="fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-surface-800 border border-surface-600/50 border-r-0 rounded-l-xl px-1.5 py-6 text-surface-400 hover:text-accent-light hover:bg-surface-700 transition-all duration-200 group"
                    title="Open Library"
                >
                    <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
            )}

            {/* Sound Editor Modal */}
            {editingSoundId && (
                <SoundEditor
                    soundId={editingSoundId}
                    onClose={handleCloseEditor}
                />
            )}
        </div>
    );
}

export default App;
