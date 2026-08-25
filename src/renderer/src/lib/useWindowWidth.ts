import { useEffect, useState } from 'react';

const MULTI_PAGE_BREAKPOINT = 1280;

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

export const isMultiPageWidth = (width: number): boolean => width >= MULTI_PAGE_BREAKPOINT;
