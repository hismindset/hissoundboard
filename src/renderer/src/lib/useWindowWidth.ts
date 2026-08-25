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

