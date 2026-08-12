import React, { useEffect, useState } from 'react';
import type { UpdateOffer } from '../../../shared/updater-types';

interface UpdateModalProps {
    offer: UpdateOffer;
    onClose: () => void;
}

type ViewState = 'offer' | 'downloading';

const UpdateModal: React.FC<UpdateModalProps> = ({ offer, onClose }) => {
    const [view, setView] = useState<ViewState>('offer');
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Subscribe to download progress updates
        const unsubscribeProgress = window.api.updater?.onDownloadProgress?.((progress) => {
            setDownloadProgress(progress.percent);
        });

        // Subscribe to error updates
        const unsubscribeError = window.api.updater?.onError?.((err) => {
            // Only show errors that occur during manual update (this modal is only shown for manual=true offers)
            if (!err.manual) {
                setError(err.message);
            }
        });

        return () => {
            unsubscribeProgress?.();
            unsubscribeError?.();
        };
    }, []);

    const handleInstall = async () => {
        try {
            setView('downloading');
            setDownloadProgress(0);
            await window.api.updater?.install?.();
            // The app will restart automatically; this component won't be seen after
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Installation failed');
            setView('offer');
        }
    };

    const handlePostpone = async () => {
        try {
            await window.api.updater?.postpone?.();
            onClose();
        } catch (err) {
            console.error('Failed to postpone update:', err);
        }
    };

    const handleSkip = async () => {
        try {
            await window.api.updater?.skip?.(offer.version);
            onClose();
        } catch (err) {
            console.error('Failed to skip version:', err);
        }
    };

    const handleDownload = async () => {
        try {
            await window.api.updater?.openDownloadPage?.();
            onClose();
        } catch (err) {
            console.error('Failed to open download page:', err);
        }
    };

    if (view === 'downloading') {
        return (
            <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            >
                <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                    <div className="px-5 py-4">
                        <h3 className="text-base font-bold text-white/90 mb-4">Downloading update…</h3>

                        {/* Progress bar */}
                        <div className="space-y-2">
                            <div className="w-full bg-surface-700 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-accent h-full transition-all duration-300 ease-out"
                                    style={{ width: `${downloadProgress}%` }}
                                />
                            </div>
                            <p className="text-xs text-surface-400 text-center">
                                {downloadProgress}%
                            </p>
                        </div>

                        <p className="text-sm text-surface-300 mt-4">
                            The app will restart automatically.
                        </p>
                    </div>

                    {error && (
                        <div className="px-5 py-3 bg-red-500/10 border-t border-red-500/30">
                            <p className="text-xs text-red-400 mb-3">{error}</p>
                            <button
                                onClick={() => {
                                    setError(null);
                                    setView('offer');
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                <div className="px-5 py-4">
                    <h3 className="text-base font-bold text-white/90 mb-2">Update available</h3>
                    <p className="text-sm text-surface-300 mb-4">
                        HISSOUNDBOARD {offer.version} is available (you have {offer.currentVersion}).
                    </p>

                    {offer.isMajor && offer.breakingNotes && (
                        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex gap-2 items-start">
                            <span className="text-amber-500 text-sm shrink-0 mt-0.5">⚠️</span>
                            <div className="flex-1">
                                <p className="text-xs text-amber-500 font-medium mb-2">
                                    This is a major update and may include breaking changes.
                                </p>
                                <div className="text-xs text-amber-400/90 space-y-1">
                                    {offer.breakingNotes.split('\n').map((line, idx) => {
                                        const trimmed = line.trim();
                                        if (!trimmed) return null;
                                        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                            return (
                                                <div key={idx} className="ml-2">
                                                    • {trimmed.slice(2)}
                                                </div>
                                            );
                                        }
                                        return (
                                            <div key={idx}>
                                                {trimmed}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {offer.summary && (
                        <div className="mb-4">
                            <h4 className="text-xs font-medium text-accent-light mb-2">What's new</h4>
                            <div className="text-xs text-surface-300 space-y-1">
                                {offer.summary.split('\n').map((line, idx) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return null;
                                    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                        return (
                                            <div key={idx} className="ml-2">
                                                • {trimmed.slice(2)}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={idx}>
                                            {trimmed}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2 px-5 py-3 border-t border-surface-700/40">
                    {offer.canAutoInstall ? (
                        <button
                            onClick={handleInstall}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition-colors"
                        >
                            Install now
                        </button>
                    ) : (
                        <button
                            onClick={handleDownload}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition-colors"
                        >
                            Download update
                        </button>
                    )}

                    <button
                        onClick={handlePostpone}
                        className="px-4 py-2 rounded-xl text-sm text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                    >
                        Later
                    </button>

                    <button
                        onClick={handleSkip}
                        className="px-4 py-2 rounded-xl text-xs text-surface-500 hover:text-surface-300 hover:bg-surface-800/50 transition-colors"
                    >
                        Skip this version
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdateModal;
