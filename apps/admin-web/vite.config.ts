import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: process.env.ADMIN_BASE || './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  },
  server: { port: 5174 }
});
