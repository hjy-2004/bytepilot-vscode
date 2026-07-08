export type ThemeMode = 'light' | 'dark' | 'custom';

export interface ThemeCategory {
  name: string;
  vars: ThemeVarDef[];
}

export interface ThemeVarDef {
  name: string;   // CSS custom property name, e.g. "--bytepilot-bg-primary"
  label: string;  // human-readable label, e.g. "Page background"
}

/** All CSS variables exposed in the theme editor, grouped by category. */
export const THEME_CATEGORIES: ThemeCategory[] = [
  {
    name: 'Surface',
    vars: [
      { name: '--bytepilot-bg-primary', label: 'Page background' },
      { name: '--bytepilot-bg-secondary', label: 'Sidebar / topbar' },
      { name: '--bytepilot-input-bg', label: 'Input background' },
      { name: '--bytepilot-code-bg', label: 'Code block' },
      { name: '--bytepilot-border', label: 'Borders / dividers' },
      { name: '--bytepilot-focus-border', label: 'Focus ring' },
    ],
  },
  {
    name: 'Text',
    vars: [
      { name: '--bytepilot-fg-primary', label: 'Primary text' },
      { name: '--bytepilot-fg-secondary', label: 'Secondary text' },
      { name: '--bytepilot-input-fg', label: 'Input text' },
      { name: '--bytepilot-input-border', label: 'Input border' },
    ],
  },
  {
    name: 'Buttons',
    vars: [
      { name: '--bytepilot-btn-bg', label: 'Primary btn bg' },
      { name: '--bytepilot-btn-fg', label: 'Primary btn text' },
      { name: '--bytepilot-btn-hover', label: 'Primary btn hover' },
      { name: '--bytepilot-btn-secondary-bg', label: 'Secondary btn bg' },
      { name: '--bytepilot-btn-secondary-fg', label: 'Secondary btn text' },
      { name: '--bytepilot-btn-secondary-hover', label: 'Secondary btn hover' },
    ],
  },
  {
    name: 'Badges & Decorations',
    vars: [
      { name: '--bytepilot-badge-bg', label: 'Badge background' },
      { name: '--bytepilot-badge-fg', label: 'Badge text' },
      { name: '--bytepilot-blockquote-border', label: 'Blockquote border' },
      { name: '--bytepilot-blockquote-bg', label: 'Blockquote background' },
      { name: '--bytepilot-link-fg', label: 'Link color' },
      { name: '--bytepilot-titlebar-bg', label: 'Titlebar background' },
    ],
  },
  {
    name: 'Dropdown',
    vars: [
      { name: '--bytepilot-dropdown-bg', label: 'Dropdown background' },
      { name: '--bytepilot-dropdown-fg', label: 'Dropdown text' },
      { name: '--bytepilot-dropdown-border', label: 'Dropdown border' },
    ],
  },
  {
    name: 'List Items',
    vars: [
      { name: '--bytepilot-list-active-bg', label: 'Active item bg' },
      { name: '--bytepilot-list-active-fg', label: 'Active item text' },
      { name: '--bytepilot-list-hover-bg', label: 'Hover background' },
    ],
  },
  {
    name: 'Scrollbar',
    vars: [
      { name: '--bytepilot-scrollbar', label: 'Scrollbar thumb' },
      { name: '--bytepilot-scrollbar-hover', label: 'Scrollbar hover' },
    ],
  },
  {
    name: 'Status & Diff',
    vars: [
      { name: '--bytepilot-error-bg', label: 'Error background' },
      { name: '--bytepilot-error-fg', label: 'Error text' },
      { name: '--bytepilot-progress-bg', label: 'Progress bar' },
      { name: '--bytepilot-accent', label: 'Accent (success)' },
      { name: '--bytepilot-diff-add-fg', label: 'Diff added text' },
      { name: '--bytepilot-diff-remove-fg', label: 'Diff removed text' },
      { name: '--bytepilot-diff-add-bg', label: 'Diff added bg' },
      { name: '--bytepilot-diff-remove-bg', label: 'Diff removed bg' },
    ],
  },
  {
    name: 'Tool Call Status',
    vars: [
      { name: '--bytepilot-status-pending-fg', label: 'Pending text' },
      { name: '--bytepilot-status-pending-bg', label: 'Pending bg' },
      { name: '--bytepilot-status-pending-border', label: 'Pending border' },
      { name: '--bytepilot-status-running-fg', label: 'Running text' },
      { name: '--bytepilot-status-running-bg', label: 'Running bg' },
      { name: '--bytepilot-status-running-border', label: 'Running border' },
      { name: '--bytepilot-status-done-fg', label: 'Done text' },
      { name: '--bytepilot-status-done-bg', label: 'Done bg' },
      { name: '--bytepilot-status-done-border', label: 'Done border' },
      { name: '--bytepilot-status-error-fg', label: 'Error text' },
      { name: '--bytepilot-status-error-bg', label: 'Error bg' },
      { name: '--bytepilot-status-error-border', label: 'Error border' },
    ],
  },
];

