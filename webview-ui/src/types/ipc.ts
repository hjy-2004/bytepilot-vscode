/**
 * IPC message type definitions for WebView <-> Extension Host communication.
 * Duplicated from src/types/ipc.ts for webview build isolation.
 * Keep in sync with the extension host version.
 */

// ---- WebView -> Extension Host ----

export interface ChatSendMessage {
  type: 'chat.send';
  payload: {
    content: string;
    attachments?: { name: string; content: string; type: 'image' | 'file'; mimeType?: string }[];
  };
}

export interface ChatCancelMessage {
  type: 'chat.cancel';
}

export interface ChatClearMessage {
  type: 'chat.clear';
}

export interface ConfigGetMessage {
  type: 'config.get';
}

export interface ConfigSetMessage {
  type: 'config.set';
  payload: {
    provider?: string;
    chatModel?: string;
    completionModel?: string;
    apiKey?: string;
    baseURL?: string;
  };
}

export interface ToolApproveMessage {
  type: 'tool.approve';
  payload: { toolCallId: string };
}

export interface ToolRejectMessage {
  type: 'tool.reject';
  payload: { toolCallId: string; reason?: string };
}

export interface ContextRefreshMessage {
  type: 'context.refresh';
}

export interface ConfigImportMessage {
  type: 'config.import';
}

export interface ConfigScanMessage {
  type: 'config.scan';
}

export interface ConfigImportSpecificMessage {
  type: 'config.importSpecific';
  payload: {
    source: string;
    sourcePath: string;
    provider: string;
    chatModel?: string;
    baseURL?: string;
    apiKey?: string;
  };
}

export interface ConfigManualSetupMessage {
  type: 'config.manualSetup';
}

export interface FilesSearchMessage {
  type: 'files.search';
  payload: { query: string };
}

export type WebViewMessage =
  | ChatSendMessage
  | ChatCancelMessage
  | ChatClearMessage
  | ConfigGetMessage
  | ConfigSetMessage
  | ToolApproveMessage
  | ToolRejectMessage
  | ContextRefreshMessage
  | ConfigImportMessage
  | ConfigScanMessage
  | ConfigImportSpecificMessage
  | ConfigManualSetupMessage
  | ChatRestoreMessage
  | SessionRequestMessage;

// ---- Extension Host -> WebView ----

export interface ChatStartedMessage {
  type: 'chat.started';
  payload: Record<string, never>;
}

export interface ChatTokenMessage {
  type: 'chat.token';
  payload: { text: string };
}

export interface ChatToolCallMessage {
  type: 'chat.toolCall';
  payload: {
    id: string;
    name: string;
    displayName: string;
    args: Record<string, unknown>;
    needsApproval?: boolean;
  };
}

export interface ChatToolResultMessage {
  type: 'chat.toolResult';
  payload: {
    id: string;
    name: string;
    result: string;
    success: boolean;
    diff?: import('./diff').UnifiedDiff;
  };
}

export interface ChatDoneMessage {
  type: 'chat.done';
  payload: {
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
}

export interface ChatErrorMessage {
  type: 'chat.error';
  payload: {
    message: string;
    code?: string;
  };
}

export interface ConfigStateMessage {
  type: 'config.state';
  payload: {
    provider: string;
    chatModel: string;
    completionModel: string;
    temperature: number;
    maxTokens: number;
    completionsEnabled: boolean;
    availableModels: { id: string; name: string }[];
    initialized: boolean;
    displayProvider: string;
    baseURL?: string;
  };
}

export interface ContextUpdateMessage {
  type: 'context.update';
  payload: {
    openFiles: string[];
    projectFiles: number;
    diagnosticsCount: number;
    hasRules?: boolean;
  };
}

export interface ToolRequestApprovalMessage {
  type: 'tool.requestApproval';
  payload: {
    toolCallId: string;
    toolName: string;
    displayName: string;
    args: Record<string, unknown>;
    diff?: import('./diff').UnifiedDiff;
  };
}

export interface ChatRestoreMessage {
  type: 'chat.restore';
}

export interface ChatStateMessage {
  type: 'chat.state';
  payload: {
    messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
      toolCalls?: Array<{
        id: string;
        name: string;
        displayName: string;
        args: Record<string, unknown>;
        result?: string;
        success?: boolean;
        status: 'done' | 'error';
        diff?: import('./diff').UnifiedDiff;
      }>;
    }>;
  };
}

export interface SessionListMessage {
  type: 'session.list';
  payload: { sessions: Array<{ id: string; title: string; messageCount: number; updatedAt: number }> };
}

export interface SessionRequestMessage {
  type: 'session.create' | 'session.switch' | 'session.delete' | 'session.list';
  payload?: { sessionId?: string };
}

export interface ChatClearIncomingMessage {
  type: 'chat.clear';
}

export interface ConfigFoundMessage {
  type: 'config.found';
  payload: {
    configs: Array<{
      source: string;
      sourcePath: string;
      provider: string;
      chatModel?: string;
      baseURL?: string;
      hasApiKey: boolean;
    }>;
  };
}

export interface FilesSearchResultMessage {
  type: 'files.searchResult';
  payload: { files: Array<{ path: string; name: string }> };
}

export type ExtensionMessage =
  | ChatStartedMessage
  | ChatTokenMessage
  | ChatToolCallMessage
  | ChatToolResultMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | ConfigStateMessage
  | ContextUpdateMessage
  | ToolRequestApprovalMessage
  | ChatClearIncomingMessage
  | ConfigFoundMessage
  | ChatStateMessage
  | SessionListMessage;
