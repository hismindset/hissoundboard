import React, { useEffect, useState } from 'react';

interface EasterEggModalProps {
    onClose: () => void;
}

const AUTO_CLOSE_SECONDS = 6;
const RICKROLL_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/**
 * "More Help" easter egg. Opens the real help (™) in the user's default browser
 * — no YouTube embed, so there's no need to spoof the page origin and nothing
 * that bends YouTube's embedding terms. The popup just winks and auto-closes.
 */
const EasterEggModal: React.FC<EasterEggModalProps> = ({ onClose }) => {
    const [remaining, setRemaining] = useState(AUTO_CLOSE_SECONDS);

    useEffect(() => {
        // Open the canonical rickroll in the default browser.
        window.api.openExternal?.(RICKROLL_URL);

        const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
        const closer = setTimeout(onClose, AUTO_CLOSE_SECONDS * 1000);
        return () => {
            clearInterval(tick);
            clearTimeout(closer);
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-sm mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-surface-700/40">
                    <h2 className="text-base font-bold text-white/90 flex items-center gap-2">
                        <span className="text-lg">🎵</span> Here's some real help…
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 py-5 space-y-3 text-center">
                    <div className="text-5xl">🕺</div>
                    <p className="text-sm text-surface-200">
                        We've opened some <em>truly</em> essential guidance in your browser.
                    </p>
                    <p className="text-[12px] text-surface-400">
                        Never gonna give you up. 😄
                    </p>
                    <button
                        onClick={() => window.api.openExternal?.(RICKROLL_URL)}
                        className="text-[12px] text-accent-light underline decoration-dotted underline-offset-2 hover:text-accent transition-colors"
                    >
                        Didn't open? Click here.
                    </button>
                </div>

                <div className="px-5 py-3 border-t border-surface-700/40 text-right text-[12px] text-surface-400">
                    Closing in {remaining}s…
                </div>
            </div>
        </div>
    );
};

export default EasterEggModal;
