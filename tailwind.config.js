/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Azeret Mono', 'JetBrains Mono', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
