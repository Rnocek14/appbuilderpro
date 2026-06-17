/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0C0E13',
          panel: '#12151D',
          raised: '#1A1E29',
          border: '#262B3A',
          ink: '#E8E6E1',
          dim: '#8B90A0',
          ember: '#FF8A3D',
          emberDeep: '#E5631F',
          heat: '#FFB573',
          ok: '#4ADE80',
          warn: '#FACC15',
          err: '#F87171'
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        ember: '0 0 0 1px rgba(255,138,61,.25), 0 8px 32px -8px rgba(255,138,61,.25)'
      },
      keyframes: {
        emberPulse: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' }
        }
      },
      animation: { emberPulse: 'emberPulse 1.8s ease-in-out infinite' }
    }
  },
  plugins: []
};
