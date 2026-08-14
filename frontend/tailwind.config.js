/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        conoflex: {
          orange: '#F05A28',       // Naranja Conoflex
          'orange-hover': '#FF6A38',
          'orange-glow': 'rgba(240, 90, 40, 0.25)',
          bg: '#0f1015',           // Fondo general
          panel: '#161822',        // Paneles laterales
          card: '#1c1f2c',         // Tarjetas centrales
          border: '#2e3347',       // Bordes retro gris
          'border-light': '#454c68',
          text: '#e2e8f0',
          muted: '#7a849e',        // Gris para textos secundarios
          cyan: '#38bdf8',
          green: '#22c55e',
        }
      },
      fontFamily: {
        pixel: ['"Pixelify Sans"', 'cursive'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'pixel-orange': '3px 3px 0px 0px #F05A28',
        'pixel-dark': '4px 4px 0px 0px #08090d',
      }
    },
  },
  plugins: [],
}