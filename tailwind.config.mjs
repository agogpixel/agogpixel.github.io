/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cosmos: {
          950: '#030303', // Deep Cosmos Black (master canvas)
          900: '#0a0a0a',
          800: '#141414',
          700: '#1f1f1f',
          600: '#2b2b2b',
        },
        brand: {
          amber: '#C97320',    // Thruster Amber
          scarlet: '#E63946',  // Rocket Scarlet
          cyan: '#4CC9F0',     // Porthole Cyan
          starlight: '#EEEEEE',// Starlight White
        },
        // Compatibility tokens mapped to brand guide
        void: {
          950: '#030303',
          900: '#0a0a0a',
          800: '#141414',
          700: '#1f1f1f',
          600: '#2b2b2b',
        },
        cyber: {
          cyan: '#4CC9F0',     // Porthole Cyan (brand spec)
          neon: '#4CC9F0',
          flame: '#C97320',    // Thruster Amber (brand spec)
          amber: '#C97320',
          scarlet: '#E63946',  // Rocket Scarlet (brand spec)
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
