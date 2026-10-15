import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cosmos: {
          950: '#030303', // Deep Cosmos Black (master canvas)
          900: '#0a0a0a', // Code / surface block
          800: '#141414', // Striped row / subtle fill
          700: '#1f1f1f', // Hairline border
          600: '#2b2b2b', // Structural divider
        },
        brand: {
          starlight: '#EEEEEE',   // Primary typography (L*=94.1, CR=17.78:1)
          lunar: '#A6A6A6',       // Muted metadata & subtitles (L*=68.1, CR=8.47:1)
          charcoal: '#4E4E4E',    // Structural 1px rules & controls (L*=33.2, CR=2.48:1)
          cyan: '#4CC9F0',        // Porthole Cyan primary link/accent (L*=75.8, CR=10.72:1)
          'cyan-dark': '#163A47', // Selection & subtle cyan border (Tol dark role)
          amber: '#C97320',       // Thruster Amber border/plume accent (L*=56.9, CR=5.85:1)
          'amber-ui': '#F09235',  // Calibrated AAA & CVD-safe amber text (L*=69.0, CR=8.71:1)
          'amber-dark': '#3D240C',// Subtle amber callout border/surface (Tol dark role)
          scarlet: '#E63946',     // Rocket Scarlet badge/fin accent (L*=52.1, CR=4.95:1)
          'scarlet-ui': '#EE5566',// Calibrated alert text (L*=57.7, CR=6.02:1)
          'scarlet-dark': '#421419',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [typography],
};
