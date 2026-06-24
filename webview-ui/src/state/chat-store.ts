import { create } from 'zustand';
import type { UnifiedDiff } from '../types/diff';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallEntry[];
}

export interface ToolCallEntry {
  id: string;
  name: string;
  displayName: string;
  args: Record<string, unknown>;
  result?: string;
  success?: boolean;
  status: 'pending' | 'pending_approval' | 'running' | 'done' | 'error';
  diff?: UnifiedDiff;
}

export interface ConfigState {
  provider: string;
  chatModel: string;
  completionModel: string;
  baseURL?: string;
  temperature: number;
  maxTokens: number;
  completionsEnabled: boolean;
  availableModels: { id: string; name: string }[];
  initialized: boolean;
  displayProvider: string;
}

export interface PermissionRequest {
  toolCallId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
  diff?: UnifiedDiff;
}

interface ChatStore {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  config: ConfigState | null;
  configLoaded: boolean;
  permissionRequest: PermissionRequest | null;
  contextInfo: {
    openFiles: string[];
    projectFiles: number;
    diagnosticsCount: number;
  };

  addUserMessage: (content: string) => void;
  appendStreamChunk: (text: string) => void;
  finalizeMessage: (usage?: { inputTokens: number; outputTokens: number }) => void;
  addToolCall: (id: string, name: string, displayName: string, args: Record<string, unknown>, needsApproval?: boolean) => void;
  setToolPendingApproval: (id: string, diff?: UnifiedDiff) => void;
  setToolRunning: (id: string) => void;
  updateToolResult: (id: string, result: string, success: boolean, diff?: UnifiedDiff) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
  setConfig: (config: ConfigState) => void;
  setPermissionRequest: (request: PermissionRequest | null) => void;
  updateContext: (info: { openFiles: string[]; projectFiles: number; diagnosticsCount: number }) => void;
  addErrorMessage: (content: string) => void;
  restoreMessages: (msgs: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number; toolCalls?: ToolCallEntry[] }>) => void;
}

let nextId = 0;
function genId(): string {
  return `msg_${Date.now()}_${nextId++}`;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  streamingText: '',
  isStreaming: false,
  config: null,
  configLoaded: false,
  permissionRequest: null,
  contextInfo: { openFiles: [], projectFiles: 0, diagnosticsCount: 0 },

  addUserMessage: (content: string) => {
    const msg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg], streamingText: '' }));
  },

  appendStreamChunk: (text: string) => {
    set((s) => ({ streamingText: s.streamingText + text, isStreaming: true }));
  },

  finalizeMessage: (usage) => {
    const { streamingText, messages } = get();
    if (streamingText.trim()) {
      const msg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: streamingText,
        timestamp: Date.now(),
        toolCalls: [],
      };
      set({ messages: [...messages, msg], streamingText: '', isStreaming: false });
    } else {
      set({ isStreaming: false });
    }
  },

  addToolCall: (id, name, displayName, args, needsApproval) => {
    const { streamingText, messages } = get();
    let updatedMsgs = messages;
    if (streamingText.trim()) {
      updatedMsgs = [...messages, { id: genId(), role: 'assistant', content: streamingText, timestamp: Date.now(), toolCalls: [] }];
    }
    // Create empty assistant message if last msg isn't assistant (e.g. tool call without text prefix)
    let lastMsg = updatedMsgs[updatedMsgs.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') {
      lastMsg = { id: genId(), role: 'assistant' as const, content: '', timestamp: Date.now(), toolCalls: [] };
      updatedMsgs = [...updatedMsgs, lastMsg];
    }
    const status = needsApproval ? ('pending_approval' as const) : ('running' as const);
    const toolCall: ToolCallEntry = { id, name, displayName, args, status };
    const updated = { ...lastMsg, toolCalls: [...(lastMsg.toolCalls || []), toolCall] };
    set({ messages: [...updatedMsgs.slice(0, -1), updated], streamingText: '', isStreaming: true });
  },

  setToolPendingApproval: (id, diff) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.toolCalls ? { ...m, toolCalls: m.toolCalls.map((tc) => tc.id === id ? { ...tc, status: 'pending_approval' as const, diff } : tc) } : m
      ),
    }));
  },
  setToolRunning: (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.toolCalls ? { ...m, toolCalls: m.toolCalls.map((tc) => tc.id === id ? { ...tc, status: 'running' as const } : tc) } : m
      ),
    }));
  },
  updateToolResult: (id, result, success, diff?) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.toolCalls) {
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) =>
              tc.id === id ? { ...tc, result, success, diff, status: success ? ('done' as const) : ('error' as const) } : tc
            ),
          };
        }
        return m;
      }),
    }));
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  clearMessages: () => set({ messages: [], streamingText: '', isStreaming: false }),

  setConfig: (config) => set({ config, configLoaded: true }),

  setPermissionRequest: (request) => set({ permissionRequest: request }),

  updateContext: (info) => set({ contextInfo: info }),

  addErrorMessage: (content) => {
    const msg: ChatMessage = {
      id: genId(),
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg], isStreaming: false }));
  },

  restoreMessages: (msgs) => {
    if (msgs.length === 0) return;
    set({
      messages: msgs.map((m) => ({
        ...m,
        toolCalls: m.toolCalls || [],
      })),
      streamingText: '',
      isStreaming: false,
    });
  },
}));
