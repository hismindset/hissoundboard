import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        ssr: true,
        sourcemap: true,
        target: 'chrome120', // Preload runs in renderer context but with Node access
        outDir: 'dist/preload',
        assetsDir: '.',
        minify: process.env.NODE_ENV === 'production',
        lib: {
            entry: 'src/preload/preload.ts',
            formats: ['cjs'],
            fileName: () => '[name].js',
        },
        rollupOptions: {
            external: ['electron'],
            output: {
                entryFileNames: '[name].js',
            },
        },
        emptyOutDir: true,
        reportCompressedSize: false,
    },
});
