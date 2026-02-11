import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from '@electron-forge/plugin-vite/dist/config/vite.base.config';

export default defineConfig((env) => {
    const forgeEnv = env as ConfigEnv<'build'>;
    const { forgeConfigSelf } = forgeEnv;

    const define = getBuildDefine(forgeEnv);

    const config: UserConfig = {
        build: {
            lib: {
                entry: forgeConfigSelf.entry!,
                fileName: () => '[name].js',
                formats: ['cjs'],
            },
            rollupOptions: {
                external: [...external, 'bufferutil', 'utf-8-validate', 'uiohook-napi'],
            },
        },
        plugins: [pluginHotRestart('restart')],
        define,
        resolve: {
            mainFields: ['module', 'jsnext:main', 'jsnext'],
        },
    };

    return mergeConfig(getBuildConfig(forgeEnv), config);
});
