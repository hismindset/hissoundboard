import React, { useCallback, useMemo } from 'react';
import { useSoundboardStore } from '../lib/store';

interface ConfirmModalProps {
    title: string;
    message: string;
    /** Extra warning lines (e.g. "This sound is used at Page 1 Slot 3") */
    warnings?: string[];
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    title,
    message,
    warnings,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
}) => {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
            <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                <div className="px-5 py-4">
                    <h3 className="text-base font-bold text-white/90 mb-2">{title}</h3>
                    <p className="text-sm text-surface-300">{message}</p>
                    {warnings && warnings.length > 0 && (
                        <div className="mt-3 space-y-1">
                            {warnings.map((w, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"
                                >
                                    <span className="shrink-0 mt-0.5">⚠</span>
                                    <span>{w}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-surface-700/40">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;

/**
 * Hook to get all grid positions where a sound is used.
 * Returns array of { page, slot } objects.
 */
export function useSoundUsageInfo(soundId: string): { page: number; slot: number }[] {
    const grid = useSoundboardStore((s) => s.grid);
    return useMemo(() => {
        const usage: { page: number; slot: number }[] = [];
        for (const [key, id] of Object.entries(grid)) {
            if (id === soundId) {
                const [pageStr, slotStr] = key.split('-');
                usage.push({ page: parseInt(pageStr), slot: parseInt(slotStr) });
            }
        }
        return usage.sort((a, b) => a.page - b.page || a.slot - b.slot);
    }, [grid, soundId]);
}
