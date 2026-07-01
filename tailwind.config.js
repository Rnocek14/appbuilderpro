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
        ember: '0 0 0 1px rgba(255,138,61,.25), 0 8px 32px -8px rgba(255,138,61,.25)',
        emberLg: '0 0 0 1px rgba(255,138,61,.3), 0 16px 48px -12px rgba(255,138,61,.35)',
        // soft depth scale for cards/panels (premium feel without heavy borders)
        soft: '0 1px 2px rgba(0,0,0,.3), 0 1px 1px rgba(0,0,0,.2)',
        lift: '0 12px 32px -12px rgba(0,0,0,.6), 0 2px 8px -4px rgba(0,0,0,.4)',
        liftEmber: '0 12px 32px -10px rgba(255,138,61,.28), 0 2px 8px -4px rgba(0,0,0,.4)'
      },
      backgroundImage: {
        'ember-gradient': 'linear-gradient(135deg, #FF8A3D 0%, #E5631F 100%)',
        'ember-radial': 'radial-gradient(900px 500px at 50% -10%, rgba(255,138,61,.14), transparent 60%)',
        'panel-sheen': 'linear-gradient(180deg, rgba(255,255,255,.03), transparent 40%)'
      },
      transitionTimingFunction: {
        // the product's signature easing — smooth, slightly springy
        forge: 'cubic-bezier(0.22, 1, 0.36, 1)'
      },
      keyframes: {
        emberPulse: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' }
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        emberPulse: 'emberPulse 1.8s ease-in-out infinite',
        fadeInUp: 'fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        scaleIn: 'scaleIn 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite'
      }
    }
  },
  plugins: []
};
