import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@bytepilot/core': path.resolve(__dirname, '..', 'packages', 'core', 'src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: ['@tauri-apps/api', '@tauri-apps/api/core', '@tauri-apps/api/event'],
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
