import React from 'react';

interface ContextIndicatorProps {
  openFiles: string[];
  projectFiles: number;
  diagnosticsCount: number;
  hasRules?: boolean;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  openFiles,
  projectFiles,
  diagnosticsCount,
  hasRules,
}) => {
  if (openFiles.length === 0 && projectFiles === 0 && !hasRules) return null;

  return (
    <div className="context-bar">
      {hasRules && (
        <span className="context-pill" title=".bytepilotrules loaded" style={{
          background: 'var(--vscode-badge-background)',
          color: 'var(--vscode-badge-foreground)',
        }}>
          Rules active
        </span>
      )}
      {openFiles.length > 0 && (
        <span className="context-pill" title="Open files">
          {openFiles.length} file{openFiles.length !== 1 ? 's' : ''} open
        </span>
      )}
      {projectFiles > 0 && (
        <span className="context-pill" title="Project files">
          {projectFiles} project files
        </span>
      )}
      {diagnosticsCount > 0 && (
        <span className="context-pill" title="Errors/warnings" style={{
          background: 'var(--vscode-inputValidation-errorBackground)',
          color: 'var(--vscode-inputValidation-errorForeground)',
        }}>
          {diagnosticsCount} issue{diagnosticsCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
};
