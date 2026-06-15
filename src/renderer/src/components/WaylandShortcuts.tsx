import React, { useState } from 'react';
import { useSoundboardStore } from '../lib/store';

// Modifier keycode (uiohook) → human label. Left/right variants collapse to one name.
const MOD_LABELS: Record<number, string> = {
    29: 'Ctrl', 3613: 'Ctrl',
    56: 'Alt', 3640: 'Alt',
    42: 'Shift', 54: 'Shift',
    3675: 'Meta', 3676: 'Meta',
};

// Grid slot index → numpad number (mirrors Grid.tsx NUMPAD_LAYOUT).
const NUMPAD_LAYOUT = [7, 8, 9, 4, 5, 6, 1, 2, 3];

// Commands target the local machine, so localhost is stable regardless of network IP.
const BASE_URL = 'http://localhost:8080';

const formatModifiers = (keys: number[]): string => {
    const labels = Array.from(new Set(keys.map((k) => MOD_LABELS[k]).filter(Boolean)));
    return labels.join('+');
};

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            // Use Electron's native clipboard (navigator.clipboard is blocked by the
            // app's permission handler), with a browser fallback just in case.
            if (window.api?.copyToClipboard) {
                await window.api.copyToClipboard(text);
            } else {
                await navigator.clipboard.writeText(text);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            /* clipboard unavailable */
        }
    };
    return (
        <button
            onClick={copy}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-surface-700/70 text-surface-200 hover:bg-accent/30 hover:text-white transition-colors shrink-0"
        >
            {copied ? '✓ Copied' : label || 'Copy'}
        </button>
    );
};

export const WaylandShortcuts: React.FC = () => {
    const pages = useSoundboardStore((s) => s.pages);

    const triggerCmd = (pageId: string, slot: number) =>
        `curl -s "${BASE_URL}/api/trigger/${pageId}/${slot}"`;
    const panicCmd = `curl -s "${BASE_URL}/api/panic"`;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-accent-light uppercase tracking-wider">
                Global Shortcuts (Wayland / KDE)
            </h3>

            <div className="bg-surface-800/60 rounded-xl border border-surface-600/30 p-3 space-y-2 text-[11px] text-surface-300 leading-relaxed">
                <p>
                    On Wayland, apps cannot register global hotkeys directly. Instead, bind these
                    commands once in <b>KDE System Settings → Shortcuts → Add Command…</b>, then
                    assign the suggested key. The soundboard plays the sound when the command runs.
                </p>
                <p className="text-surface-500">
                    Tip: copy a command, create a custom command shortcut, paste it, and press the
                    listed key combo while recording the shortcut. Keep the app running.
                </p>
            </div>

            {/* Panic */}
            <div className="flex items-center justify-between gap-2 bg-surface-800/40 rounded-lg px-3 py-2">
                <div className="min-w-0">
                    <span className="text-xs text-white/80">Stop all (Panic)</span>
                    <code className="block text-[10px] text-surface-400 font-mono truncate">{panicCmd}</code>
                </div>
                <CopyButton text={panicCmd} />
            </div>

            {pages.length === 0 && (
                <p className="text-[11px] text-surface-500">Create a page first to generate its shortcuts.</p>
            )}

            {pages.map((page) => {
                const mod = formatModifiers(page.modifierKeys || []);
                const allCmds = NUMPAD_LAYOUT.map((_, slot) => triggerCmd(page.id, slot)).join('\n');
                return (
                    <details key={page.id} className="bg-surface-800/40 rounded-lg border border-surface-700/40 overflow-hidden">
                        <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-2 select-none">
                            <span className="text-xs text-white/90 truncate">
                                {page.name || 'Page'}{' '}
                                <span className="text-surface-400">
                                    {mod ? `· ${mod} + Numpad` : '· no modifier set'}
                                </span>
                            </span>
                            <span className="text-[10px] text-accent-light shrink-0">9 keys ▾</span>
                        </summary>

                        <div className="px-3 pb-3 pt-1 space-y-1.5">
                            <div className="flex justify-end">
                                <CopyButton text={allCmds} label="Copy all 9 commands" />
                            </div>
                            {NUMPAD_LAYOUT.map((numpadNum, slot) => {
                                const combo = mod ? `${mod} + Numpad ${numpadNum}` : `Numpad ${numpadNum}`;
                                const cmd = triggerCmd(page.id, slot);
                                return (
                                    <div key={slot} className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <span className="text-[11px] text-white/80">{combo}</span>
                                            <code className="block text-[10px] text-surface-400 font-mono truncate">{cmd}</code>
                                        </div>
                                        <CopyButton text={cmd} />
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                );
            })}
        </div>
    );
};
