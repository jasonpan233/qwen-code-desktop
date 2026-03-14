import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer'),
    },
  },
  server: {
    watch: {
      ignored: ['**/QWEN.md'],
    },
  },
});
