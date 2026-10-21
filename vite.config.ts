import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para que el build funcione en GitHub Pages o abriendo dist/ en cualquier ruta
export default defineConfig({
  base: './',
  plugins: [react()],
});
