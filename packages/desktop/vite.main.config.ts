import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, './src/main'),
    },
  },
  define: {
    // ESM output has no __dirname; replace with import.meta.dirname
    // (available in Node.js 20.11+ / Electron 40's Node.js 22)
    __dirname: 'import.meta.dirname',
  },
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['es'],
      fileName: () => '[name].js',
    },
    rollupOptions: {
      external: [
        // ws optional native deps – not installed, must be externalized
        'bufferutil',
        'utf-8-validate',
      ],
    },
  },
});
