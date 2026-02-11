import React from 'react';
import SoundCell from './SoundCell';
import { useSoundboardStore } from '../lib/store';

// Numpad layout mapping: grid positions to numpad numbers
// Grid goes top-left to bottom-right, numpad goes bottom-left to top-right
const NUMPAD_LAYOUT = [7, 8, 9, 4, 5, 6, 1, 2, 3];

const Grid: React.FC = () => {
    const currentPage = useSoundboardStore((s) => s.currentPage);

    return (
        <div className="grid grid-cols-3 gap-3 w-full max-w-[480px] animate-fade-in">
            {NUMPAD_LAYOUT.map((numpadNum, gridIndex) => (
                <SoundCell
                    key={`${currentPage}-${gridIndex}`}
                    page={currentPage}
                    slot={gridIndex}
                    numpadLabel={numpadNum}
                />
            ))}
        </div>
    );
};

export default Grid;
