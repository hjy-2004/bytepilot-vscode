import * as vscode from 'vscode';
import * as path from 'path';

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'out', '.next', 'build', '__pycache__', '.venv'];

/**
 * Collects a high-level project structure overview.
 */
export async function collectProjectStructure(
  workspaceRoot: string,
  maxFiles: number = 200
): Promise<string> {
  try {
    const excludePattern = `{${DEFAULT_EXCLUDES.join(',')}}`;
    const uris = await vscode.workspace.findFiles('*', excludePattern, maxFiles);

    // Build a tree-like structure
    const tree = buildTree(uris.map((uri) => path.relative(workspaceRoot, uri.fsPath)));

    const lines = formatTree(tree, workspaceRoot);
    if (uris.length >= maxFiles) {
      lines.push(`... (truncated at ${maxFiles} files)`);
    }
    return lines.join('\n');
  } catch {
    return 'Unable to scan project structure.';
  }
}

interface TreeNode {
  name: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', isDir: true, children: new Map() };

  for (const p of paths) {
    const parts = p.split(/[/\\]/);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, isDir: !isLast, children: new Map() });
      }
      current = current.children.get(part)!;
    }
  }

  return root;
}

function formatTree(node: TreeNode, rootPath: string, indent: string = ''): string[] {
  const result: string[] = [];
  const entries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of entries) {
    if (child.isDir) {
      result.push(`${indent}${name}/`);
      const childLines = formatTree(child, rootPath, indent + '  ');
      if (childLines.length <= 20) {
        result.push(...childLines);
      } else {
        result.push(...childLines.slice(0, 20));
        result.push(`${indent}  ... (${childLines.length - 20} more)`);
      }
    } else {
      result.push(`${indent}${name}`);
    }
  }

  return result;
}
