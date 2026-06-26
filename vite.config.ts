import { defineConfig } from 'vite';

export default defineConfig({
  base: '/RayTracer/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
