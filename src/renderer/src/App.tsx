import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Grid from './components/Grid';
import PageList from './components/PageList';
import Settings from './components/Settings';
import Library from './components/Library';
import SoundEditor from './components/SoundEditor';
import HelpModal from './components/HelpModal';
import EasterEggModal from './components/EasterEggModal';
import { AudioSetupWizard } from './components/AudioSetupWizard';
import { useSoundboardStore } from './lib/store';
import { audioController } from './lib/audioController';
import wordmark from './assets/his_soundboard_logo.png';

type View = 'grid' | 'settings';

const App: React.FC = () => {
    const [view, setView] = useState<View>('grid');
    const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showEasterEgg, setShowEasterEgg] = useState(false);

    const clearAllActive = useSoundboardStore((s) => s.clearAllActive);
    const library = useSoundboardStore((s) => s.library);
    const grid = useSoundboardStore((s) => s.grid);
    const pages = useSoundboardStore((s) => s.pages);
    const activePageId = useSoundboardStore((s) => s.activePageId);

    // New Audio Settings
    // Ensure we have a fallback if store state is corrupted/undefined
    const audioSettings = useSoundboardStore((s) => s.audioSettings || {
        monitorVolume: 1.0,
        outputVolume: 0.5,
        monitorMuted: false,
        outputMuted: false,
        monitorDeviceId: '',
        outputDeviceId: ''
    });
    const setAudioSettings = useSoundboardStore((s) => s.setAudioSettings);
    const hasCompletedSetup = useSoundboardStore((s) => s.hasCompletedSetup);
    const setShowWaylandWarning = useSoundboardStore((s) => s.setShowWaylandWarning);

    const setActive = useSoundboardStore((s) => s.setActive);
    const setInactive = useSoundboardStore((s) => s.setInactive);
    const getAllSoundsForRemote = useSoundboardStore((s) => s.getAllSoundsForRemote);
    const libraryOpen = useSoundboardStore((s) => s.libraryOpen);
    const toggleLibrary = useSoundboardStore((s) => s.toggleLibrary);
    const shortcutMode = useSoundboardStore((s) => s.shortcutMode);

    // Init Audio Controller with saved settings.
    // IMPORTANT: this runs the full init (including microphone passthrough) on
    // every launch, so a previously selected mic is re-activated automatically.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Determine platform first so the controller can pick the right mic strategy.
            try {
                const platform = await window.api.getPlatform?.();
                if (platform) audioController.setPlatform(platform);
            } catch (err) {
                console.warn('[App] Could not determine platform:', err);
            }
            if (cancelled) return;
            await audioController.init(audioSettings);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Subscribe to store changes to update AudioController in real-time
    useEffect(() => {
        const unsub = useSoundboardStore.subscribe((state, prevState) => {
            if (state.audioSettings !== prevState.audioSettings) {
                const s = state.audioSettings;
                const prevS = prevState.audioSettings;

                // Volume & Mute Updates
                if (s.monitorVolume !== prevS.monitorVolume) audioController.setMonitorVolume(s.monitorVolume);
                if (s.outputVolume !== prevS.outputVolume) audioController.setOutputVolume(s.outputVolume);
                if (s.micVolume !== prevS.micVolume) audioController.setMicVolume(s.micVolume);

                if (s.monitorMuted !== prevS.monitorMuted) audioController.setMonitorMuted(s.monitorMuted);
                if (s.outputMuted !== prevS.outputMuted) audioController.setOutputMuted(s.outputMuted);

                // Device Updates
                if (s.monitorDeviceId !== prevS.monitorDeviceId) {
                    audioController.setMonitorDevice(s.monitorDeviceId);
                }
                if (s.outputDeviceId !== prevS.outputDeviceId) {
                    audioController.setOutputDevice(s.outputDeviceId);
                }
                if (s.micDeviceId !== prevS.micDeviceId) {
                    audioController.setMicDevice(s.micDeviceId);
                }
            }
        });
        return unsub;
    }, []);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showWizard, setShowWizard] = useState(false);

    // Show wizard on first run if not completed
    useEffect(() => {
        if (!hasCompletedSetup) {
            setShowWizard(true);
        }
    }, [hasCompletedSetup]);

    const handleEditSound = useCallback((soundId: string) => {
        setEditingSoundId(soundId);
    }, []);

    const handleCloseEditor = useCallback(() => {
        setEditingSoundId(null);
    }, []);

    // Sync shortcut config to main process
    useEffect(() => {
        if (window.api && window.api.setShortcutConfig) {
            window.api.setShortcutConfig({
                mode: shortcutMode,
                pages: pages ? pages.map(p => ({ id: p.id, modifierKeys: p.modifierKeys })) : [],
            });
        }
    }, [shortcutMode, pages]);

    // Handle IPC events
    useEffect(() => {
        const cleanupWayland = window.api.onWaylandWarning?.(() => {
            setShowWaylandWarning(true);
        });

        const cleanupPanic = window.api.onPanicStop(() => {
            audioController.stopAll();
            clearAllActive();
        });

        const cleanupTrigger = window.api.onTriggerSound(async (payload) => {
            let targetPageId = '';

            if (payload.pageId) {
                targetPageId = payload.pageId;
            } else if (typeof payload.page === 'number') {
                const targetPage = pages && pages[payload.page];
                if (targetPage) {
                    targetPageId = targetPage.id;
                }
            }

            if (!targetPageId && activePageId) {
                // Fallback logic
            }

            if (!targetPageId) return;

            const key = `${targetPageId}-${payload.slot}`;
            const soundId = grid && grid[key];
            if (soundId) {
                const sound = library && library[soundId];
                if (sound) {
                    try {
                        await audioController.playSound(sound, {
                            onStart: () => setActive(sound.id),
                            onEnd: () => setInactive(sound.id),
                        });
                    } catch (err) {
                        console.error("Failed to play sound via trigger:", err);
                    }
                }
            }
        });

        const cleanupRemote = window.api.onRequestSoundsForRemote(() => {
            window.api.sendSoundsForRemote(getAllSoundsForRemote());
        });

        const cleanupHelp = window.api.onShowHelp?.(() => setShowHelp(true));
        const cleanupEasterEgg = window.api.onShowEasterEgg?.(() => setShowEasterEgg(true));

        return () => {
            if (cleanupWayland) cleanupWayland();
            cleanupPanic();
            cleanupTrigger();
            cleanupRemote();
            cleanupHelp?.();
            cleanupEasterEgg?.();
        };
    }, [library, grid, pages, activePageId, clearAllActive, setActive, setInactive, getAllSoundsForRemote, setShowWaylandWarning]);

    // Push the current board to connected remotes whenever it changes, so the
    // remote stays in sync after edits and reliably receives data after connecting.
    useEffect(() => {
        window.api?.sendSoundsForRemote?.(getAllSoundsForRemote());
    }, [library, grid, pages, activePageId, getAllSoundsForRemote]);

    return (
        <div className="dark h-screen w-screen bg-surface-950 text-white flex flex-col overflow-hidden">
            {/* Titlebar drag region */}
            <div
                className="h-10 flex items-center justify-between px-4 shrink-0 bg-surface-900 border-b border-surface-800"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 pl-16">
                    <img src={wordmark} alt="HISSOUNDBOARD" className="h-6 w-auto object-contain" />
                </div>
                <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button
                        onClick={toggleLibrary}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${libraryOpen
                            ? 'bg-accent/20 text-accent-light'
                            : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white'
                            }`}
                    >
                        ♫ Library
                    </button>
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
                {view === 'grid' && <PageList />}

                <div className={`flex-1 flex flex-col bg-surface-950 relative ${view === 'grid' ? 'items-center justify-center' : 'items-start pt-4 px-6 overflow-auto'}`}>
                    {view === 'grid' ? (
                        <>
                            <Grid onEditSound={handleEditSound} />
                            <p className="text-[10px] text-surface-500 mt-4 select-none">
                                Right Click = Edit · Middle Click = Remove · ESC = Panic
                            </p>
                        </>
                    ) : (
                        <Settings onClose={() => setView('grid')} />
                    )}
                </div>

                {libraryOpen && <Library onEditSound={handleEditSound} />}
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

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

            {editingSoundId && (
                <SoundEditor
                    soundId={editingSoundId}
                    onClose={handleCloseEditor}
                />
            )}

            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
            {showEasterEgg && <EasterEggModal onClose={() => setShowEasterEgg(false)} />}
        </div>
    );
}

export default App;
