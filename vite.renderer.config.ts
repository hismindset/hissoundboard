import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    root: path.resolve(__dirname, 'src/renderer'),
    mode: process.env.NODE_ENV,
    base: './',
    build: {
        outDir: path.resolve(__dirname, 'dist/renderer/main_window'),
        assetsDir: '.',
        minify: true,
        reportCompressedSize: false,
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(__dirname, 'src/renderer/index.html'),
        }
    },
    plugins: [react()],
    resolve: {
        preserveSymlinks: true,
    },
    server: {
        port: 5173,
    },
});
