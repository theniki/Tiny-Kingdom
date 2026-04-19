import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 8765,
    host: '127.0.0.1',
    open: false
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: true
  }
});
