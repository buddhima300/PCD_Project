export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F6FB',
        surface: '#FFFFFF',
        mist: '#F1F3F8',
        line: { DEFAULT: '#E5E9F2', strong: '#D3DAE6' },
        ink: { DEFAULT: '#101828', muted: '#566076', subtle: '#8790A4' },
        primary: {
          50: '#EEF3FF',
          100: '#DCE6FE',
          200: '#B9CCFC',
          500: '#3A6CF4',
          600: '#2457E8',
          700: '#1C44C2',
          DEFAULT: '#2457E8',
        },
        success: { 50: '#EAF7EF', 100: '#CFEEDB', 600: '#15803D', DEFAULT: '#16A34A' },
        warning: { 50: '#FEF6E7', 100: '#FBE5BD', 600: '#B45309', DEFAULT: '#D97706' },
        danger: { 50: '#FDEEEE', 100: '#F9D3D3', 600: '#B91C1C', DEFAULT: '#DC2626' },
        violet: { 50: '#F3EFFE', 100: '#E4DAFD', 600: '#6D28D9', DEFAULT: '#7C3AED' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.03)',
        pop: '0 16px 40px -12px rgba(16, 24, 40, 0.22)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
};
