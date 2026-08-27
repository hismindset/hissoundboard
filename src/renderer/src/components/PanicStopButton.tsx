import React from 'react';

interface PanicStopButtonProps {
    onPanic: () => void;
}

/**
 * Floating "Stop all sounds" button (bottom-right). Mirrors the Cmd/Ctrl+0
 * panic hotkey so users who prefer the mouse also have a panic stop.
 *
 * Stays subtle while idle; turns into a clear red "Stop" on hover so it
 * never competes with the actual sound tiles for attention, but is still
 * easy to find in a panic.
 */
const PanicStopButton: React.FC<PanicStopButtonProps> = ({ onPanic }) => {
    return (
        <button
            type="button"
            onClick={onPanic}
            title="Stop all sounds (Cmd/Ctrl + 0)"
            aria-label="Stop all sounds"
            className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 h-11 pl-3 pr-4 rounded-full bg-surface-800/85 hover:bg-red-600/90 border border-surface-600/60 hover:border-red-500/70 text-surface-300 hover:text-white shadow-lg shadow-black/40 backdrop-blur-sm transition-all duration-150 hover:scale-[1.03] active:scale-95"
        >
            <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4 transition-colors group-hover:text-white"
                aria-hidden="true"
            >
                <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <span className="text-xs font-medium tracking-wide">
                Stop all
            </span>
        </button>
    );
};

export default PanicStopButton;
