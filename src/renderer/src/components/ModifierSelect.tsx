import React, { useState } from 'react';

interface ModifierSelectProps {
    value: number[];
    onChange: (keys: number[]) => void;
    onCancel: () => void;
    existingPagesValues: number[][]; // To check duplicates
}

// Canonical (left) uiohook keycodes per modifier. Works on X11, Wayland and the
// HTTP-trigger path alike — no key recording needed.
const MODIFIERS: { code: number; label: string }[] = [
    { code: 29, label: 'Ctrl' },
    { code: 56, label: 'Alt' },
    { code: 42, label: 'Shift' },
    { code: 3675, label: 'Meta' },
];

const sameSet = (a: number[], b: number[]) =>
    a.length === b.length && a.every((k) => b.includes(k));

/**
 * Modifier picker using toggle chips instead of live key capture, so it works
 * under Wayland (where global key recording is blocked).
 */
const ModifierSelect: React.FC<ModifierSelectProps> = ({ value, onChange, onCancel, existingPagesValues }) => {
    const [selected, setSelected] = useState<number[]>(value || []);
    const [error, setError] = useState<string | null>(null);

    const toggle = (code: number) => {
        setError(null);
        setSelected((prev) =>
            prev.includes(code)
                ? prev.filter((c) => c !== code)
                : [...prev, code].sort((a, b) => a - b)
        );
    };

    const handleSave = () => {
        if (selected.length > 0 && existingPagesValues.some((existing) => sameSet(existing, selected))) {
            setError('Combination already used!');
            return;
        }
        onChange(selected);
    };

    return (
        <div className="flex flex-col gap-2 p-2 bg-surface-800 rounded-lg border border-surface-600 shadow-xl min-w-[220px]">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-surface-300">Set Trigger</span>
                <span className="text-[10px] text-surface-500">Tap to combine</span>
            </div>

            <div className="grid grid-cols-4 gap-1">
                {MODIFIERS.map((m) => {
                    const active = selected.includes(m.code);
                    return (
                        <button
                            key={m.code}
                            onClick={() => toggle(m.code)}
                            className={`py-1.5 rounded text-[11px] font-medium transition-colors border ${
                                active
                                    ? 'bg-accent/30 text-white border-accent/50'
                                    : 'bg-surface-900 text-surface-400 border-surface-700 hover:text-surface-200'
                            }`}
                        >
                            {m.label}
                        </button>
                    );
                })}
            </div>

            <div className="text-[10px] text-surface-500 min-h-[14px]">
                {selected.length === 0
                    ? 'No modifier (numpad keys trigger directly)'
                    : `Trigger: ${MODIFIERS.filter((m) => selected.includes(m.code)).map((m) => m.label).join(' + ')} + Numpad`}
            </div>

            {error && <span className="text-[10px] text-red-400 font-medium">{error}</span>}

            <div className="flex gap-2 mt-1">
                <button onClick={() => { setSelected([]); setError(null); }} className="flex-1 py-1 text-[10px] bg-surface-700 hover:bg-surface-600 rounded text-surface-300">Clear</button>
                <button onClick={onCancel} className="flex-1 py-1 text-[10px] bg-surface-700 hover:bg-surface-600 rounded text-surface-300">Cancel</button>
                <button onClick={handleSave} className="flex-1 py-1 text-[10px] bg-accent hover:bg-accent-light rounded text-white font-medium">Save</button>
            </div>
        </div>
    );
};

export default ModifierSelect;
