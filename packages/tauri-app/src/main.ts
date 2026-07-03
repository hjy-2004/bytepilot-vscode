/**
 * BytePilot Tauri Desktop App — Entry Point.
 *
 * This file is loaded by the Tauri webview when the app starts.
 * It initializes the platform context and renders the shared React UI.
 *
 * In production, this replaces the VS Code-specific main.tsx in webview-ui.
 * For development, the webview-ui's own main.tsx is used with the Tauri adapter.
 */
import { createTauriPlatformContext } from './platform/index';

// Initialize platform context early
createTauriPlatformContext()
  .then((ctx) => {
    console.log('[BytePilot] Tauri platform context initialized.');
    console.log('[BytePilot] Workspace:', ctx.workspaceRoot);
    // Store in global for access by the React app
    (window as any).__bytepilotPlatform = ctx;
  })
  .catch((err) => {
    console.error('[BytePilot] Failed to initialize platform context:', err);
  });

// The React app (shared webview-ui) is loaded separately by Tauri.
// The webview-ui's usePlatform() hook detects window.__TAURI__ and
// switches to the Tauri adapter automatically.
