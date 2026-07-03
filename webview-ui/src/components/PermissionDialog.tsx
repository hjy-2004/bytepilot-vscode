import React from 'react';
import { DiffView } from './DiffView';
import type { UnifiedDiff } from '../types/diff';

interface PermissionDialogProps {
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
  diff?: UnifiedDiff;
  onApprove: () => void;
  onReject: () => void;
}

export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  toolName,
  displayName,
  args,
  diff,
  onApprove,
  onReject,
}) => {
  return (
    <div className="permission-overlay">
      <div className="permission-dialog" style={diff ? { maxWidth: '560px' } : undefined}>
        <h3>Approve Tool Execution</h3>
        <p style={{ fontSize: '13px', marginBottom: '8px', opacity: 0.8 }}>
          The AI wants to execute <strong>{displayName}</strong>.
        </p>

        {diff ? (
          <DiffView diff={diff} />
        ) : (
          <div style={{ fontSize: '12px' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Details:</div>
            <pre style={{
              background: 'var(--bytepilot-code-bg)',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '12px',
              maxHeight: '200px',
              overflow: 'auto',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}

        <div className="permission-actions">
          <button className="btn-secondary" onClick={onReject}>
            Reject
          </button>
          <button className="btn-primary" onClick={onApprove}>
            Approve
          </button>
        </div>
      </div>
    </div>
  );
};
