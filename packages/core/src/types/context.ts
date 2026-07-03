/** Snapshot of the current workspace context */
export interface ContextSnapshot {
  openFiles: OpenFileInfo[];
  projectStructure: string;
  diagnostics: DiagnosticInfo[];
  activeSelection?: SelectionInfo;
  projectRules?: string;
  timestamp: number;
}

export interface OpenFileInfo {
  path: string;
  language: string;
  lineCount: number;
  content?: string; // first 200 lines
}

export interface DiagnosticInfo {
  filePath: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  message: string;
}

export interface SelectionInfo {
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}
