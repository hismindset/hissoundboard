import React, { useState, useRef, useEffect } from 'react';
import { useSoundboardStore } from '../lib/store';
import { Page } from '../types/page';
import ModifierSelect from './ModifierSelect';
import logoUrl from '../assets/hismindset_white.png';

const PageList: React.FC = () => {
    const pages = useSoundboardStore((s) => s.pages);
    const activePageId = useSoundboardStore((s) => s.activePageId);
    const setActivePage = useSoundboardStore((s) => s.setActivePage);
    const addPage = useSoundboardStore((s) => s.addPage);
    const removePage = useSoundboardStore((s) => s.removePage);
    const renamePage = useSoundboardStore((s) => s.renamePage);
    const setPageModifier = useSoundboardStore((s) => s.setPageModifier);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [recordingId, setRecordingId] = useState<string | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // Focus input when editing starts
    useEffect(() => {
        if (editingId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingId]);

    const handleStartEdit = (e: React.MouseEvent, page: Page) => {
        e.stopPropagation();
        setEditingId(page.id);
        setEditName(page.name);
    };

    const handleSaveEdit = () => {
        if (editingId && editName.trim()) {
            renamePage(editingId, editName.trim());
        }
        setEditingId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSaveEdit();
        if (e.key === 'Escape') setEditingId(null);
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this page? Sounds will be unlinked but not deleted from library.')) {
            removePage(id);
        }
    };

    const handleStartRecording = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setRecordingId(id);
    };

    const handleSaveRecording = (keys: number[]) => {
        if (recordingId) {
            setPageModifier(recordingId, keys);
        }
        setRecordingId(null);
    };

    const formatKeys = (keys: number[]) => {
        if (!keys || keys.length === 0) return '';
        // Same simple mapping
        const MAP: Record<number, string> = {
            29: 'Ctrl', 3613: 'RCtrl',
            56: 'Alt', 3640: 'RAlt',
            42: 'Shift', 54: 'RShift',
            3675: 'Meta', 3676: 'RMeta',
        };
        return keys.map(k => MAP[k] || 'Key').join('+');
    };

    return (
        <div className="w-64 bg-surface-900 border-r border-surface-800 flex flex-col h-full select-none">
            <div className="p-4 border-b border-surface-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-surface-400 uppercase tracking-wider">Pages</h2>
                <button
                    onClick={() => addPage()}
                    className="p-1.5 rounded-md bg-surface-800 text-surface-400 hover:bg-accent hover:text-white transition-all"
                    title="Add Page"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {pages.map((page) => {
                    const isActive = page.id === activePageId;
                    const isEditing = page.id === editingId;
                    const isRecording = page.id === recordingId;

                    return (
                        <div
                            key={page.id}
                            className={`relative group rounded-lg transition-all duration-200 ${isActive ? 'bg-accent/10 border border-accent/20' : 'hover:bg-surface-800 border border-transparent'}`}
                        >
                            <div
                                onClick={() => !isEditing && !isRecording && setActivePage(page.id)}
                                className="flex items-center justify-between px-3 py-2 cursor-pointer"
                            >
                                {isEditing ? (
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onBlur={handleSaveEdit}
                                        onKeyDown={handleKeyDown}
                                        className="flex-1 bg-surface-950 text-white text-sm px-2 py-1 rounded border border-accent/50 focus:outline-none"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <>
                                        <div className="flex flex-col overflow-hidden max-w-[140px]">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1 h-2 rounded-full transition-colors ${isActive ? 'bg-accent' : 'bg-transparent'}`} />
                                                <span className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
                                                    {page.name}
                                                </span>
                                            </div>
                                            {/* Shortcut Display */}
                                            {page.modifierKeys.length > 0 && (
                                                <span className="text-[10px] text-surface-500 font-mono ml-3 truncate">
                                                    {formatKeys(page.modifierKeys)}
                                                </span>
                                            )}
                                        </div>

                                        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`}>
                                            {/* Key Button */}
                                            <button
                                                onClick={(e) => handleStartRecording(e, page.id)}
                                                className={`p-1 rounded ${page.modifierKeys.length > 0 ? 'text-accent-light' : 'text-surface-500'} hover:text-white hover:bg-surface-700`}
                                                title="Set Trigger Key"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                                                </svg>
                                            </button>
                                            {/* Edit Button */}
                                            <button
                                                onClick={(e) => handleStartEdit(e, page)}
                                                className="p-1 rounded text-surface-500 hover:text-white hover:bg-surface-700"
                                                title="Rename"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                                </svg>
                                            </button>
                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => handleDelete(e, page.id)}
                                                className="p-1 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10"
                                                title="Delete"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Recorder Overlay (Popover) */}
                            {isRecording && (
                                <div className="absolute top-10 left-4 z-50">
                                    <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setRecordingId(null)} />
                                    <div className="relative z-50">
                                        <ModifierSelect
                                            value={page.modifierKeys}
                                            onChange={handleSaveRecording}
                                            onCancel={() => setRecordingId(null)}
                                            existingPagesValues={pages.filter(p => p.id !== page.id).map(p => p.modifierKeys)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* hismindset brand footer (subtle, opens the website) */}
            <button
                onClick={() => window.api.openExternal?.('https://hismindset.de')}
                title="hismindset.de öffnen"
                className="group flex items-center gap-2 px-4 py-3 border-t border-surface-800 opacity-60 hover:opacity-100 transition-opacity"
            >
                <img src={logoUrl} alt="hismindset" className="w-6 h-6 object-contain shrink-0" />
                <span className="text-[10px] text-surface-400 group-hover:text-accent-light tracking-[0.15em] uppercase">
                    by hismindset
                </span>
            </button>
        </div>
    );
};

export default PageList;
