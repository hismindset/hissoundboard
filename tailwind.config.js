/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // hismindset-branded dark green-grey scale
                surface: {
                    50: '#eef2ef',
                    100: '#d8e0db',
                    200: '#b6c2ba',
                    300: '#8a9a8f',
                    400: '#5a6b5f',
                    500: '#3d4a41',
                    600: '#2f3a33',
                    700: '#232c26',
                    800: '#1a211c',
                    900: '#121712',
                    950: '#0c100d',
                },
                // hismindset brand green
                accent: {
                    DEFAULT: '#2a6c33',
                    light: '#5cae6b',
                    dark: '#1a3622',
                    glow: '#3f9a4d',
                },
                // hismindset secondary brand colors
                brand: {
                    green: '#2a6c33',
                    greenDark: '#1a3622',
                    surface: '#2d332f',
                    sand: '#d4a373',
                },
                neon: {
                    blue: '#00d4ff',
                    purple: '#a855f7',
                    pink: '#ec4899',
                    green: '#10b981',
                },
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
                heading: ['Jost', 'Inter', 'sans-serif'],
            },
            boxShadow: {
                'glow-purple': '0 0 20px rgba(63, 154, 77, 0.5), 0 0 40px rgba(63, 154, 77, 0.2)',
                'glow-blue': '0 0 20px rgba(0, 212, 255, 0.5), 0 0 40px rgba(0, 212, 255, 0.2)',
                'glow-active': '0 0 30px rgba(63, 154, 77, 0.7), 0 0 60px rgba(63, 154, 77, 0.3)',
                'neumorphic': '8px 8px 16px rgba(0, 0, 0, 0.4), -8px -8px 16px rgba(255, 255, 255, 0.03)',
                'neumorphic-inset': 'inset 4px 4px 8px rgba(0, 0, 0, 0.4), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
            },
            animation: {
                'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
                'fade-in': 'fadeIn 0.3s ease-out',
                'scale-in': 'scaleIn 0.2s ease-out',
            },
            keyframes: {
                pulseGlow: {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(63, 154, 77, 0.4), 0 0 40px rgba(63, 154, 77, 0.1)' },
                    '50%': { boxShadow: '0 0 30px rgba(63, 154, 77, 0.7), 0 0 60px rgba(63, 154, 77, 0.3)' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                scaleIn: {
                    '0%': { transform: 'scale(0.95)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};
