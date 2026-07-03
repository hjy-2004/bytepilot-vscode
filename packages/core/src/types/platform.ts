/**
 * Platform abstraction interfaces for BytePilot.
 * Each platform (VS Code, Tauri desktop) implements these interfaces.
 */

// ── Disposable ────────────────────────────────────────────────────────

/** Generic disposable resource (mirrors vscode.Disposable pattern). */
export interface IDisposable {
  dispose(): void;
}

// ── Logging ───────────────────────────────────────────────────────────

/** Platform-agnostic logger interface. */
export interface ILogger {
  info(message: string): void;
  error(message: string, err?: unknown): void;
  warn(message: string): void;
  debug(message: string): void;
  /** Optionally reveal the log output to the user. */
  show(): void;
  /** Show the output channel, optionally preserving focus. */
  show(preserveFocus: boolean): void;
}

// ── File System ──────────────────────────────────────────────────────

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
}

export interface IFileSystem {
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string): Promise<void>;
  createDirectory(absolutePath: string): Promise<void>;
  readDirectory(absolutePath: string): Promise<Array<[string, boolean]>>;
  stat(absolutePath: string): Promise<FileStat>;
  exists(absolutePath: string): Promise<boolean>;
  findFiles(
    basePath: string,
    include: string,
    exclude: string,
    maxResults: number
  ): Promise<string[]>;
  resolvePath(relativePath: string): string;
  isWithinWorkspace(absolutePath: string): boolean;
}

// ── Secrets ───────────────────────────────────────────────────────────

export interface ISecretStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  onDidChange(listener: () => void): IDisposable;
}

// ── Configuration ────────────────────────────────────────────────────

export interface IConfigStore {
  get<T>(key: string, defaultValue: T): T;
  /** Fires when configuration changes, providing the changed keys. */
  onDidChange(listener: (keys: string[]) => void): IDisposable;
}

// ── Editor / IDE Host ────────────────────────────────────────────────

export interface EditorSelection {
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface DiagnosticEntry {
  filePath: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  message: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  killed: boolean;
}

export interface IEditorHost {
  getWorkspaceRoot(): string;
  executeCommand(
    command: string,
    cwd: string,
    timeoutMs: number,
    env?: Record<string, string>
  ): Promise<CommandResult>;
  getDiagnostics(filePath?: string): DiagnosticEntry[];
  getOpenFiles(): string[];
  getOpenFileContent(relativePath: string): Promise<string | undefined>;
  getActiveSelection(): EditorSelection | undefined;
  getProjectStructure(): Promise<string>;
  getProjectRules(): Promise<string | undefined>;
  getPlatform(): string;
}

// ── IPC Bridge ───────────────────────────────────────────────────────

export interface IIPCBridge {
  sendToUI(message: Record<string, unknown>): void;
  onMessageFromUI(handler: (message: Record<string, unknown>) => void): IDisposable;
}
