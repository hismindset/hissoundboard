import React from 'react';
import { useSoundboardStore } from '../lib/store';

const NUM_PAGES = 10;

const PageNav: React.FC = () => {
    const currentPage = useSoundboardStore((s) => s.currentPage);
    const setCurrentPage = useSoundboardStore((s) => s.setCurrentPage);
    const sounds = useSoundboardStore((s) => s.sounds);

    // Check which pages have sounds
    const pagesWithSounds = new Set<number>();
    for (const key of Object.keys(sounds)) {
        const page = parseInt(key.split('-')[0]);
        pagesWithSounds.add(page);
    }

    return (
        <div className="flex items-center gap-1.5">
            {Array.from({ length: NUM_PAGES }, (_, i) => {
                const isActive = i === currentPage;
                const hasSounds = pagesWithSounds.has(i);

                return (
                    <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`
              relative w-9 h-9 rounded-lg text-xs font-bold transition-all duration-200
              ${isActive
                                ? 'bg-gradient-to-br from-accent to-accent-dark text-white shadow-glow-purple scale-110'
                                : hasSounds
                                    ? 'bg-surface-700 text-white/80 hover:bg-surface-600 hover:text-white'
                                    : 'bg-surface-800/60 text-surface-400/60 hover:bg-surface-700/60 hover:text-surface-300'
                            }
            `}
                    >
                        {i + 1}
                        {/* Indicator dot for pages with sounds */}
                        {hasSounds && !isActive && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent-glow" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default PageNav;
