import type { CoreMessage, CoreToolMessage, CoreAssistantMessage, ToolCallPart } from 'ai';

/** Extended chat message for internal use */
export interface ChatMessageEntry {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
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
  status: 'pending' | 'running' | 'done' | 'error';
}

/** Approval state for tool execution */
export interface PendingApproval {
  toolCallId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}
