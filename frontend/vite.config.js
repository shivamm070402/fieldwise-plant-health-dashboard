import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves project sites below /<repository-name>/.
  // Leave the default at / for Netlify and local development.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
});
