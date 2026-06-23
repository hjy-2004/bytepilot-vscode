import React from 'react';

interface DiffViewProps {
  fileName: string;
  oldContent: string;
  newContent: string;
}

/**
 * Simple diff display component.
 * In Phase 7 this will be enhanced with a proper diff algorithm.
 */
export const DiffView: React.FC<DiffViewProps> = ({ fileName, oldContent, newContent }) => {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div style={{
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '4px',
      overflow: 'hidden',
      fontSize: '12px',
      margin: '8px 0',
    }}>
      <div style={{
        padding: '4px 8px',
        background: 'var(--vscode-titleBar-activeBackground)',
        fontWeight: 600,
        fontSize: '11px',
      }}>
        Changes to: {fileName}
      </div>
      <div style={{ maxHeight: '300px', overflow: 'auto', fontFamily: 'monospace' }}>
        {Array.from({ length: maxLines }).map((_, i) => {
          const oldLine = oldLines[i];
          const newLine = newLines[i];
          const isChanged = oldLine !== newLine;

          if (oldLine === undefined) {
            // Added line
            return (
              <div key={i} style={{ background: 'rgba(0,255,0,0.1)', padding: '1px 8px' }}>
                + {newLine}
              </div>
            );
          }
          if (newLine === undefined) {
            // Removed line
            return (
              <div key={i} style={{ background: 'rgba(255,0,0,0.1)', padding: '1px 8px' }}>
                - {oldLine}
              </div>
            );
          }
          if (isChanged) {
            return (
              <React.Fragment key={i}>
                <div style={{ background: 'rgba(255,0,0,0.1)', padding: '1px 8px' }}>
                  - {oldLine}
                </div>
                <div style={{ background: 'rgba(0,255,0,0.1)', padding: '1px 8px' }}>
                  + {newLine}
                </div>
              </React.Fragment>
            );
          }
          return (
            <div key={i} style={{ padding: '1px 8px' }}>
              {' '}{oldLine}
            </div>
          );
        })}
      </div>
    </div>
  );
};
