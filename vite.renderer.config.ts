import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { pluginExposeRenderer } from '@electron-forge/plugin-vite/dist/config/vite.base.config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig((env) => {
    const forgeEnv = env as ConfigEnv<'renderer'>;
    const { root, mode, forgeConfigSelf } = forgeEnv;
    const name = forgeConfigSelf.name ?? '';

    // Forge sets root to the project dir, but our index.html is in src/renderer/
    const rendererRoot = path.resolve(root, 'src/renderer');

    return mergeConfig(
        {
            root: rendererRoot,
            mode,
            base: './',
            build: {
                outDir: path.resolve(root, `.vite/renderer/${name}`),
            },
            plugins: [pluginExposeRenderer(name)],
            resolve: {
                preserveSymlinks: true,
            },
            clearScreen: false,
        } as UserConfig,
        {
            plugins: [react()],
        } as UserConfig
    );
});
