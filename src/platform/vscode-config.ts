/**
 * VS Code implementation of IConfigStore.
 * Wraps vscode.workspace.getConfiguration('aiCodingAgent').
 */
import * as vscode from 'vscode';
import type { IConfigStore, IDisposable } from '@bytepilot/core';

export class VSCodeConfigStore implements IConfigStore {
  get<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('aiCodingAgent').get<T>(key) ?? defaultValue;
  }

  onDidChange(listener: (keys: string[]) => void): IDisposable {
    const sub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiCodingAgent')) {
        listener(['aiCodingAgent']);
      }
    });
    return {
      dispose: () => sub.dispose(),
    };
  }
}
