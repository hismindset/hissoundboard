import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from '@electron-forge/plugin-vite/dist/config/vite.base.config';

export default defineConfig((env) => {
    const forgeEnv = env as ConfigEnv<'build'>;
    const { forgeConfigSelf } = forgeEnv;

    const config: UserConfig = {
        build: {
            rollupOptions: {
                external,
                output: {
                    format: 'cjs',
                    inlineDynamicImports: true,
                    entryFileNames: '[name].js',
                    chunkFileNames: '[name].js',
                    assetFileNames: '[name].[ext]',
                },
            },
        },
        plugins: [pluginHotRestart('reload')],
    };

    return mergeConfig(getBuildConfig(forgeEnv), config);
});
