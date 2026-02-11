import type { ApiType } from '../../preload/preload';

declare global {
    interface Window {
        api: ApiType;
    }
}
