import React, { useEffect, useState } from 'react';

export interface FoundConfig {
  source: string;
  sourcePath: string;
  provider: string;
  chatModel?: string;
  baseURL?: string;
  hasApiKey: boolean;
}

interface SetupWizardProps {
  foundConfigs: FoundConfig[];
  isScanning: boolean;
  onImport: (config: FoundConfig) => void;
  onManualBrowse: () => void;
  onManualConfigure: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  foundConfigs,
  isScanning,
  onImport,
  onManualBrowse,
  onManualConfigure,
}) => {
  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '24px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#129302;</div>
      <h2 style={{ marginBottom: '4px', fontWeight: 600, color: 'var(--bytepilot-fg-primary)' }}>
        Welcome
      </h2>
      <p style={{
        fontSize: '12px', color: 'var(--bytepilot-fg-secondary)',
        marginBottom: '20px', textAlign: 'center', maxWidth: '280px',
      }}>
        Let's get your AI provider set up. We'll automatically find existing configs.
      </p>

      {/* Scanning indicator */}
      {isScanning && (
        <div style={{
          padding: '20px', textAlign: 'center',
          color: 'var(--bytepilot-fg-secondary)', fontSize: '13px',
        }}>
          <div style={{
            display: 'inline-block', width: '20px', height: '20px',
            border: '2px solid var(--bytepilot-progress-bg)',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', marginBottom: '8px',
          }} />
          <p>Scanning for existing AI configs...</p>
        </div>
      )}

      {/* Found configs */}
      {!isScanning && foundConfigs.length > 0 && (
        <div style={{ width: '100%', maxWidth: '360px', marginBottom: '16px' }}>
          <p style={{
            fontSize: '12px', fontWeight: 600, marginBottom: '8px',
            color: 'var(--bytepilot-fg-primary)',
          }}>
            Found {foundConfigs.length} configuration{foundConfigs.length > 1 ? 's' : ''}:
          </p>
          {foundConfigs.map((cfg, i) => (
            <div
              key={i}
              onClick={() => onImport(cfg)}
              style={{
                border: '1px solid var(--bytepilot-border)',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '8px',
                cursor: 'pointer',
                background: 'var(--bytepilot-bg-secondary)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--bytepilot-focus-border)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--bytepilot-border)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>
                    {cfg.source}
                    {cfg.hasApiKey && (
                      <span style={{
                        marginLeft: '6px', fontSize: '10px',
                        color: 'var(--bytepilot-accent)',
                      }}>
                        &#10003; Key
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--bytepilot-fg-secondary)', marginTop: '2px' }}>
                    {cfg.provider}{cfg.chatModel ? ` / ${cfg.chatModel}` : ''}
                  </div>
                  {cfg.baseURL && (
                    <div style={{ fontSize: '10px', color: 'var(--bytepilot-fg-secondary)', opacity: 0.7, marginTop: '2px' }}>
                      {cfg.baseURL.length > 50 ? cfg.baseURL.slice(0, 50) + '...' : cfg.baseURL}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '18px', opacity: 0.4 }}>&#8594;</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No configs found */}
      {!isScanning && foundConfigs.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '16px',
          color: 'var(--bytepilot-fg-secondary)', fontSize: '12px',
          maxWidth: '260px',
        }}>
          <p style={{ marginBottom: '12px' }}>No existing AI configs found.</p>
          <p>You can browse for a config file or set up manually.</p>
        </div>
      )}

      {/* Action buttons */}
      {!isScanning && (
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap',
          justifyContent: 'center', maxWidth: '300px',
        }}>
          <button
            onClick={onManualBrowse}
            style={{
              padding: '6px 14px',
              background: 'var(--bytepilot-btn-bg)',
              color: 'var(--bytepilot-btn-fg)',
              border: 'none', borderRadius: '4px',
              cursor: 'pointer', fontSize: '12px',
            }}
          >
            Browse files
          </button>
          <button
            onClick={onManualConfigure}
            style={{
              padding: '6px 14px',
              background: 'var(--bytepilot-btn-secondary-bg)',
              color: 'var(--bytepilot-btn-secondary-fg)',
              border: 'none', borderRadius: '4px',
              cursor: 'pointer', fontSize: '12px',
            }}
          >
            Manual setup
          </button>
        </div>
      )}
    </div>
  );
};
