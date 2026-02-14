import React, { useState, useEffect } from 'react';

interface KeyRecorderProps {
    value: number[];
    onChange: (keys: number[]) => void;
    onCancel: () => void;
    existingPagesValues: number[][]; // To check duplicates
}

const KeyRecorder: React.FC<KeyRecorderProps> = ({ value, onChange, onCancel, existingPagesValues }) => {
    const [recordedKeys, setRecordedKeys] = useState<number[]>(value || []);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Start recording
        window.api.startRecordingKeys();

        const cleanup = window.api.onKeyRecorded((keyCode) => {
            // Update recorded keys directly
            // We want to capture a combination.
            // If user presses Ctrl, then Alt, we want [Ctrl, Alt].
            // If they release? 
            // The recorder should probably accumulate keys until they click "Done"?
            // Or just snapshot the currently held keys? 
            // The prompt says: "User presses a combination... If unique: Save it."
            // Usually, you press keys, and the display shows them.
            // Since we receive one key code at a time from main, we can't easily know "currently held" without state in main mirroring or tracking here.
            // Main process sends `key-recorded` on KEYDOWN.

            setRecordedKeys((prev) => {
                if (prev.includes(keyCode)) return prev;
                return [...prev, keyCode].sort((a, b) => a - b);
            });
            setError(null);
        });

        return () => {
            window.api.stopRecordingKeys();
            cleanup();
        };
    }, []);

    const handleClear = () => {
        setRecordedKeys([]);
        setError(null);
    };

    const handleSave = () => {
        if (recordedKeys.length === 0) {
            // Allow empty? Maybe (no modifier = direct access? But likely implies no shortcut)
            onChange([]);
            return;
        }

        // Check duplicates
        const isDuplicate = existingPagesValues.some(existing => {
            if (existing.length !== recordedKeys.length) return false;
            // Arrays are sorted
            return existing.every((k, i) => k === recordedKeys[i]);
        });

        if (isDuplicate) {
            setError('Combination already used!');
            return;
        }

        onChange(recordedKeys);
    };

    // Helper to format keycodes (very basic mapping for display)
    const formatKey = (code: number) => {
        // Simple mapping based on known uiohook codes or common ones
        // In a real app we'd import the enum or have a map.
        // For now, let's just show ID or guess.
        // Known: 29=LCtrl, 56=LAlt, 42=LShift, 3675=LMeta (example)
        // We can just show "Key Combined" or use a helper.
        // For UI, better to show something string-like.
        // Let's create a small local map or use the one from main if we could share it.
        // I'll just use a small map here.
        const MAP: Record<number, string> = {
            29: 'Ctrl',
            3613: 'RCtrl',
            56: 'Alt',
            3640: 'RAlt',
            42: 'Shift',
            54: 'RShift',
            3675: 'Meta',
            3676: 'RMeta',
            // fill others as needed or show code
        };
        return MAP[code] || `Key${code}`;
    };

    return (
        <div className="flex flex-col gap-2 p-2 bg-surface-800 rounded-lg border border-surface-600 shadow-xl min-w-[200px]">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-surface-300">Set Trigger</span>
                <span className="text-[10px] text-accent animate-pulse">Listening...</span>
            </div>

            <div className="flex flex-wrap gap-1 min-h-[30px] p-1 bg-surface-900 rounded border border-surface-700 items-center">
                {recordedKeys.length === 0 ? (
                    <span className="text-[10px] text-surface-600 italic px-1">Press modifiers...</span>
                ) : (
                    recordedKeys.map(k => (
                        <span key={k} className="px-1.5 py-0.5 bg-surface-700 rounded text-[10px] font-mono text-white">
                            {formatKey(k)}
                        </span>
                    ))
                )}
            </div>

            {error && <span className="text-[10px] text-red-400 font-medium">{error}</span>}

            <div className="flex gap-2 mt-1">
                <button onClick={handleClear} className="flex-1 py-1 text-[10px] bg-surface-700 hover:bg-surface-600 rounded text-surface-300">Clear</button>
                <button onClick={onCancel} className="flex-1 py-1 text-[10px] bg-surface-700 hover:bg-surface-600 rounded text-surface-300">Cancel</button>
                <button onClick={handleSave} className="flex-1 py-1 text-[10px] bg-accent hover:bg-accent-light rounded text-white font-medium">Save</button>
            </div>
        </div>
    );
};

export default KeyRecorder;
