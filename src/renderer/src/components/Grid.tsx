import React from 'react';
import SoundCell from './SoundCell';
import { useSoundboardStore } from '../lib/store';

// Numpad layout mapping: grid positions to numpad numbers
// Grid goes top-left to bottom-right, numpad goes bottom-left to top-right
const NUMPAD_LAYOUT = [7, 8, 9, 4, 5, 6, 1, 2, 3];

interface GridProps {
    pageId: string;
    onEditSound: (soundId: string) => void;
    onEditEffect: (presetId: string) => void;
}

const Grid: React.FC<GridProps> = ({ pageId, onEditSound, onEditEffect }) => {
    // The active page id is used purely for the empty-state hint. The actual
    // grid renders whatever pageId was passed in, so this component can be
    // reused for every page visible in multi-page view.
    const activePageId = useSoundboardStore((s) => s.activePageId);

    // If no page is active (e.g. empty state), show nothing or a placeholder
    if (!pageId) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-surface-500 gap-2">
                <p>No active page.</p>
                <p className="text-xs">Create a page in the sidebar to get started.</p>
            </div>
        );
    }

    return (
        <div
            className="grid grid-cols-3 gap-3 w-full max-w-[480px] animate-fade-in"
            data-page-id={pageId}
            data-active={pageId === activePageId ? 'true' : 'false'}
        >
            {NUMPAD_LAYOUT.map((numpadNum, gridIndex) => (
                <SoundCell
                    key={`${pageId}-${gridIndex}`}
                    page={pageId}
                    slot={gridIndex}
                    numpadLabel={numpadNum}
                    onEditSound={onEditSound}
                    onEditEffect={onEditEffect}
                />
            ))}
        </div>
    );
};

export default Grid;
