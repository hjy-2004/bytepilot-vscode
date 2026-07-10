/**
 * Vite config for the Tauri desktop build.
 * Uses index.desktop.html as the entry point (→ main-desktop.tsx).
 *
 * Invoked via:  npm run build:desktop  (in webview-ui/package.json)
 *
 * The VS Code extension build uses the default vite.config.ts with
 * index.html (→ main.tsx) and is unaffected by this file.
 */
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
    outDir: 'dist-desktop',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.desktop.html'),
      // @tauri-apps/api must NOT be external — it is statically imported
      // via tauri-adapter → @tauri-apps/plugin-updater → @tauri-apps/api/core.
      // Externalizing it leaves bare module specifiers that browsers can't resolve.
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