/** Helper: build a flat map from all categories. */
function buildPreset(values: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    map[k] = v;
  }
  return map;
}

/** Light theme — matches theme-desktop.css */
export const LIGHT_PRESET = buildPreset({
  '--bytepilot-bg-primary': '#fbfbfb',
  '--bytepilot-bg-secondary': '#f4f1ec',
  '--bytepilot-input-bg': '#ffffff',
  '--bytepilot-code-bg': '#f3f4f6',
  '--bytepilot-border': '#e4e1db',
  '--bytepilot-focus-border': '#b8955c',

  '--bytepilot-fg-primary': '#1a1b1e',
  '--bytepilot-fg-secondary': '#787c85',
  '--bytepilot-input-fg': '#1a1b1e',
  '--bytepilot-input-border': '#dcd8d0',

  '--bytepilot-btn-bg': '#b8955c',
  '--bytepilot-btn-fg': '#ffffff',
  '--bytepilot-btn-hover': '#a07e47',
  '--bytepilot-btn-secondary-bg': '#ede9e3',
  '--bytepilot-btn-secondary-fg': '#5c5346',
  '--bytepilot-btn-secondary-hover': '#e4dfd7',

  '--bytepilot-badge-bg': '#ede9e3',
  '--bytepilot-badge-fg': '#6b6355',
  '--bytepilot-blockquote-border': '#b8955c',
  '--bytepilot-blockquote-bg': 'rgba(184, 149, 92, 0.06)',
  '--bytepilot-link-fg': '#b8955c',
  '--bytepilot-titlebar-bg': '#f0ede7',

  '--bytepilot-dropdown-bg': '#ffffff',
  '--bytepilot-dropdown-fg': '#1a1b1e',
  '--bytepilot-dropdown-border': '#e4e1db',

  '--bytepilot-list-active-bg': '#e8e2d6',
  '--bytepilot-list-active-fg': '#1a1b1e',
  '--bytepilot-list-hover-bg': '#f0ece5',

  '--bytepilot-scrollbar': '#dcd8d0',
  '--bytepilot-scrollbar-hover': '#c4bfb5',

  '--bytepilot-error-bg': 'rgba(220, 80, 70, 0.1)',
  '--bytepilot-error-fg': '#c24038',
  '--bytepilot-progress-bg': '#b8955c',
  '--bytepilot-accent': '#4a9e5a',
  '--bytepilot-diff-add-fg': '#2d8540',
  '--bytepilot-diff-remove-fg': '#c24038',
  '--bytepilot-diff-add-bg': 'rgba(45, 133, 64, 0.12)',
  '--bytepilot-diff-remove-bg': 'rgba(194, 64, 56, 0.12)',

  '--bytepilot-status-pending-fg': '#b88a2c',
  '--bytepilot-status-pending-bg': 'rgba(184, 138, 44, 0.1)',
  '--bytepilot-status-pending-border': '#b88a2c',
  '--bytepilot-status-running-fg': '#6b6355',
  '--bytepilot-status-running-bg': 'rgba(107, 99, 85, 0.06)',
  '--bytepilot-status-running-border': 'rgba(107, 99, 85, 0.35)',
  '--bytepilot-status-done-fg': '#2d8540',
  '--bytepilot-status-done-bg': 'rgba(45, 133, 64, 0.08)',
  '--bytepilot-status-done-border': 'rgba(45, 133, 64, 0.3)',
  '--bytepilot-status-error-fg': '#c24038',
  '--bytepilot-status-error-bg': 'rgba(194, 64, 56, 0.08)',
  '--bytepilot-status-error-border': 'rgba(194, 64, 56, 0.4)',
});

