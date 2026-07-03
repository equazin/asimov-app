import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f0f1f4',
          100: '#d9dce3',
          200: '#b3b9c7',
          300: '#8d96ab',
          400: '#67738f',
          500: '#415073',
          600: '#343f5c',
          700: '#272f45',
          800: '#1a1f2e',
          900: '#0d1017',
          950: '#06080b',
        },
        ion: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
      },
    },
  },
  plugins: [],
};

export default config;
