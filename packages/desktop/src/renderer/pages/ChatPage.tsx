import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '@renderer/hooks/useChat';
import { useMcpServers } from '@renderer/hooks/useMcpServers';
import { AppSidebar } from '@renderer/components/AppSidebar';
import { ChatInput } from '@renderer/components/ChatInput';
import type { ChatInputHandle } from '@renderer/components/ChatInput';
import { ChatMessage } from '@renderer/components/ChatMessage';
import { WelcomeScreen } from '@renderer/components/WelcomeScreen';
import { LoginDialog } from '@renderer/components/LoginDialog';
import { McpPanel } from '@renderer/components/McpPanel';
import { FileTreePanel } from '@renderer/components/FileTreePanel';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Button } from '@renderer/components/ui/button';
import { X } from 'lucide-react';
import { useFileTree } from '@renderer/hooks/useFileTree';

export function ChatPage() {
  const { messages, isLoading, error, sendMessage, abort, newSession, loadSession, setError, currentSessionId, approvalMode, changeApprovalMode, approveTool, contextUsage, currentModel, availableModels, changeModel } =
    useChat();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginDialogAllowClose, setLoginDialogAllowClose] = useState(false);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [mcpPanelOpen, setMcpPanelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { servers: mcpServers, loading: mcpLoading, refresh: refreshMcp } = useMcpServers();
  const { tree: fileTree, loading: fileTreeLoading, refresh: refreshFileTree } = useFileTree();
  const chatInputRef = useRef<ChatInputHandle>(null);

  const handleAddFileToInput = useCallback((filePath: string) => {
    chatInputRef.current?.insertFilePath(filePath);
  }, []);

  // 初始化时获取当前工作目录
  useEffect(() => {
    window.electronAPI.getCurrentCwd().then((cwd) => {
      if (cwd) {
        setCurrentProject(cwd);
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // 检查认证状态，未认证则弹出登录弹窗
  useEffect(() => {
    window.electronAPI.getDetailedAuthStatus().then(({ authenticated }) => {
      if (!authenticated) {
        setLoginDialogAllowClose(false);
        setLoginDialogOpen(true);
      }
    }).catch(() => {
      setLoginDialogAllowClose(false);
      setLoginDialogOpen(true);
    });
  }, []);

  // 消息更新自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSwitchProject = async () => {
    const folder = await window.electronAPI.openFolder();
    if (folder) {
      const result = await window.electronAPI.reinitialize(folder);
      if (result.success) {
        setCurrentProject(folder);
        // 重新加载会话列表
        window.location.reload();
      } else {
        // eslint-disable-next-line no-console
        console.error('Failed to reinitialize:', result.error);
      }
    }
  };

  return (
    <div className="flex h-full w-full bg-background">
      {/* 侧边栏 */}
      <AppSidebar
        onNewChat={newSession}
        onOpenAuth={() => {
          setLoginDialogAllowClose(true);
          setLoginDialogOpen(true);
        }}
        onSelectSession={(sessionId) => {
          void loadSession(sessionId);
        }}
        currentSessionId={currentSessionId}
        onOpenMcp={() => setMcpPanelOpen(true)}
        mcpServerCount={mcpServers.length}
      />

      {/* 主要聊天区域 */}
      <div className="flex flex-1 flex-col">
        {/* 错误横幅 */}
        {error && (
          <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={() => setError(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 欢迎屏幕或消息列表 */}
        {messages.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="mx-auto max-w-3xl pb-4">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onApprove={approveTool}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        )}

        {/* 聊天输入框 */}
        <ChatInput
          ref={chatInputRef}
          onSend={sendMessage}
          onAbort={abort}
          isLoading={isLoading}
          approvalMode={approvalMode}
          onApprovalModeChange={changeApprovalMode}
          contextUsage={contextUsage}
          currentModel={currentModel}
          availableModels={availableModels}
          onModelChange={changeModel}
        />
      </div>

      {/* 右侧文件树面板 */}
      <FileTreePanel
        tree={fileTree}
        loading={fileTreeLoading}
        onRefresh={refreshFileTree}
        onAddToInput={handleAddFileToInput}
        currentProject={currentProject ?? undefined}
        onSwitchProject={handleSwitchProject}
      />

      {/* 授权弹窗 */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onSuccess={() => setLoginDialogOpen(false)}
        onClose={() => setLoginDialogOpen(false)}
        allowClose={loginDialogAllowClose}
      />

      {/* MCP 服务器面板 */}
      <McpPanel
        open={mcpPanelOpen}
        onOpenChange={setMcpPanelOpen}
        servers={mcpServers}
        loading={mcpLoading}
        onRefresh={refreshMcp}
      />
    </div>
  );
}
