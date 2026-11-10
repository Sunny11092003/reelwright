/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F2F4F1',
        surface: '#FFFFFF',
        harbor: { 950: '#0A1F20', 900: '#0E2A2B', 800: '#143A3B', 700: '#1B4D4E', 600: '#23605F', 500: '#2F7A77', 100: '#DCEBE8', 50: '#EEF5F3' },
        marigold: { 500: '#E9A63A', 600: '#CF8F22', 100: '#FBEFD6' },
        ink: { DEFAULT: '#18262A', soft: '#51646A', faint: '#7C8E93', line: '#DDE3E0' },
        signal: { red: '#B3261E', redbg: '#FBE9E7', green: '#1F7A4D', greenbg: '#E3F3EA', amber: '#8A5A00', amberbg: '#FBEFD6', blue: '#1D4E89', bluebg: '#E5EEF8' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: { panel: '0 1px 0 rgba(20,38,42,.04), 0 8px 24px -12px rgba(20,38,42,.18)' },
    },
  },
  plugins: [],
};
