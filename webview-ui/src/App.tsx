import React, { useCallback, useState, useEffect } from 'react';
import { ChatContainer } from './components/ChatContainer';
import { SetupWizard, type FoundConfig } from './components/SetupWizard';

import { useVSCode, useOnExtensionMessage } from './hooks/useVSCode';
import { useChatStore } from './state/chat-store';
import type { ExtensionMessage } from './types/ipc';

interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

const App: React.FC = () => {
  const { postMessage } = useVSCode();

  // Use individual selectors to avoid re-rendering on unrelated store changes
  const messages = useChatStore((s) => s.messages);
  const streamingText = useChatStore((s) => s.streamingText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const config = useChatStore((s) => s.config);
  const configLoaded = useChatStore((s) => s.configLoaded);
  const contextInfo = useChatStore((s) => s.contextInfo);
  const [foundConfigs, setFoundConfigs] = useState<FoundConfig[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const handleExtensionMessage = useCallback((msg: ExtensionMessage) => {
    const store = useChatStore.getState();
    switch (msg.type) {
      case 'chat.started':
        store.setStreaming(true);
        break;
      case 'chat.token':
        store.appendStreamChunk(msg.payload.text);
        break;
      case 'chat.toolCall':
        store.addToolCall(msg.payload.id, msg.payload.name, msg.payload.displayName, msg.payload.args, msg.payload.needsApproval);
        break;
      case 'chat.toolResult':
        store.updateToolResult(msg.payload.id, msg.payload.result, msg.payload.success, msg.payload.diff);
        break;
      case 'chat.done':
        store.finalizeMessage(msg.payload.usage);
        break;
      case 'chat.error':
        store.addErrorMessage(`Error: ${msg.payload.message}`);
        break;
      case 'config.state':
        store.setConfig(msg.payload);
        break;
      case 'config.found':
        setFoundConfigs(msg.payload.configs);
        setIsScanning(false);
        setScanDone(true);
        break;
      case 'context.update':
        store.updateContext(msg.payload);
        break;
      case 'tool.requestApproval':
        store.setToolPendingApproval(msg.payload.toolCallId, msg.payload.diff);
        break;
      case 'chat.clear':
        store.clearMessages();
        break;
      case 'chat.state':
        store.restoreMessages(msg.payload.messages);
        break;
      case 'session.list':
        setSessions(msg.payload.sessions);
        if (msg.payload.sessions.length > 0) {
          setActiveSessionId((prev) => prev || msg.payload.sessions[0].id);
        }
        break;
    }
  }, []);

  useOnExtensionMessage(handleExtensionMessage);

  const handleSend = useCallback((content: string, attachments?: Array<{ name: string; content: string; type: 'image'; mimeType: string }>) => {
    useChatStore.getState().addUserMessage(content);
    postMessage({ type: 'chat.send', payload: { content, attachments } } as any);
  }, [postMessage]);

  const handleCancel = useCallback(() => {
    postMessage({ type: 'chat.cancel' } as any);
    useChatStore.getState().setStreaming(false);
  }, [postMessage]);

  const handleApproveTool = useCallback((toolCallId: string) => {
    postMessage({ type: 'tool.approve', payload: { toolCallId } } as any);
    useChatStore.getState().setPermissionRequest(null);
  }, [postMessage]);

  const handleRejectTool = useCallback((toolCallId: string) => {
    postMessage({ type: 'tool.reject', payload: { toolCallId, reason: 'User rejected' } } as any);
    useChatStore.getState().setPermissionRequest(null);
  }, [postMessage]);

  // Setup handlers
  const handleSetupScan = useCallback(() => {
    setIsScanning(true);
    setScanDone(false);
    postMessage({ type: 'config.scan' } as any);
  }, [postMessage]);

  const handleSetupImport = useCallback((config: FoundConfig) => {
    postMessage({
      type: 'config.importSpecific',
      payload: {
        source: config.source,
        sourcePath: config.sourcePath,
        provider: config.provider,
        chatModel: config.chatModel,
        baseURL: config.baseURL,
        apiKey: config.hasApiKey ? 'from_claude_code' : undefined,
      },
    } as any);
  }, [postMessage]);

  const handleSetupBrowse = useCallback(() => {
    postMessage({ type: 'config.import' } as any);
  }, [postMessage]);

  const handleSetupManual = useCallback(() => {
    postMessage({ type: 'config.manualSetup' } as any);
  }, [postMessage]);

  const handleChangeModel = useCallback((model: string) => {
    postMessage({ type: 'config.set', payload: { chatModel: model } } as any);
  }, [postMessage]);

  const handleChangeSettings = useCallback((settings: { provider?: string; chatModel?: string; baseURL?: string; apiKey?: string }) => {
    postMessage({ type: 'config.set', payload: settings } as any);
  }, [postMessage]);

  const isConfigured = !!(config?.initialized);

  // Auto-scan only after config.loaded confirms no config exists
  useEffect(() => {
    if (configLoaded && !isConfigured && !scanDone && !isScanning) {
      handleSetupScan();
    }
  }, [configLoaded, isConfigured, scanDone, isScanning, handleSetupScan]);

  // Session handlers
  const refreshSessionList = useCallback(() => {
    postMessage({ type: 'session.list' } as any);
  }, [postMessage]);

  const handleNewSession = useCallback(() => {
    useChatStore.getState().clearMessages();
    postMessage({ type: 'session.create' } as any);
    setTimeout(refreshSessionList, 200);
  }, [postMessage, refreshSessionList]);

  const handleSwitchSession = useCallback((id: string) => {
    useChatStore.getState().clearMessages();
    setActiveSessionId(id);
    postMessage({ type: 'session.switch', payload: { sessionId: id } } as any);
  }, [postMessage]);

  const handleDeleteSession = useCallback((id: string) => {
    postMessage({ type: 'session.delete', payload: { sessionId: id } } as any);
    setTimeout(refreshSessionList, 200);
  }, [postMessage, refreshSessionList]);

  // Request initial state on mount
  useEffect(() => {
    postMessage({ type: 'config.get' } as any);
    postMessage({ type: 'session.list' } as any);
    postMessage({ type: 'chat.restore' } as any);
  }, [postMessage]);

  return (
    <>
      {!configLoaded ? (
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--vscode-descriptionForeground)', fontSize: '13px',
        }}>
          Loading...
        </div>
      ) : !isConfigured ? (
        <SetupWizard
          foundConfigs={foundConfigs}
          isScanning={isScanning}
          onImport={handleSetupImport}
          onManualBrowse={handleSetupBrowse}
          onManualConfigure={handleSetupManual}
        />
      ) : (
        <ChatContainer
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          contextInfo={contextInfo}
          config={config}
          onSend={handleSend}
          onCancel={handleCancel}
          onSetup={() => {
            setFoundConfigs([]);
            setIsScanning(false);
            setScanDone(false);
          }}
          onChangeModel={handleChangeModel}
          onChangeSettings={handleChangeSettings}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewSession={handleNewSession}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
        />
      )}

    </>
  );
};

export default App;
