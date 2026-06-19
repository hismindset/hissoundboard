import React, { useEffect, useState } from 'react';

interface EasterEggModalProps {
    onClose: () => void;
}

const AUTO_CLOSE_SECONDS = 15;

/**
 * "More Help" easter egg — opens with an autoplaying YouTube embed and closes
 * itself after a short delay. autoplay-with-sound works because the window is
 * created with `autoplayPolicy: 'no-user-gesture-required'` (see main.ts).
 */
const EasterEggModal: React.FC<EasterEggModalProps> = ({ onClose }) => {
    const [remaining, setRemaining] = useState(AUTO_CLOSE_SECONDS);

    useEffect(() => {
        const tick = setInterval(() => {
            setRemaining((r) => Math.max(0, r - 1));
        }, 1000);
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
            <div className="w-full max-w-xl mx-4 bg-surface-900 border border-surface-600/40 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
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

                <div className="aspect-video w-full bg-black">
                    <iframe
                        className="w-full h-full"
                        src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1&playsinline=1"
                        title="More Help"
                        frameBorder={0}
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                    />
                </div>

                <div className="px-5 py-3 flex items-center justify-between text-[12px] text-surface-400">
                    <span>Never gonna give you up. 😄</span>
                    <span>Closing in {remaining}s…</span>
                </div>
            </div>
        </div>
    );
};

export default EasterEggModal;
