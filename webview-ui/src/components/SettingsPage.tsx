import React, { useState, useCallback, useEffect } from 'react';
import {
  type ThemeMode,
  type ThemeVarDef,
  THEME_CATEGORIES,
  LIGHT_PRESET,
  DARK_PRESET,
  getPreset,
  loadTheme,
  saveTheme,
} from '../theme/theme-presets';

interface SettingsPageProps {
  onBack: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [values, setValues] = useState<Record<string, string>>({ ...LIGHT_PRESET });

  // Load saved theme on mount
  useEffect(() => {
    const saved = loadTheme();
    setMode(saved.mode);
    setValues(saved.values);
  }, []);

  // Apply CSS variables to :root whenever values change
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(values)) {
      root.style.setProperty(name, value);
    }
  }, [values]);

  const handlePresetChange = useCallback((newMode: ThemeMode) => {
    const preset = getPreset(newMode);
    if (preset) {
      setMode(newMode);
      setValues({ ...preset });
      saveTheme(newMode, preset);
    }
  }, []);

  const handleColorChange = useCallback((varName: string, color: string) => {
    setValues((prev) => {
      const next = { ...prev, [varName]: color };
      const newMode: ThemeMode = 'custom';
      setMode(newMode);
      saveTheme(newMode, next);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    const preset = getPreset(mode === 'custom' ? 'light' : mode);
    if (preset) {
      const newMode: ThemeMode = mode === 'custom' ? 'light' : mode;
      setMode(newMode);
      setValues({ ...preset });
      saveTheme(newMode, preset);
    }
  }, [mode]);

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-header">
        <button className="settings-back-btn" onClick={onBack}>
          &larr; Back
        </button>
        <h2 className="settings-title">Theme Settings</h2>
      </div>

      {/* Preset selector */}
      <div className="settings-preset-bar">
        <div className="settings-preset-buttons">
          <button
            className={`settings-preset-btn${mode === 'light' ? ' active' : ''}`}
            onClick={() => handlePresetChange('light')}
          >
            Light
          </button>
          <button
            className={`settings-preset-btn${mode === 'dark' ? ' active' : ''}`}
            onClick={() => handlePresetChange('dark')}
          >
            Dark
          </button>
          {mode === 'custom' && (
            <button className="settings-preset-btn active">
              Custom
            </button>
          )}
        </div>
        <button className="settings-reset-btn" onClick={handleReset} title="Restore default colors">
          {mode === 'custom' ? 'Reset to default' : 'Reset'}
        </button>
        {mode === 'custom' && (
          <span className="settings-preset-hint">
            You've made changes. Click Reset to restore defaults.
          </span>
        )}
        {mode !== 'custom' && (
          <span className="settings-preset-hint">
            Editing any color switches to Custom mode.
          </span>
        )}
      </div>

      {/* Color palette */}
      <div className="settings-palette">
        {THEME_CATEGORIES.map((cat) => (
          <ColorCategory
            key={cat.name}
            category={cat}
            values={values}
            onChange={handleColorChange}
            onSwapToLight={(varName) => handleColorChange(varName, LIGHT_PRESET[varName] || values[varName])}
            onSwapToDark={(varName) => handleColorChange(varName, DARK_PRESET[varName] || values[varName])}
          />
        ))}
      </div>
    </div>
  );
};

interface ColorCategoryProps {
  category: { name: string; vars: ThemeVarDef[] };
  values: Record<string, string>;
  onChange: (varName: string, color: string) => void;
  onSwapToLight: (varName: string) => void;
  onSwapToDark: (varName: string) => void;
}

const ColorCategory: React.FC<ColorCategoryProps> = ({
  category,
  values,
  onChange,
  onSwapToLight,
  onSwapToDark,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="settings-category">
      <div className="settings-category-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="settings-category-arrow">{collapsed ? '\u25B6' : '\u25BC'}</span>
        <span className="settings-category-name">{category.name}</span>
        <span className="settings-category-count">{category.vars.length} colors</span>
      </div>
      {!collapsed && (
        <div className="settings-category-body">
          {category.vars.map((v) => (
            <ColorRow
              key={v.name}
              def={v}
              value={values[v.name] || '#000000'}
              onChange={onChange}
              onSwapToLight={onSwapToLight}
              onSwapToDark={onSwapToDark}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ColorRowProps {
  def: ThemeVarDef;
  value: string;
  onChange: (varName: string, color: string) => void;
  onSwapToLight: (varName: string) => void;
  onSwapToDark: (varName: string) => void;
}

const ColorRow: React.FC<ColorRowProps> = ({
  def,
  value,
  onChange,
  onSwapToLight,
  onSwapToDark,
}) => {
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v.match(/^#[0-9a-fA-F]{0,8}$/)) {
        onChange(def.name, v);
      }
    },
    [def.name, onChange],
  );

  const handleTextBlur = useCallback(() => {
    if (!value.match(/^#[0-9a-fA-F]{3,8}$/)) {
      // On blur, if hex is incomplete, revert to the preset default
      const preset = LIGHT_PRESET[def.name] || '#000000';
      onChange(def.name, preset);
    }
  }, [value, def.name, onChange]);

  return (
    <div className="settings-color-row">
      <label className="settings-color-label" title={def.name}>
        {def.label}
      </label>
      <div className="settings-color-controls">
        <div className="settings-color-swatch-wrap">
          <div
            className="settings-color-swatch"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            className="settings-color-input"
            value={value.match(/^#[0-9a-fA-F]{6}$/) ? value : '#000000'}
            onChange={(e) => onChange(def.name, e.target.value)}
          />
        </div>
        <input
          type="text"
          className="settings-color-text"
          value={value}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          maxLength={9}
          placeholder="#rrggbb"
        />
        {/* Quick-swap buttons for custom mode */}
        <div className="settings-color-swaps">
          <button
            className="settings-color-swap-btn"
            title="Use light preset color"
            onClick={() => onSwapToLight(def.name)}
            style={{ backgroundColor: LIGHT_PRESET[def.name] || '#ccc' }}
          />
          <button
            className="settings-color-swap-btn"
            title="Use dark preset color"
            onClick={() => onSwapToDark(def.name)}
            style={{ backgroundColor: DARK_PRESET[def.name] || '#333' }}
          />
        </div>
      </div>
    </div>
  );
};
