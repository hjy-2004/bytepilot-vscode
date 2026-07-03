/**
 * Build the BytePilot sidecar process.
 * Bundles the core engine + Tauri platform adapters into a single JS file
 * that Tauri launches as a sidecar.
 */
import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.resolve(__dirname, 'src', 'sidecar.ts')],
  bundle: true,
  outfile: path.resolve(__dirname, 'dist-sidecar', 'sidecar.js'),
  platform: 'node',
  target: 'node18',
  format: 'esm',
  alias: {
    '@bytepilot/core': path.resolve(__dirname, '..', 'core', 'dist'),
  },
  external: [
    '@tauri-apps/api',
    '@tauri-apps/plugin-fs',
    '@tauri-apps/plugin-shell',
    '@tauri-apps/plugin-store',
  ],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
});

console.log('[sidecar] Build complete.');
