// Per-machine UI preferences for the multi-page view. Kept intentionally
// separate from `store.ts` (which is sync-folder-backed) because the layout
// choice depends on the *local* monitor — the same layout wouldn't fit a
// WQHD monitor and a laptop screen, so it must NOT follow the user across
// the sync folder to other devices.
//
// Persistence: renderer-only localStorage under LAYOUT_PREFS_STORAGE_KEY.
// No IPC, no main-process file writes, no schema migrations.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * "single"  — only the active page is shown (the original <1280px look).
 *             Independent of window size.
 * "row"     — current default: columns scale with width (1/2/3 at 1280/1800),
 *             always exactly 1 row. Slide back if at the end.
 * "rowcol"  — columns × rows both scale to the window. rows derived from
 *             viewport height (1/2/3 at <900/≥900/≥1300 px). Pages that
 *             don't fit are hidden — the active page is always kept visible.
 *             No scrolling. Best for a 2560×1440 monitor with 6+ pages.
 * "all"     — columns from width, every page rendered; the outer container
 *             scrolls vertically to reach the rest. Same look as rowcol but
 *             never hides anything.
 */
export type MultiPageLayoutMode = 'single' | 'row' | 'rowcol' | 'all';

export const LAYOUT_PREFS_STORAGE_KEY = 'hissoundboard-layout-prefs';

export interface MultiPageLayoutOption {
    value: MultiPageLayoutMode;
    label: string;
    description: string;
}

export const LAYOUT_OPTIONS: MultiPageLayoutOption[] = [
    { value: 'single', label: 'Single', description: 'Only the active page' },
    { value: 'row', label: 'Row', description: 'Side-by-side, one row' },
    { value: 'rowcol', label: 'Auto-fit', description: 'Rows × columns from window size' },
    { value: 'all', label: 'All', description: 'All pages, scrollable' },
];

interface LayoutPrefsState {
    multiPageLayoutMode: MultiPageLayoutMode;
    setMultiPageLayoutMode: (mode: MultiPageLayoutMode) => void;
}

export const createLayoutPrefsStore = create<LayoutPrefsState>()(
    persist(
        (set) => ({
            multiPageLayoutMode: 'rowcol',
            setMultiPageLayoutMode: (mode) => set({ multiPageLayoutMode: mode }),
        }),
        {
            name: LAYOUT_PREFS_STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            // Pinned so future enum additions don't silently downgrade a
            // user's saved preference on first read.
            version: 1,
        }
    )
);