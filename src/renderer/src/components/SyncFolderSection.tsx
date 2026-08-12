import React, { useEffect, useState } from 'react';
import { useSoundboardStore } from '../lib/store';
import ConfirmModal from './ConfirmModal';
import type { ApplyFolderAction } from '../../../shared/sync-types';

interface Notice {
    title: string;
    message: string;
}

/** Settings → "Sync Folder" section: lets the user point sounds + settings
 *  at a folder inside Nextcloud/iCloud/Git, and walks them through the four
 *  possible outcomes of picking a folder (fresh / move / adopt / reject). */
const SyncFolderSection: React.FC = () => {
    const [folder, setFolder] = useState<string | null>(null);
    const [soundsDir, setSoundsDir] = useState<string>('');
    const [busy, setBusy] = useState(false);

    // Simple "OK"-only informational modal (errors, rejections, backup notices).
    const [notice, setNotice] = useState<Notice | null>(null);
    // "Empty folder + local data" needs a 3-way choice ConfirmModal can't express.
    const [moveDecisionFolder, setMoveDecisionFolder] = useState<string | null>(null);
    // "Valid config folder + local data" is a plain yes/no, ConfirmModal handles it.
    const [adoptConfirmFolder, setAdoptConfirmFolder] = useState<string | null>(null);

    const refreshStatus = async () => {
        const status = await window.api.getSyncStatus();
        setFolder(status.folder);
        setSoundsDir(status.soundsDir);
    };

    useEffect(() => {
        refreshStatus();
    }, []);

    const applyFolder = async (target: string, action: ApplyFolderAction) => {
        setBusy(true);
        try {
            const result = await window.api.applySyncFolder(target, action);
            if (!result.ok) {
                setNotice({
                    title: 'Could not apply folder',
                    message: result.error || 'An unknown error occurred.',
                });
                return;
            }

            if (result.syncedState) {
                const { library, grid, pages, activePageId, voiceEffectParams, shortcutMode } = result.syncedState;
                const validActivePageId = pages.some((p) => p.id === activePageId)
                    ? activePageId
                    : pages[0]?.id ?? '';
                useSoundboardStore.setState({
                    library,
                    grid,
                    pages,
                    activePageId: validActivePageId,
                    voiceEffectParams,
                    shortcutMode,
                });
            }

            await refreshStatus();

            if (result.backupPath) {
                setNotice({
                    title: 'Previous board backed up',
                    message: `Your previous local board was not deleted — it was backed up to:\n${result.backupPath}`,
                });
            }
        } finally {
            setBusy(false);
        }
    };

    const handleChooseFolder = async () => {
        const result = await window.api.pickSyncFolder();

        switch (result.status) {
            case 'cancelled':
                return;

            case 'invalid-nonempty':
                setNotice({
                    title: 'Folder not empty',
                    message:
                        'The selected folder is not empty and does not contain a HISSOUNDBOARD configuration. Please choose an empty folder, or move your existing files into it manually.',
                });
                return;

            case 'invalid-nested':
                setNotice({
                    title: 'Folder already in use',
                    message: 'The selected folder is already part of the current storage location. Please choose a different folder.',
                });
                return;

            case 'empty':
                if (!result.localHasData) {
                    await applyFolder(result.folder, 'fresh');
                } else {
                    setMoveDecisionFolder(result.folder);
                }
                return;

            case 'valid-config':
                if (!result.localHasData) {
                    await applyFolder(result.folder, 'adopt');
                } else {
                    setAdoptConfirmFolder(result.folder);
                }
                return;
        }
    };

    const handleOpenFolder = () => {
        window.api.openSyncFolder();
    };

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                Sync Folder
            </h3>

            <div className="bg-surface-800/60 rounded-xl border border-surface-600/30 p-3 space-y-3">
                {/* Status */}
                <div>
                    {folder ? (
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                            <p className="text-xs text-green-400 font-medium">Syncing active</p>
                        </div>
                    ) : (
                        <p className="text-xs text-surface-300 mb-1.5">
                            Not syncing — your board is stored locally on this machine.
                        </p>
                    )}
                    {folder && (
                        <p className="text-[11px] text-white/70 font-mono break-all bg-surface-900/50 rounded-lg px-2.5 py-1.5">
                            {folder}
                        </p>
                    )}
                </div>

                {/* Sounds directory (read-only) */}
                <div>
                    <p className="text-xs text-surface-300 mb-1">Sounds Directory:</p>
                    <p className="text-[11px] text-white/70 font-mono break-all bg-surface-900/50 rounded-lg px-2.5 py-1.5">
                        {soundsDir || 'Loading...'}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={handleChooseFolder}
                        disabled={busy}
                        className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Choose Sync Folder…
                    </button>
                    {folder && (
                        <button
                            onClick={handleOpenFolder}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-xl text-xs font-medium bg-surface-800 text-surface-300 border border-surface-600/30 hover:text-surface-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Open Folder
                        </button>
                    )}
                </div>

                <p className="text-[11px] text-surface-400 leading-relaxed">
                    Point this at a folder inside Nextcloud, iCloud Drive, or a Git repository to use
                    the same sounds and settings on multiple machines. Audio devices, volumes and the
                    remote PIN always stay on this device.
                </p>
            </div>

            {/* Case 3a: empty folder, but there's local data — move it, or start fresh? */}
            {moveDecisionFolder && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={(e) => e.target === e.currentTarget && setMoveDecisionFolder(null)}
                >
                    <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                        <div className="px-5 py-4">
                            <h3 className="text-base font-bold text-white/90 mb-2">
                                Move your soundboard into this folder?
                            </h3>
                            <p className="text-sm text-surface-300">
                                <b>Yes:</b> all sounds and settings are moved into the selected folder
                                and synced from there.
                                <br />
                                <b>No:</b> start with an empty board in the new folder — your current
                                board stays in the app's local storage but will no longer be shown.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 px-5 py-3 border-t border-surface-700/40">
                            <button
                                onClick={() => {
                                    const target = moveDecisionFolder;
                                    setMoveDecisionFolder(null);
                                    applyFolder(target, 'move-local');
                                }}
                                className="w-full px-4 py-2 rounded-xl text-sm font-medium bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition-colors"
                            >
                                Move Everything
                            </button>
                            <button
                                onClick={() => {
                                    const target = moveDecisionFolder;
                                    setMoveDecisionFolder(null);
                                    applyFolder(target, 'fresh');
                                }}
                                className="w-full px-4 py-2 rounded-xl text-sm text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                            >
                                Start Empty
                            </button>
                            <button
                                onClick={() => setMoveDecisionFolder(null)}
                                className="w-full px-4 py-2 rounded-xl text-sm text-surface-500 hover:text-surface-300 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Case 4: folder already has a config, and there's local data — adopt it? */}
            {adoptConfirmFolder && (
                <ConfirmModal
                    title="Adopt configuration from this folder?"
                    message="This folder already contains a HISSOUNDBOARD configuration. The folder's board will be used. Your current local board will not be deleted — it will be backed up inside the app's data directory."
                    confirmLabel="Adopt Folder Config"
                    cancelLabel="Cancel"
                    variant="primary"
                    onConfirm={() => {
                        const target = adoptConfirmFolder;
                        setAdoptConfirmFolder(null);
                        applyFolder(target, 'adopt');
                    }}
                    onCancel={() => setAdoptConfirmFolder(null)}
                />
            )}

            {/* Informational notices (rejections, errors, backup path) — a single
                "OK" dismisses these, so a lighter modal than ConfirmModal fits better. */}
            {notice && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={(e) => e.target === e.currentTarget && setNotice(null)}
                >
                    <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                        <div className="px-5 py-4">
                            <h3 className="text-base font-bold text-white/90 mb-2">{notice.title}</h3>
                            <p className="text-sm text-surface-300 whitespace-pre-line">{notice.message}</p>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-surface-700/40">
                            <button
                                onClick={() => setNotice(null)}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition-colors"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SyncFolderSection;
