import React, { useState, useRef, useEffect } from 'react';
import { useSoundboardStore } from '../lib/store';
import ModifierSelect from './ModifierSelect';
import { formatModifierKeys } from '../lib/utils';
import type { Page } from '../types/page';

interface PageHeaderProps {
    page: Page;
    isActive: boolean;
    /** When true, the title is shown as the current "primary" page (e.g. left slot in multi-page). */
    emphasis?: boolean;
    onSelect: () => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({ page, isActive, emphasis = false, onSelect }) => {
    const setPageModifier = useSoundboardStore((s) => s.setPageModifier);
    const pages = useSoundboardStore((s) => s.pages);

    const [isRecording, setIsRecording] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isRecording) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsRecording(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isRecording]);

    const handleSaveRecording = (keys: number[]) => {
        setPageModifier(page.id, keys);
        setIsRecording(false);
    };

    return (
        <div
            ref={containerRef}
            className={`
                relative flex items-center justify-between gap-2 px-3 py-2 rounded-lg
                transition-all duration-200
                ${emphasis
                    ? 'bg-surface-900/70 border border-surface-800'
                    : 'bg-surface-900/40 border border-transparent'}
            `}
        >
            <button
                onClick={onSelect}
                className="flex items-center gap-2 min-w-0 flex-1 text-left group"
                title={isActive ? 'Current page' : 'Switch to this page'}
            >
                <div className={`w-1.5 h-4 rounded-full shrink-0 transition-colors ${isActive ? 'bg-accent shadow-glow-active' : 'bg-surface-700 group-hover:bg-surface-500'}`} />
                <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-surface-300 group-hover:text-white'}`}>
                    {page.name}
                </span>
                {page.modifierKeys.length > 0 && (
                    <span className="text-[10px] text-surface-500 font-mono shrink-0">
                        {formatModifierKeys(page.modifierKeys)}
                    </span>
                )}
            </button>

            <button
                onClick={() => setIsRecording(true)}
                className={`p-1.5 rounded-md transition-colors shrink-0 ${page.modifierKeys.length > 0 ? 'text-accent-light bg-accent/10' : 'text-surface-500 hover:text-white hover:bg-surface-700'}`}
                title="Set Trigger Key"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                </svg>
            </button>

            {isRecording && (
                <>
                    <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setIsRecording(false)} />
                    <div className="absolute top-full right-0 mt-2 z-50">
                        <ModifierSelect
                            value={page.modifierKeys}
                            onChange={handleSaveRecording}
                            onCancel={() => setIsRecording(false)}
                            existingPagesValues={pages.filter(p => p.id !== page.id).map(p => p.modifierKeys)}
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default PageHeader;
