import { useEffect, useState } from 'react';

/** Window widths at which the multi-page view steps up to a wider layout. */
const MULTI_PAGE_BREAKPOINTS = {
    twoPages: 1280,
    threePages: 1800,
} as const;

export const useWindowWidth = (): number => {
    const [width, setWidth] = useState<number>(() => window.innerWidth);

    useEffect(() => {
        let raf = 0;
        const handleResize = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                setWidth(window.innerWidth);
            });
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, []);

    return width;
};

/** Maximum number of pages that fit side-by-side at the given window width. */
export const visiblePageCount = (width: number): 1 | 2 | 3 => {
    if (width >= MULTI_PAGE_BREAKPOINTS.threePages) return 3;
    if (width >= MULTI_PAGE_BREAKPOINTS.twoPages) return 2;
    return 1;
};

export { MULTI_PAGE_BREAKPOINTS };

/** Renders need to know both width and height to choose between horizontal
 *  and grid multi-page layouts (the grid mode uses surplus vertical space
 *  to stack a second/third row of pages — see App.tsx). Returns the inner
 *  window dimensions, updated on `resize` with a rAF debounce so a drag
 *  doesn't trigger one re-render per pixel. */
export interface WindowSize {
    width: number;
    height: number;
}

export const useWindowSize = (): WindowSize => {
    const [size, setSize] = useState<WindowSize>(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }));

    useEffect(() => {
        let raf = 0;
        const handleResize = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                setSize({ width: window.innerWidth, height: window.innerHeight });
            });
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, []);

    return size;
};