/** Dark theme */
export const DARK_PRESET = buildPreset({
  '--bytepilot-bg-primary': '#1e1e22',
  '--bytepilot-bg-secondary': '#25252b',
  '--bytepilot-input-bg': '#2c2c33',
  '--bytepilot-code-bg': '#1a1a1f',
  '--bytepilot-border': '#3a3a44',
  '--bytepilot-focus-border': '#7eb8d4',

  '--bytepilot-fg-primary': '#e0e0e4',
  '--bytepilot-fg-secondary': '#8a8a99',
  '--bytepilot-input-fg': '#e0e0e4',
  '--bytepilot-input-border': '#444451',

  '--bytepilot-btn-bg': '#507a94',
  '--bytepilot-btn-fg': '#ffffff',
  '--bytepilot-btn-hover': '#426a82',
  '--bytepilot-btn-secondary-bg': '#32323b',
  '--bytepilot-btn-secondary-fg': '#c0c0cc',
  '--bytepilot-btn-secondary-hover': '#3e3e49',

  '--bytepilot-badge-bg': '#32323b',
  '--bytepilot-badge-fg': '#a0a0b0',
  '--bytepilot-blockquote-border': '#7eb8d4',
  '--bytepilot-blockquote-bg': 'rgba(126, 184, 212, 0.08)',
  '--bytepilot-link-fg': '#7eb8d4',
  '--bytepilot-titlebar-bg': '#212126',

  '--bytepilot-dropdown-bg': '#2c2c33',
  '--bytepilot-dropdown-fg': '#e0e0e4',
  '--bytepilot-dropdown-border': '#3a3a44',

  '--bytepilot-list-active-bg': '#323840',
  '--bytepilot-list-active-fg': '#e0e0e4',
  '--bytepilot-list-hover-bg': '#2e2e36',

  '--bytepilot-scrollbar': '#3a3a44',
  '--bytepilot-scrollbar-hover': '#55555f',

  '--bytepilot-error-bg': 'rgba(230, 80, 70, 0.15)',
  '--bytepilot-error-fg': '#e87065',
  '--bytepilot-progress-bg': '#507a94',
  '--bytepilot-accent': '#5eae70',
  '--bytepilot-diff-add-fg': '#5eae70',
  '--bytepilot-diff-remove-fg': '#e87065',
  '--bytepilot-diff-add-bg': 'rgba(94, 174, 112, 0.15)',
  '--bytepilot-diff-remove-bg': 'rgba(232, 112, 101, 0.15)',

  '--bytepilot-status-pending-fg': '#d4a840',
  '--bytepilot-status-pending-bg': 'rgba(212, 168, 64, 0.12)',
  '--bytepilot-status-pending-border': '#d4a840',
  '--bytepilot-status-running-fg': '#888',
  '--bytepilot-status-running-bg': 'rgba(136, 136, 136, 0.08)',
  '--bytepilot-status-running-border': 'rgba(136, 136, 136, 0.4)',
  '--bytepilot-status-done-fg': '#5eae70',
  '--bytepilot-status-done-bg': 'rgba(94, 174, 112, 0.1)',
  '--bytepilot-status-done-border': 'rgba(94, 174, 112, 0.35)',
  '--bytepilot-status-error-fg': '#e87065',
  '--bytepilot-status-error-bg': 'rgba(232, 112, 101, 0.1)',
  '--bytepilot-status-error-border': 'rgba(232, 112, 101, 0.45)',
});

/** Get a preset by mode. */
export function getPreset(mode: ThemeMode): Record<string, string> | null {
  if (mode === 'light') return LIGHT_PRESET;
  if (mode === 'dark') return DARK_PRESET;
  return null;
}

/** Read saved theme from localStorage. Returns { mode, values }. */
export function loadTheme(): { mode: ThemeMode; values: Record<string, string> } {
  const mode: ThemeMode = 'light';
  try {
    const raw = localStorage.getItem('bytepilot-theme');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          mode: parsed.mode || 'custom',
          values: parsed.values || {},
        };
      }
    }
  } catch { /* ignore */ }
  return { mode, values: { ...LIGHT_PRESET } };
}

/** Save theme to localStorage. */
export function saveTheme(mode: ThemeMode, values: Record<string, string>): void {
  try {
    localStorage.setItem('bytepilot-theme', JSON.stringify({ mode, values }));
  } catch { /* ignore */ }
}
