import React, { useEffect, useState, useCallback } from 'react';
import Grid from './components/Grid';
import PageList from './components/PageList';
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
    const pages = useSoundboardStore((s) => s.pages);
    const activePageId = useSoundboardStore((s) => s.activePageId);
    const monitorDeviceId = useSoundboardStore((s) => s.monitorDeviceId);
    const outputDeviceId = useSoundboardStore((s) => s.outputDeviceId);
    const monitorVolume = useSoundboardStore((s) => s.monitorVolume);
    const outputVolume = useSoundboardStore((s) => s.outputVolume);
    const setActive = useSoundboardStore((s) => s.setActive);
    const setInactive = useSoundboardStore((s) => s.setInactive);
    const getAllSoundsForRemote = useSoundboardStore((s) => s.getAllSoundsForRemote);
    const libraryOpen = useSoundboardStore((s) => s.libraryOpen);
    const toggleLibrary = useSoundboardStore((s) => s.toggleLibrary);
    const shortcutMode = useSoundboardStore((s) => s.shortcutMode);

    const handleEditSound = useCallback((soundId: string) => {
        setEditingSoundId(soundId);
    }, []);

    const handleCloseEditor = useCallback(() => {
        setEditingSoundId(null);
    }, []);

    // Sync shortcut config to main process
    // This must be here so it runs regardless of current view
    useEffect(() => {
        window.api.setShortcutConfig?.({
            mode: shortcutMode,
            pages: pages.map(p => ({ id: p.id, modifierKeys: p.modifierKeys })),
        });
    }, [shortcutMode, pages]);

    // Handle IPC events from main process
    useEffect(() => {
        const cleanupPanic = window.api.onPanicStop(() => {
            audioController.stopAll();
            clearAllActive();
        });

        const cleanupTrigger = window.api.onTriggerSound(async (payload) => {
            let targetPageId = '';

            // If main sends pageID (new system)
            if (payload.pageId) {
                targetPageId = payload.pageId;
            }
            // Fallback: If main sends page index (legacy/numpad default)
            else if (typeof payload.page === 'number') {
                const targetPage = pages[payload.page];
                if (targetPage) {
                    targetPageId = targetPage.id;
                }
            }

            if (!targetPageId && activePageId) {
                // Should we trigger on active page? 
                // Only if the shortcut was meant for "Active Page".
                // But blindly triggering on active page might be wrong.
            }

            if (!targetPageId) return;

            const key = `${targetPageId}-${payload.slot}`;
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
    }, [library, grid, pages, activePageId, monitorDeviceId, outputDeviceId, clearAllActive, setActive, setInactive, getAllSoundsForRemote]);

    return (
        <div className="dark h-screen w-screen bg-surface-950 text-white flex flex-col overflow-hidden">
            {/* Titlebar drag region */}
            <div
                className="h-10 flex items-center justify-between px-4 shrink-0 bg-surface-900 border-b border-surface-800"
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

                {/* Left Sidebar: Page List */}
                {view === 'grid' && (
                    <PageList />
                )}

                {/* Grid / Settings area */}
                <div className={`flex-1 flex flex-col bg-surface-950 relative ${view === 'grid' ? 'items-center justify-center' : 'items-start pt-4 px-6 overflow-auto'}`}>
                    {view === 'grid' ? (
                        <>
                            <Grid onEditSound={handleEditSound} />
                            <p className="text-[10px] text-surface-500 mt-4 select-none">
                                Right Click = Edit · Middle Click = Remove · ESC = Panic
                            </p>
                        </>
                    ) : (
                        <Settings />
                    )}
                </div>

                {/* Right Sidebar: Library */}
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
