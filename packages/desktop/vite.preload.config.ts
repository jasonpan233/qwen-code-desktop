import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@preload': path.resolve(__dirname, './src/preload'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // With "type": "module" in package.json, CJS preload must use .cjs extension
        entryFileNames: '[name].cjs',
        chunkFileNames: '[name].cjs',
      },
    },
  },
});
