import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef6f4', 100: '#d5ebe6', 500: '#1f7a6b', 600: '#17665a', 700: '#125248', 900: '#0b332d' },
      },
    },
  },
  plugins: [],
};
export default config;
