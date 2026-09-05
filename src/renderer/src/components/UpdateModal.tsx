import React, { useEffect, useState } from 'react';
import type { UpdateOffer, ReleaseNotes } from '../../../shared/updater-types';

interface UpdateModalProps {
    offer: UpdateOffer;
    onClose: () => void;
}

type ViewState = 'offer' | 'downloading';

/** Render the Summary (or Breaking-Notes) of a single release as a stack of
 *  bullet-style lines. Each call to extractReleaseNotes stores the section
 *  body verbatim (newlines included), so we re-implement the same line-by-
 *  line bullet/paragraph split the modal used to do inline. */
const renderNotesBody = (text: string | null): React.ReactNode => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
                <div key={idx} className="ml-2">• {trimmed.slice(2)}</div>
            );
        }
        return <div key={idx}>{trimmed}</div>;
    });
};

/** One release in the stacked list. Renders the version as a small heading,
 *  then the breaking-changes (if any, in amber), then the summary. */
const ReleaseSection: React.FC<{ notes: ReleaseNotes; isLast: boolean }> = ({ notes, isLast }) => {
    const hasBreaking = !!notes.breakingNotes;
    const hasSummary = !!notes.summary;
    if (!hasBreaking && !hasSummary) {
        // Nothing to show for this release — still keep the version label so
        // the user sees that a release was skipped (e.g. a release with
        // neither section happens, or the GitHub fetch failed).
        return (
            <div className={isLast ? '' : 'mb-4'}>
                <h4 className="text-xs font-semibold text-surface-200 mb-1">v{notes.version}</h4>
                <p className="text-[11px] text-surface-500 italic">No release notes available.</p>
            </div>
        );
    }
    return (
        <div className={isLast ? '' : 'mb-4'}>
            <h4 className="text-xs font-semibold text-surface-200 mb-1.5">v{notes.version}</h4>
            {hasBreaking && (
                <div className="mb-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                    <p className="text-[10px] font-medium text-amber-500 mb-1">Breaking changes</p>
                    <div className="text-[11px] text-amber-400/90 space-y-0.5">
                        {renderNotesBody(notes.breakingNotes)}
                    </div>
                </div>
            )}
            {hasSummary && (
                <div className="text-[11px] text-surface-300 space-y-0.5">
                    {renderNotesBody(notes.summary)}
                </div>
            )}
        </div>
    );
};

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
                <div className="w-full max-w-sm max-h-[calc(100vh-2rem)] mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-y-auto">
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
                            <p className="text-xs text-red-400 mb-3 break-all">{error}</p>
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
            <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
                <div className="px-5 py-4 overflow-y-auto flex-1">
                    <h3 className="text-base font-bold text-white/90 mb-2">Update available</h3>
                    <p className="text-sm text-surface-300 mb-4">
                        HISSOUNDBOARD {offer.version} is available (you have {offer.currentVersion}).
                    </p>

                    {/* Major-version banner only applies to the version the user is
                        about to install. The per-release breaking-changes block below
                        covers every release in the stack, so we don't double-render. */}
                    {offer.isMajor && offer.intermediateReleases.length === 0 && offer.breakingNotes && (
                        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex gap-2 items-start">
                            <span className="text-amber-500 text-sm shrink-0 mt-0.5">⚠️</span>
                            <div className="flex-1">
                                <p className="text-xs text-amber-500 font-medium mb-2">
                                    This is a major update and may include breaking changes.
                                </p>
                                <div className="text-xs text-amber-400/90 space-y-1">
                                    {renderNotesBody(offer.breakingNotes)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stacked release notes: every release between currentVersion
                        (exclusive) and offer.version (inclusive), oldest first. The
                        final section is the version the user is installing. */}
                    {offer.intermediateReleases.length > 0 ? (
                        <div className="mb-2">
                            <h4 className="text-xs font-medium text-accent-light mb-2">
                                What's new
                                {offer.intermediateReleases.length > 1 && (
                                    <span className="text-surface-500 font-normal"> · {offer.intermediateReleases.length} releases</span>
                                )}
                            </h4>
                            {offer.intermediateReleases.map((notes, idx) => (
                                <ReleaseSection
                                    key={notes.version}
                                    notes={notes}
                                    isLast={idx === offer.intermediateReleases.length - 1}
                                />
                            ))}
                        </div>
                    ) : offer.summary ? (
                        // Backwards-compat fallback: if main didn't ship any
                        // intermediate releases (older app version, or the
                        // listing endpoint failed), fall back to the old
                        // single-block render from the headline release.
                        <div className="mb-4">
                            <h4 className="text-xs font-medium text-accent-light mb-2">What's new</h4>
                            <div className="text-xs text-surface-300 space-y-1">
                                {renderNotesBody(offer.summary)}
                            </div>
                        </div>
                    ) : null}
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
