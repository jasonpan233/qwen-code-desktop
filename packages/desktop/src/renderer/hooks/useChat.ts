import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ChatMessage,
  ToolCallInfo,
  ContentBlock,
  ResumedSessionData,
  Attachment,
} from '@renderer/types';
import { buildResumedChatMessages } from '@renderer/lib/resumeHistoryUtils';

interface ChatStreamEvent {
  type: string;
  data: Record<string, unknown> | null;
}

/** 聊天 Hook - 处理聊天消息的发送和流式响应 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [approvalMode, setApprovalModeState] = useState<string>('default');
  const [contextUsage, setContextUsage] = useState<{
    promptTokenCount: number;
    contextWindowSize: number;
  }>({ promptTokenCount: 0, contextWindowSize: 0 });
  const [currentModel, setCurrentModel] = useState<{
    model: string | null;
    authType: string | null;
  }>({ model: null, authType: null });
  const [availableModels, setAvailableModels] = useState<
    Array<{
      id: string;
      label: string;
      authType: string;
      isRuntimeModel?: boolean;
      runtimeSnapshotId?: string;
      description?: string;
    }>
  >([]);
  const currentAssistantIdRef = useRef<string | null>(null);

  // 监听流式事件
  useEffect(() => {
    const cleanup = window.electronAPI.onStreamEvent((event: unknown) => {
      const streamEvent = event as ChatStreamEvent;
      handleStreamEvent(streamEvent);
    });
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 初始化时获取当前审批模式
  useEffect(() => {
    window.electronAPI
      .getApprovalMode()
      .then((mode) => {
        setApprovalModeState(mode);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  // 初始化时获取当前模型和模型列表
  useEffect(() => {
    window.electronAPI
      .getCurrentModel()
      .then((result) => setCurrentModel(result))
      .catch(() => {
        // ignore
      });
    window.electronAPI
      .getAllModels()
      .then((models) => setAvailableModels(models))
      .catch(() => {
        // ignore
      });
  }, []);

  /** 处理流式事件 */
  const handleStreamEvent = useCallback((event: ChatStreamEvent) => {
    switch (event.type) {
      case 'content': {
        const text = (event.data as { text: string })?.text ?? '';
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant'
          ) {
            const blocks = last.blocks ?? [];
            const lastBlock = blocks[blocks.length - 1];

            // 如果最后一个块是 content 类型，追加文本
            if (lastBlock && lastBlock.type === 'content') {
              const updatedBlocks = [
                ...blocks.slice(0, -1),
                { ...lastBlock, text: lastBlock.text + text },
              ];
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: last.content + text,
                  blocks: updatedBlocks,
                },
              ];
            }

            // 否则创建新的 content 块
            const newBlock: ContentBlock = { type: 'content', text };
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: last.content + text,
                blocks: [...blocks, newBlock],
              },
            ];
          }
          return prev;
        });
        break;
      }

      case 'thought': {
        // ThoughtSummary 结构: { subject: string, description: string }
        const thoughtData = event.data as {
          subject?: string;
          description?: string;
        } | null;
        // 组合 subject 和 description 作为思考内容
        const thoughtText = [thoughtData?.subject, thoughtData?.description]
          .filter(Boolean)
          .join(': ');

        if (thoughtText) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (
              last &&
              last.id === currentAssistantIdRef.current &&
              last.role === 'assistant'
            ) {
              const blocks = last.blocks ?? [];
              const lastBlock = blocks[blocks.length - 1];

              // 如果最后一个块是 thought 类型，追加文本
              if (lastBlock && lastBlock.type === 'thought') {
                const updatedBlocks = [
                  ...blocks.slice(0, -1),
                  { ...lastBlock, text: lastBlock.text + thoughtText },
                ];
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    blocks: updatedBlocks,
                  },
                ];
              }

              // 否则创建新的 thought 块
              const newBlock: ContentBlock = {
                type: 'thought',
                text: thoughtText,
              };
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  blocks: [...blocks, newBlock],
                },
              ];
            }
            return prev;
          });
        }
        break;
      }

      case 'tool-call-request': {
        const toolData = event.data as {
          callId: string;
          name: string;
          displayName?: string;
          description?: string;
          args: Record<string, unknown>;
        };
        const toolCall: ToolCallInfo = {
          callId: toolData.callId,
          name: toolData.name,
          displayName: toolData.displayName,
          description: toolData.description,
          args: toolData.args,
          status: 'running',
        };
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant'
          ) {
            const blocks = last.blocks ?? [];
            // 工具调用始终创建新块
            const newBlock: ContentBlock = { type: 'tool_call', toolCall };
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                toolCalls: [...(last.toolCalls ?? []), toolCall],
                blocks: [...blocks, newBlock],
              },
            ];
          }
          return prev;
        });
        break;
      }

      case 'tool-approval-request': {
        const approvalData = event.data as {
          callId: string;
          toolName: string;
          confirmationType: string;
          confirmationTitle: string;
          confirmationDescription?: string;
          // edit 字段
          fileDiff?: string;
          fileName?: string;
          // exec 字段
          command?: string;
          // plan 字段
          plan?: string;
          // mcp 字段
          serverName?: string;
          toolDisplayName?: string;
          // info 字段
          prompt?: string;
          urls?: string[];
        };
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant' &&
            last.toolCalls
          ) {
            const updatedToolCalls = last.toolCalls.map((tc) =>
              tc.callId === approvalData.callId
                ? {
                    ...tc,
                    status: 'awaiting_approval' as const,
                    confirmationType: approvalData.confirmationType as
                      | 'exec'
                      | 'edit'
                      | 'plan'
                      | 'mcp'
                      | 'info',
                    confirmationTitle: approvalData.confirmationTitle,
                    confirmationDescription:
                      approvalData.confirmationDescription,
                    confirmationFileDiff: approvalData.fileDiff,
                    confirmationFileName: approvalData.fileName,
                    confirmationCommand: approvalData.command,
                    confirmationPlan: approvalData.plan,
                    confirmationServerName: approvalData.serverName,
                    confirmationToolDisplayName: approvalData.toolDisplayName,
                    confirmationPrompt: approvalData.prompt,
                    confirmationUrls: approvalData.urls,
                  }
                : tc,
            );
            // 同步更新 blocks 中的工具调用状态
            const updatedBlocks = (last.blocks ?? []).map((block) =>
              block.type === 'tool_call' &&
              block.toolCall.callId === approvalData.callId
                ? {
                    ...block,
                    toolCall: updatedToolCalls.find(
                      (tc) => tc.callId === approvalData.callId,
                    )!,
                  }
                : block,
            );
            return [
              ...prev.slice(0, -1),
              { ...last, toolCalls: updatedToolCalls, blocks: updatedBlocks },
            ];
          }
          return prev;
        });
        break;
      }

      case 'tool-call-response': {
        const responseData = event.data as {
          callId: string;
          error?: string;
          resultDisplay?: unknown;
        };
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant' &&
            last.toolCalls
          ) {
            const updatedToolCalls = last.toolCalls.map((tc) =>
              tc.callId === responseData.callId
                ? {
                    ...tc,
                    status: responseData.error
                      ? ('failed' as const)
                      : ('completed' as const),
                    error: responseData.error,
                    resultDisplay:
                      responseData.resultDisplay as ToolCallInfo['resultDisplay'],
                  }
                : tc,
            );
            // 同步更新 blocks 中的工具调用状态
            const updatedBlocks = (last.blocks ?? []).map((block) =>
              block.type === 'tool_call' &&
              block.toolCall.callId === responseData.callId
                ? {
                    ...block,
                    toolCall: updatedToolCalls.find(
                      (tc) => tc.callId === responseData.callId,
                    )!,
                  }
                : block,
            );
            return [
              ...prev.slice(0, -1),
              { ...last, toolCalls: updatedToolCalls, blocks: updatedBlocks },
            ];
          }
          return prev;
        });
        break;
      }

      case 'tool-output-update': {
        const outputData = event.data as {
          callId: string;
          output: unknown;
        };
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant' &&
            last.toolCalls
          ) {
            const updatedToolCalls = last.toolCalls.map((tc) =>
              tc.callId === outputData.callId
                ? {
                    ...tc,
                    liveOutput: outputData.output as ToolCallInfo['liveOutput'],
                  }
                : tc,
            );
            // 同步更新 blocks
            const updatedBlocks = (last.blocks ?? []).map((block) =>
              block.type === 'tool_call' &&
              block.toolCall.callId === outputData.callId
                ? {
                    ...block,
                    toolCall: updatedToolCalls.find(
                      (tc) => tc.callId === outputData.callId,
                    )!,
                  }
                : block,
            );
            return [
              ...prev.slice(0, -1),
              { ...last, toolCalls: updatedToolCalls, blocks: updatedBlocks },
            ];
          }
          return prev;
        });
        break;
      }

      case 'error': {
        const errorData = event.data as { message: string } | null;
        setError(errorData?.message ?? 'An error occurred');
        setIsLoading(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant'
          ) {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        break;
      }

      case 'finished': {
        setIsLoading(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant'
          ) {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        currentAssistantIdRef.current = null;
        break;
      }

      case 'user-cancelled': {
        setIsLoading(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.id === currentAssistantIdRef.current &&
            last.role === 'assistant'
          ) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                isStreaming: false,
                content: last.content + '\n\n*[Cancelled]*',
              },
            ];
          }
          return prev;
        });
        currentAssistantIdRef.current = null;
        break;
      }

      case 'context-usage': {
        const usageData = event.data as {
          promptTokenCount: number;
          contextWindowSize: number;
        };
        setContextUsage(usageData);
        break;
      }

      default:
        break;
    }
  }, []);

  /** 发送消息 */
  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      const hasContent = content.trim().length > 0;
      const hasAttachments = attachments && attachments.length > 0;
      if ((!hasContent && !hasAttachments) || isLoading) return;

      setError(null);

      const messageContent = content.trim();

      // 构建用于 UI 显示的用户消息（附件信息保留在 attachments 字段中）
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: messageContent,
        timestamp: Date.now(),
        attachments,
      };

      // 添加空助手消息用于流式显示
      const assistantId = crypto.randomUUID();
      currentAssistantIdRef.current = assistantId;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      try {
        // 将附件转换为 IPC 传输格式
        const ipcAttachments = hasAttachments
          ? attachments.map((att) => ({
              type: att.type,
              name: att.name,
              data: att.data,
              mimeType:
                att.mimeType ||
                (att.type === 'image' ? 'image/png' : 'text/plain'),
            }))
          : undefined;

        await window.electronAPI.sendMessage(messageContent, ipcAttachments);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  /** 中止当前请求 */
  const abort = useCallback(async () => {
    try {
      await window.electronAPI.abortChat();
    } catch {
      // 忽略中止错误
    }
  }, []);

  /** 新建会话 */
  const newSession = useCallback(async () => {
    try {
      await window.electronAPI.newSession();
      setMessages([]);
      setCurrentSessionId(null);
      setError(null);
      setIsLoading(false);
      setContextUsage({ promptTokenCount: 0, contextWindowSize: 0 });
      currentAssistantIdRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /** 设置审批模式 */
  const changeApprovalMode = useCallback(async (mode: string) => {
    try {
      await window.electronAPI.setApprovalMode(mode);
      setApprovalModeState(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /** 切换模型 */
  const changeModel = useCallback(async (authType: string, modelId: string) => {
    try {
      await window.electronAPI.switchModel(authType, modelId);
      // 刷新当前模型和列表
      const [updatedModel, updatedModels] = await Promise.all([
        window.electronAPI.getCurrentModel(),
        window.electronAPI.getAllModels(),
      ]);
      setCurrentModel(updatedModel);
      setAvailableModels(updatedModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /** 工具审批操作（统一处理批准/拒绝，支持不同 outcome） */
  const approveTool = useCallback(async (callId: string, outcome?: string) => {
    try {
      await window.electronAPI.approveTool(callId, outcome);
      const isCancelled = outcome === 'cancel';
      // 更新 UI 中工具状态
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.toolCalls) {
          const updatedToolCalls = last.toolCalls.map((tc) =>
            tc.callId === callId
              ? isCancelled
                ? { ...tc, status: 'failed' as const, error: '用户拒绝执行' }
                : { ...tc, status: 'running' as const }
              : tc,
          );
          // 同步更新 blocks
          const updatedBlocks = (last.blocks ?? []).map((block) =>
            block.type === 'tool_call' && block.toolCall.callId === callId
              ? {
                  ...block,
                  toolCall: updatedToolCalls.find(
                    (tc) => tc.callId === callId,
                  )!,
                }
              : block,
          );
          return [
            ...prev.slice(0, -1),
            { ...last, toolCalls: updatedToolCalls, blocks: updatedBlocks },
          ];
        }
        return prev;
      });
    } catch {
      // 忽略错误
    }
  }, []);

  /** 拒绝工具调用 */
  const rejectTool = useCallback(async (callId: string) => {
    try {
      await window.electronAPI.rejectTool(callId);
      // 更新 UI 中工具状态为 failed
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.toolCalls) {
          const updatedToolCalls = last.toolCalls.map((tc) =>
            tc.callId === callId
              ? { ...tc, status: 'failed' as const, error: '用户拒绝执行' }
              : tc,
          );
          return [
            ...prev.slice(0, -1),
            { ...last, toolCalls: updatedToolCalls },
          ];
        }
        return prev;
      });
    } catch {
      // 忽略错误
    }
  }, []);

  /** 加载会话 */
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const sessionData: ResumedSessionData | undefined =
        await window.electronAPI.loadSession(sessionId);
      if (sessionData) {
        const chatMessages = buildResumedChatMessages(sessionData);
        setMessages(chatMessages);
        setCurrentSessionId(sessionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    abort,
    newSession,
    loadSession,
    setError,
    currentSessionId,
    approvalMode,
    changeApprovalMode,
    approveTool,
    rejectTool,
    contextUsage,
    currentModel,
    availableModels,
    changeModel,
  };
}
