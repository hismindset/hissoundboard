import React, { useEffect, useState, useCallback } from 'react';
import Grid from './components/Grid';
import PageNav from './components/PageNav';
import Settings from './components/Settings';
import { useSoundboardStore } from './lib/store';
import { audioController } from './lib/audioController';

type View = 'grid' | 'settings';

function App() {
    const [view, setView] = useState<View>('grid');
    const clearAllActive = useSoundboardStore((s) => s.clearAllActive);
    const sounds = useSoundboardStore((s) => s.sounds);
    const currentPage = useSoundboardStore((s) => s.currentPage);
    const monitorDeviceId = useSoundboardStore((s) => s.monitorDeviceId);
    const outputDeviceId = useSoundboardStore((s) => s.outputDeviceId);
    const setActive = useSoundboardStore((s) => s.setActive);
    const setInactive = useSoundboardStore((s) => s.setInactive);
    const getAllSoundsForRemote = useSoundboardStore((s) => s.getAllSoundsForRemote);

    // Handle IPC events from main process
    useEffect(() => {
        // Panic stop: stop all sounds
        const cleanupPanic = window.api.onPanicStop(() => {
            audioController.stopAll();
            clearAllActive();
        });

        // Trigger sound from global shortcut or remote
        const cleanupTrigger = window.api.onTriggerSound(async (payload) => {
            const key = `${payload.page}-${payload.slot}`;
            const sound = sounds[key];
            if (sound) {
                const soundId = key;
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
                    if (!started) setInactive(soundId);
                } else {
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
            }
        });

        // Remote requests sounds list
        const cleanupRemote = window.api.onRequestSoundsForRemote(() => {
            window.api.sendSoundsForRemote(getAllSoundsForRemote());
        });

        return () => {
            cleanupPanic();
            cleanupTrigger();
            cleanupRemote();
        };
    }, [sounds, monitorDeviceId, outputDeviceId, clearAllActive, setActive, setInactive, getAllSoundsForRemote]);

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
                <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button
                        onClick={() => setView(view === 'grid' ? 'settings' : 'grid')}
                        className={`
              px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200
              ${view === 'settings'
                                ? 'bg-accent text-white shadow-glow-purple'
                                : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white'
                            }
            `}
                    >
                        {view === 'grid' ? '⚙ Settings' : '◻ Grid'}
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 gap-4 overflow-auto">
                {view === 'grid' ? (
                    <>
                        <PageNav />
                        <Grid />
                        {/* Page shortcut hint */}
                        <p className="text-[10px] text-surface-500 mt-1">
                            Seite {currentPage + 1} von 10 · Rechtsklick = Loop Toggle · ESC = Panic Stop
                        </p>
                    </>
                ) : (
                    <Settings />
                )}
            </div>

            {/* Bottom gradient line */}
            <div className="h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        </div>
    );
}

export default App;
