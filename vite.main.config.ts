import { defineConfig } from 'vite';
import path from 'path';

// Define MAIN_WINDOW_VITE_* variables to match what Electron Forge provided
// In production, the renderer is built to ../renderer/main_window/index.html relative to main.js
// But since we control the output structure now, we can simplify.
// Let's assume dist/main/main.js and dist/renderer/index.html.

export default defineConfig({
    build: {
        ssr: true,
        sourcemap: true,
        target: 'node16',
        outDir: 'dist/main',
        assetsDir: '.',
        minify: process.env.NODE_ENV === 'production',
        lib: {
            entry: 'src/main/main.ts',
            formats: ['cjs'],
            fileName: () => '[name].js',
        },
        rollupOptions: {
            external: ['electron', 'uiohook-napi', 'express', 'ws', 'http', 'https', 'fs', 'path', 'os', 'child_process', 'bufferutil', 'utf-8-validate', 'electron-squirrel-startup'],
            output: {
                entryFileNames: '[name].js',
            },
        },
        emptyOutDir: true,
        reportCompressedSize: false,
    },
    resolve: {
        mainFields: ['module', 'jsnext:main', 'jsnext'],
    },
    define: {
        // In dev, these are set by the dev server. In prod, we hardcode.
        // Forge set specific paths. We will replicate the expected structure.
        // Main process (dist/main/main.js) needs to find Renderer (dist/renderer/index.html).
        // Relative path: ../renderer/index.html
        'MAIN_WINDOW_VITE_DEV_SERVER_URL': 'undefined',
        'MAIN_WINDOW_VITE_NAME': '"main_window"',
    },
});
