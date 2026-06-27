import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cube-assets/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
}));
