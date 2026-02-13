const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = {
    hooks: {
        packageAfterPrune: async (_config, buildPath) => {
            const uiohookSrc = path.resolve(__dirname, 'node_modules', 'uiohook-napi');
            const uiohookDest = path.join(buildPath, 'node_modules', 'uiohook-napi');

            if (fs.existsSync(uiohookSrc)) {
                // Ensure destination node_modules exists
                if (!fs.existsSync(path.dirname(uiohookDest))) {
                    fs.mkdirSync(path.dirname(uiohookDest), { recursive: true });
                }

                console.log(`Copying uiohook-napi from ${uiohookSrc} to ${uiohookDest}`);
                fs.cpSync(uiohookSrc, uiohookDest, { recursive: true });

                // Manually sign the native module for macOS arm64
                if (process.platform === 'darwin') {
                    const uiohookBinary = path.join(uiohookDest, 'build', 'Release', 'uiohook_napi.node');
                    if (fs.existsSync(uiohookBinary)) {
                        console.log(`Signing ${uiohookBinary}...`);
                        try {
                            execSync(`codesign -s - --force "${uiohookBinary}"`);
                            console.log('Successfully signed uiohook_napi.node');
                        } catch (err) {
                            console.error('Failed to sign uiohook_napi.node:', err);
                        }
                    }
                }
            } else {
                console.error('Could not find uiohook-napi to copy');
            }
        },
    },
    packagerConfig: {
        asar: {
            unpack: "**/node_modules/uiohook-napi/**"
        },
        icon: './resources/icon',
        executableName: 'opensoundboard',
        osxSign: {
            identity: 'Developer ID Application', // Will be ignored if not found, falling back to ad-hoc
            entitlements: './entitlements.plist',
            'entitlements-inherit': './entitlements.plist',
        },
        ...(process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID
            ? {
                osxNotarize: {
                    tool: 'notarytool',
                    appleId: process.env.APPLE_ID,
                    appleIdPassword: process.env.APPLE_PASSWORD,
                    teamId: process.env.APPLE_TEAM_ID,
                },
            }
            : {}),
    },
    rebuildConfig: {
        force: true,
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'opensoundboard',
                setupIcon: './resources/icon.ico',
                ...(process.env.WINDOWS_CERT_PATH && process.env.WINDOWS_CERT_PASSWORD
                    ? {
                        certificateFile: process.env.WINDOWS_CERT_PATH,
                        certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
                    }
                    : {}),
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'win32', 'linux'],
        },
        {
            name: '@electron-forge/maker-deb',
            config: {
                options: {
                    icon: './resources/icon.png',
                    bin: 'opensoundboard',
                },
            },
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {
                options: {
                    icon: './resources/icon.png',
                    bin: 'opensoundboard',
                },
            },
        },
        {
            name: "@electron-forge/maker-dmg",
            config: {
                icon: "./resources/icon.icns",
                format: "ULFO"
            }
        }
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        {
            name: '@electron-forge/plugin-vite',
            config: {
                build: [
                    {
                        entry: 'src/main/main.ts',
                        config: 'vite.main.config.ts',
                    },
                    {
                        entry: 'src/preload/preload.ts',
                        config: 'vite.preload.config.ts',
                    },
                ],
                renderer: [
                    {
                        name: 'main_window',
                        config: 'vite.renderer.config.ts',
                    },
                ],
            },
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};
