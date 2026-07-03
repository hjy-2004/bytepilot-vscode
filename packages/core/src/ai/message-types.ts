export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  base64?: string;
  mediaType?: string;
}

export interface Attachment {
  name: string;
  content: string;
  type: 'image' | 'file';
  mimeType?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  attachments?: Attachment[];
}
