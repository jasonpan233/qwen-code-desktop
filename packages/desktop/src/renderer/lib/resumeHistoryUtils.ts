/**
 * 会话恢复工具 - 将加载的会话数据转换为 UI 可显示的消息格式
 */

import type { ResumedSessionData } from '@preload/preload';
import type {
  ChatMessage,
  ContentBlock,
  ToolCallInfo,
  ToolResultDisplay,
} from '@renderer/types';

/**
 * 从消息 parts 中提取文本内容（排除思考部分和文件引用内容）
 */
function extractTextFromParts(parts: unknown[]): string {
  if (!parts || !Array.isArray(parts)) return '';

  const textParts: string[] = [];
  for (const part of parts) {
    if (part && typeof part === 'object' && 'text' in part) {
      const partObj = part as Record<string, unknown>;
      // 跳过思考部分
      if (!('thought' in partObj && partObj.thought)) {
        const text = partObj.text as string;
        if (text) {
          textParts.push(text);
        }
      }
    }
  }

  const fullText = textParts.join('\n');
  return filterFileReferenceContent(fullText);
}

/**
 * 过滤掉用户消息中的文件引用内容
 * 模式：--- Content from referenced files --- ... --- End of content ---
 */
function filterFileReferenceContent(content: string): string {
  const FILE_REFERENCE_START = '--- Content from referenced files ---';
  const FILE_REFERENCE_END = '--- End of content ---';

  const startIndex = content.indexOf(FILE_REFERENCE_START);
  if (startIndex === -1) {
    return content;
  }

  const endIndex = content.indexOf(FILE_REFERENCE_END, startIndex);
  if (endIndex === -1) {
    // 只有开始标记，没有结束标记，截取到开始标记之前
    return content.substring(0, startIndex).trim();
  }

  // 保留开始标记之前的内容和结束标记之后的内容
  const before = content.substring(0, startIndex).trim();
  const after = content.substring(endIndex + FILE_REFERENCE_END.length).trim();

  const result = [before, after].filter(Boolean).join('\n\n');
  return result;
}

/**
 * 从消息 parts 中提取思考内容
 */
function extractThoughtFromParts(parts: unknown[]): string {
  if (!parts || !Array.isArray(parts)) return '';

  const thoughtParts: string[] = [];
  for (const part of parts) {
    if (part && typeof part === 'object' && 'text' in part) {
      const partObj = part as Record<string, unknown>;
      if ('thought' in partObj && partObj.thought) {
        const text = partObj.text as string;
        if (text) {
          thoughtParts.push(text);
        }
      }
    }
  }
  return thoughtParts.join('\n');
}

/**
 * 从消息 parts 中提取函数调用
 */
function extractFunctionCalls(parts: unknown[]): Array<{
  id: string;
  name: string;
  args: Record<string, unknown>;
}> {
  if (!parts || !Array.isArray(parts)) return [];

  const calls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }> = [];

  for (const part of parts) {
    if (part && typeof part === 'object' && 'functionCall' in part) {
      const partObj = part as Record<string, unknown>;
      const fc = partObj.functionCall as Record<string, unknown> | undefined;
      if (fc && typeof fc === 'object') {
        calls.push({
          id: (fc.id as string) || `call-${calls.length}`,
          name: (fc.name as string) || 'unknown',
          args: (fc.args as Record<string, unknown>) || {},
        });
      }
    }
  }
  return calls;
}

/**
 * 将会话数据转换为 ChatMessage 数组
 *
 * @param sessionData 从 SessionService 加载的会话数据
 * @returns 用于 UI 显示的 ChatMessage 数组
 */
export function buildResumedChatMessages(
  sessionData: ResumedSessionData,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const pendingToolCalls = new Map<
    string,
    { name: string; args: Record<string, unknown> }
  >();

  for (const record of sessionData.conversation.messages) {
    // 跳过系统消息
    if (record.type === 'system') {
      continue;
    }

    switch (record.type) {
      case 'user': {
        const parts = (record.message as Record<string, unknown>)?.parts;
        const text = parts ? extractTextFromParts(parts as unknown[]) : '';

        if (text) {
          messages.push({
            id: record.uuid,
            role: 'user',
            content: text,
            timestamp: new Date(record.timestamp).getTime(),
          });
        }
        break;
      }

      case 'assistant': {
        const messageObj = record.message as
          | Record<string, unknown>
          | undefined;
        const parts = messageObj?.parts;

        // 提取思考内容
        const thought = parts
          ? extractThoughtFromParts(parts as unknown[])
          : '';

        // 提取文本内容
        const text = parts ? extractTextFromParts(parts as unknown[]) : '';

        // 提取函数调用
        const functionCalls = parts
          ? extractFunctionCalls(parts as unknown[])
          : [];

        // 构建工具调用信息
        const toolCalls: ToolCallInfo[] = [];
        for (const fc of functionCalls) {
          pendingToolCalls.set(fc.id, { name: fc.name, args: fc.args });
          toolCalls.push({
            callId: fc.id,
            name: fc.name,
            displayName: undefined, // 恢复时无法获取 displayName
            description: undefined,
            args: fc.args,
            status: 'pending',
          });
        }

        // 如果有思考或文本内容，创建消息
        if (thought || text || toolCalls.length > 0) {
          // 构建 blocks 数组
          const blocks: ContentBlock[] = [];
          if (thought) {
            blocks.push({ type: 'thought', text: thought });
          }
          if (text) {
            blocks.push({ type: 'content', text });
          }
          for (const tc of toolCalls) {
            blocks.push({ type: 'tool_call', toolCall: tc });
          }

          messages.push({
            id: record.uuid,
            role: 'assistant',
            content: text,
            timestamp: new Date(record.timestamp).getTime(),
            blocks: blocks.length > 0 ? blocks : undefined,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          });
        }
        break;
      }

      case 'tool_result': {
        // 更新对应的工具调用状态
        if (
          record.toolCallResult &&
          typeof record.toolCallResult === 'object'
        ) {
          const result = record.toolCallResult as Record<string, unknown>;
          const callId = result.callId as string | undefined;

          if (callId) {
            // 查找最后一条包含此工具调用的助手消息
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i];
              if (msg.role === 'assistant' && msg.toolCalls) {
                const toolCall = msg.toolCalls.find(
                  (tc) => tc.callId === callId,
                );
                if (toolCall) {
                  toolCall.status = result.error ? 'failed' : 'completed';
                  if (result.error) {
                    // result.error 可能是 Error 实例、{ message, type } 对象或字符串
                    const err = result.error;
                    if (typeof err === 'string') {
                      toolCall.error = err;
                    } else if (err instanceof Error) {
                      toolCall.error = err.message;
                    } else if (
                      err &&
                      typeof err === 'object' &&
                      'message' in err
                    ) {
                      toolCall.error = String(
                        (err as { message: unknown }).message,
                      );
                    } else {
                      toolCall.error = String(err);
                    }
                  }
                  // 恢复 resultDisplay
                  if (result.resultDisplay) {
                    toolCall.resultDisplay =
                      result.resultDisplay as ToolResultDisplay;
                  }
                  // 同步更新 blocks 中的 tool_call
                  if (msg.blocks) {
                    const blockIdx = msg.blocks.findIndex(
                      (b) =>
                        b.type === 'tool_call' && b.toolCall.callId === callId,
                    );
                    if (blockIdx !== -1) {
                      msg.blocks[blockIdx] = {
                        type: 'tool_call',
                        toolCall,
                      };
                    }
                  }
                  break;
                }
              }
            }
          }
        }
        break;
      }

      default:
        // 跳过未知类型
        break;
    }
  }

  return messages;
}
