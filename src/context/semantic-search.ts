import * as vscode from 'vscode';
import * as path from 'path';
import { logInfo } from '../utils/logger';

/**
 * BM25-based semantic search over workspace code files.
 * Provides relevance-ranked search without external dependencies.
 */

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.kt', '.scala', '.vue', '.svelte', '.css', '.scss', '.less',
]);

const EXCLUDE_PATTERNS = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.next/**,**/__pycache__/**,**/.venv/**,**/target/**}';

interface DocEntry {
  path: string;
  terms: Map<string, number>; // term -> frequency
  length: number;
}

// BM25 parameters
const K1 = 1.5;
const B = 0.75;

export class SemanticSearch {
  private docs = new Map<string, DocEntry>();
  private avgDocLength = 0;
  private df = new Map<string, number>(); // document frequency
  private totalDocs = 0;
  private indexing = false;
  private workspaceRoot = '';

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  setWorkspaceRoot(root: string): void {
    if (this.workspaceRoot !== root) {
      this.workspaceRoot = root;
      this.clear();
    }
  }

  /** Build or rebuild the index from workspace files */
  async buildIndex(signal?: AbortSignal): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    this.clear();

    try {
      const uris = await vscode.workspace.findFiles(
        '**/*',
        EXCLUDE_PATTERNS,
        5000,
      );

      for (const uri of uris) {
        if (signal?.aborted) break;
        const ext = path.extname(uri.fsPath).toLowerCase();
        if (!SOURCE_EXTENSIONS.has(ext)) continue;

        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > 256 * 1024) continue; // Skip files > 256KB
          const content = (await vscode.workspace.fs.readFile(uri)).toString();
          const terms = this.tokenize(content);
          const relPath = path.relative(this.workspaceRoot, uri.fsPath).replace(/\\/g, '/');
          const entry: DocEntry = { path: relPath, terms, length: content.length };
          this.docs.set(relPath, entry);

          // Update document frequencies
          const seenTerms = new Set(terms.keys());
          for (const t of seenTerms) {
            this.df.set(t, (this.df.get(t) || 0) + 1);
          }

          this.totalDocs++;
          this.avgDocLength += content.length;
        } catch { /* skip unreadable files */ }
      }

      if (this.totalDocs > 0) {
        this.avgDocLength /= this.totalDocs;
      }
      logInfo(`[SemanticSearch] Indexed ${this.totalDocs} files, ${this.df.size} unique terms`);
    } finally {
      this.indexing = false;
    }
  }

  /** Search for documents matching the query, ranked by BM25 score */
  search(query: string, maxResults: number = 10): Array<{ path: string; score: number }> {
    if (this.totalDocs === 0) return [];
    const queryTerms = this.tokenizeQuery(query);
    if (queryTerms.length === 0) return [];

    const results: Array<{ path: string; score: number }> = [];

    for (const [docPath, doc] of this.docs) {
      const score = this.bm25Score(doc, queryTerms);
      if (score > 0) {
        results.push({ path: docPath, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  isReady(): boolean {
    return this.totalDocs > 0;
  }

  /** Get a content snippet around a search term match */
  async getSnippet(filePath: string, query: string, contextLines: number = 3): Promise<string | null> {
    try {
      const fullPath = path.join(this.workspaceRoot, filePath);
      const content = (await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath))).toString();
      const lines = content.split('\n');
      const lowerQuery = query.toLowerCase();

      // Find the first matching line
      let bestLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          bestLine = i;
          break;
        }
      }
      if (bestLine === -1) return null;

      const start = Math.max(0, bestLine - contextLines);
      const end = Math.min(lines.length, bestLine + contextLines + 1);
      const snippet = lines.slice(start, end)
        .map((l, i) => `${String(start + i + 1).padStart(4, ' ')}| ${l}`)
        .join('\n');
      return `${filePath} (L${start + 1}-${end}):\n${snippet}`;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.docs.clear();
    this.df.clear();
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }

  // ── BM25 implementation ──

  private tokenize(text: string): Map<string, number> {
    const terms = new Map<string, number>();
    // Split on word boundaries, normalize to lowercase, filter short terms
    const tokens = text.toLowerCase()
      .split(/[^a-z0-9_$]+/)
      .filter(t => t.length >= 2 && t.length <= 40);

    for (const t of tokens) {
      terms.set(t, (terms.get(t) || 0) + 1);
    }
    return terms;
  }

  private tokenizeQuery(query: string): string[] {
    return query.toLowerCase()
      .split(/[^a-z0-9_$]+/)
      .filter(t => t.length >= 2 && t.length <= 40);
  }

  private bm25Score(doc: DocEntry, queryTerms: string[]): number {
    let score = 0;
    const docLen = doc.length || 1;

    for (const term of queryTerms) {
      const tf = doc.terms.get(term);
      if (!tf || tf === 0) continue;

      const df = this.df.get(term) || 0;
      if (df === 0) continue;

      // IDF
      const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));

      // TF saturation
      const numerator = tf * (K1 + 1);
      const denominator = tf + K1 * (1 - B + B * (docLen / this.avgDocLength));
      score += idf * (numerator / denominator);
    }

    return score;
  }
}

// Singleton instance
let instance: SemanticSearch | null = null;

export function getSemanticSearch(): SemanticSearch {
  if (!instance) {
    instance = new SemanticSearch();
  }
  return instance;
}

/** Initialize and build the index in the background */
export async function initSemanticSearch(signal?: AbortSignal): Promise<SemanticSearch> {
  const ss = getSemanticSearch();
  await ss.buildIndex(signal);
  return ss;
}
