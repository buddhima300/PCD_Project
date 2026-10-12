export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas, 244 246 251) / <alpha-value>)',
        surface: 'rgb(var(--surface, 255 255 255) / <alpha-value>)',
        mist: 'rgb(var(--mist, 241 243 248) / <alpha-value>)',
        line: { DEFAULT: 'rgb(var(--line, 229 233 242) / <alpha-value>)', strong: 'rgb(var(--line-strong, 211 218 230) / <alpha-value>)' },
        ink: { DEFAULT: 'rgb(var(--ink, 16 24 40) / <alpha-value>)', muted: 'rgb(var(--ink-muted, 86 96 118) / <alpha-value>)', subtle: 'rgb(var(--ink-subtle, 135 144 164) / <alpha-value>)' },
        primary: {
          50: 'rgb(var(--primary-50, 238 243 255) / <alpha-value>)',
          100: 'rgb(var(--primary-100, 220 230 254) / <alpha-value>)',
          200: 'rgb(var(--primary-200, 185 204 252) / <alpha-value>)',
          500: 'rgb(var(--primary-500, 58 108 244) / <alpha-value>)',
          600: 'rgb(var(--primary, 36 87 232) / <alpha-value>)',
          700: 'rgb(var(--primary-700, 28 68 194) / <alpha-value>)',
          DEFAULT: 'rgb(var(--primary, 36 87 232) / <alpha-value>)',
        },
        success: { 50: 'rgb(var(--success-50, 234 247 239) / <alpha-value>)', 100: 'rgb(var(--success-100, 207 238 219) / <alpha-value>)', 600: 'rgb(var(--success-600, 21 128 61) / <alpha-value>)', DEFAULT: 'rgb(var(--success, 22 163 74) / <alpha-value>)' },
        warning: { 50: 'rgb(var(--warning-50, 254 246 231) / <alpha-value>)', 100: 'rgb(var(--warning-100, 251 229 189) / <alpha-value>)', 600: 'rgb(var(--warning-600, 180 83 9) / <alpha-value>)', DEFAULT: 'rgb(var(--warning, 217 119 6) / <alpha-value>)' },
        danger: { 50: 'rgb(var(--danger-50, 253 238 238) / <alpha-value>)', 100: 'rgb(var(--danger-100, 249 211 211) / <alpha-value>)', 600: 'rgb(var(--danger-600, 185 28 28) / <alpha-value>)', DEFAULT: 'rgb(var(--danger, 220 38 38) / <alpha-value>)' },
        violet: { 50: 'rgb(var(--violet-50, 243 239 254) / <alpha-value>)', 100: 'rgb(var(--violet-100, 228 218 253) / <alpha-value>)', 600: 'rgb(var(--violet-600, 109 40 217) / <alpha-value>)', DEFAULT: 'rgb(var(--violet, 124 58 237) / <alpha-value>)' },
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
