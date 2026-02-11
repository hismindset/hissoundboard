/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                surface: {
                    50: '#e8eaf6',
                    100: '#c5cae9',
                    200: '#9fa8da',
                    300: '#7986cb',
                    400: '#5c6bc0',
                    500: '#3f51b5',
                    600: '#303f9f',
                    700: '#1a1f3d',
                    800: '#13152e',
                    900: '#0d0e1f',
                    950: '#080912',
                },
                accent: {
                    DEFAULT: '#7c3aed',
                    light: '#a78bfa',
                    dark: '#5b21b6',
                    glow: '#8b5cf6',
                },
                neon: {
                    blue: '#00d4ff',
                    purple: '#a855f7',
                    pink: '#ec4899',
                    green: '#10b981',
                },
            },
            boxShadow: {
                'glow-purple': '0 0 20px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.2)',
                'glow-blue': '0 0 20px rgba(0, 212, 255, 0.5), 0 0 40px rgba(0, 212, 255, 0.2)',
                'glow-active': '0 0 30px rgba(139, 92, 246, 0.7), 0 0 60px rgba(139, 92, 246, 0.3)',
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
                    '0%, 100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.1)' },
                    '50%': { boxShadow: '0 0 30px rgba(139, 92, 246, 0.7), 0 0 60px rgba(139, 92, 246, 0.3)' },
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
