import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@bytepilot\/core\/(.+)/, replacement: path.resolve(__dirname, '..', 'packages', 'core', 'src', '$1') },
      { find: '@bytepilot/core', replacement: path.resolve(__dirname, '..', 'packages', 'core', 'src') },
    ],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // @tauri-apps/api must NOT be external — usePlatform.ts statically
      // imports tauri-adapter.ts which pulls in @tauri-apps/plugin-updater
      // → @tauri-apps/api/core. Externalizing breaks both VS Code and desktop.
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
