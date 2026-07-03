import React, { useState } from 'react';
import type { UnifiedDiff, DiffHunk, DiffLine } from '../types/diff';

interface DiffViewProps {
  diff: UnifiedDiff;
}

const COLLAPSE_THRESHOLD = 5;

export const DiffView: React.FC<DiffViewProps> = React.memo(({ diff }) => {
  if (!diff.hunks.length) {
    return (
      <div style={{
        border: '1px solid var(--bytepilot-border)',
        borderRadius: '4px',
        overflow: 'hidden',
        fontSize: '12px',
        margin: '6px 0',
      }}>
        <div style={{
          padding: '4px 8px',
          background: 'var(--bytepilot-titlebar-bg)',
          fontWeight: 600,
          fontSize: '11px',
        }}>
          {diff.fileName}
        </div>
        <div style={{ padding: '8px', color: 'var(--bytepilot-fg-secondary)', fontStyle: 'italic' }}>
          No changes.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--bytepilot-border)',
      borderRadius: '4px',
      overflow: 'hidden',
      fontSize: '12px',
      margin: '6px 0',
    }}>
      <DiffHeader fileName={diff.fileName} stats={diff.stats} />
      <div style={{
        maxHeight: '400px',
        overflow: 'auto',
        fontFamily: 'var(--bytepilot-editor-font-family, monospace)',
        fontSize: '11px',
        lineHeight: '1.5',
      }}>
        {diff.hunks.map((hunk, hi) => (
          <DiffHunkView key={hi} hunk={hunk} />
        ))}
      </div>
    </div>
  );
});

const DiffHeader: React.FC<{ fileName: string; stats: UnifiedDiff['stats'] }> = ({ fileName, stats }) => (
  <div style={{
    padding: '4px 8px',
    background: 'var(--bytepilot-titlebar-bg)',
    fontWeight: 600,
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }}>
    <span>{fileName}</span>
    <span style={{ fontWeight: 400, fontSize: '11px' }}>
      <span style={{ color: 'var(--bytepilot-diff-add-fg)', marginRight: '4px' }}>+{stats.additions}</span>
      <span style={{ color: 'var(--bytepilot-diff-remove-fg)' }}>-{stats.deletions}</span>
    </span>
  </div>
);

const DiffHunkView: React.FC<{ hunk: DiffHunk }> = ({ hunk }) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(() => {
    const groups = new Set<number>();
    findContextGroups(hunk.lines).forEach((g) => {
      if (g.count >= COLLAPSE_THRESHOLD) groups.add(g.startIndex);
    });
    return groups;
  });

  const toggleCollapse = (startIndex: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(startIndex)) {
        next.delete(startIndex);
      } else {
        next.add(startIndex);
      }
      return next;
    });
  };

  const groups = findContextGroups(hunk.lines);

  return (
    <div>
      <div style={{
        background: 'var(--bytepilot-blockquote-bg)',
        color: 'var(--bytepilot-fg-secondary)',
        padding: '1px 8px',
        fontSize: '10px',
        borderTop: '1px solid var(--bytepilot-border)',
        borderBottom: '1px solid var(--bytepilot-border)',
      }}>
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      {renderLines(hunk.lines, groups, collapsedGroups, toggleCollapse)}
    </div>
  );
};

interface ContextGroup {
  startIndex: number;
  count: number;
}

function findContextGroups(lines: DiffLine[]): ContextGroup[] {
  const groups: ContextGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'context') {
      const start = i;
      while (i < lines.length && lines[i].type === 'context') i++;
      groups.push({ startIndex: start, count: i - start });
    } else {
      i++;
    }
  }
  return groups;
}

function renderLines(
  lines: DiffLine[],
  groups: ContextGroup[],
  collapsedGroups: Set<number>,
  toggle: (idx: number) => void,
): React.ReactNode[] {
  const collapsedStarts = new Map<number, ContextGroup>();
  for (const g of groups) {
    if (collapsedGroups.has(g.startIndex)) {
      collapsedStarts.set(g.startIndex, g);
    }
  }

  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (collapsedStarts.has(i)) {
      const g = collapsedStarts.get(i)!;
      result.push(
        <div
          key={`collapse-${i}`}
          onClick={() => toggle(i)}
          style={{
            padding: '2px 8px',
            background: 'var(--bytepilot-bg-primary)',
            color: 'var(--bytepilot-link-fg)',
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: '10px',
            userSelect: 'none',
          }}
        >
          ▸ Show {g.count} unchanged lines
        </div>
      );
      i += g.count;
      continue;
    }

    const line = lines[i];
    const bg =
      line.type === 'added'
        ? 'var(--bytepilot-diff-add-bg)'
        : line.type === 'removed'
          ? 'var(--bytepilot-diff-remove-bg)'
          : 'transparent';
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
    const prefixColor =
      line.type === 'added'
        ? 'var(--bytepilot-diff-add-fg)'
        : line.type === 'removed'
          ? 'var(--bytepilot-diff-remove-fg)'
          : 'var(--bytepilot-fg-secondary)';

    result.push(
      <div
        key={i}
        style={{
          display: 'flex',
          background: bg,
          padding: '1px 0',
          minHeight: '19px',
        }}
      >
        <span style={{
          display: 'inline-block',
          width: '44px',
          textAlign: 'right',
          paddingRight: '4px',
          color: 'var(--bytepilot-fg-secondary)',
          opacity: 0.5,
          flexShrink: 0,
          userSelect: 'none',
        }}>
          {line.oldLineNumber ?? ''}
        </span>
        <span style={{
          display: 'inline-block',
          width: '44px',
          textAlign: 'right',
          paddingRight: '4px',
          color: 'var(--bytepilot-fg-secondary)',
          opacity: 0.5,
          flexShrink: 0,
          userSelect: 'none',
        }}>
          {line.newLineNumber ?? ''}
        </span>
        <span style={{
          width: '14px',
          textAlign: 'center',
          color: prefixColor,
          fontWeight: 700,
          flexShrink: 0,
          userSelect: 'none',
        }}>
          {prefix}
        </span>
        <span style={{
          paddingLeft: '4px',
          whiteSpace: 'pre',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {line.content}
        </span>
      </div>
    );
    i++;
  }
  return result;
}
