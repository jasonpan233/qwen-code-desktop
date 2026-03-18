/** 桌面渲染器类型定义 */

import type { ElectronAPI, ResumedSessionData } from '@preload/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

/** 附件类型 - 用于粘贴的图片或文件 */
export interface Attachment {
  /** 唯一标识 */
  id: string;
  /** 附件类型: image = 剪贴板图片, file = 文件管理器复制的文件 */
  type: 'image' | 'file';
  /** 显示名称 */
  name: string;
  /** 图片: base64 data URL; 文件: 文件绝对路径 */
  data: string;
  /** 文件大小 (bytes) */
  size?: number;
  /** MIME 类型 */
  mimeType?: string;
}

/** 内容块类型 - 用于分段渲染 thought/content/tool_call */
export type ContentBlock =
  | { type: 'thought'; text: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; toolCall: ToolCallInfo };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  /** 用户消息的附件（粘贴的图片或文件） */
  attachments?: Attachment[];
  /** 内容块数组 - 用于 assistant 消息的分段渲染 */
  blocks?: ContentBlock[];
  /** 工具调用信息 - 用于工具状态管理和快速查找 */
  toolCalls?: ToolCallInfo[];
  /** 本轮 assistant 执行编辑工具前的 git 快照 hash，用于回滚 */
  checkpointCommitHash?: string;
}

/** 文件差异展示 */
export interface FileDiffDisplay {
  fileDiff: string;
  fileName: string;
}

/** Todo 列表展示 */
export interface TodoResultDisplay {
  type: 'todo_list';
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
  }>;
}

/** 计划摘要展示 */
export interface PlanResultDisplay {
  type: 'plan_summary';
  message: string;
  plan: string;
}

/** ANSI 输出展示 */
export interface AnsiOutputDisplay {
  ansiOutput: string[];
}

/** MCP 工具进度展示 */
export interface McpToolProgressDisplay {
  type: 'mcp_tool_progress';
  progress: number;
  total?: number;
  message?: string;
}

/** 工具结果展示 - 多态联合类型 (对齐 CLI 的 ToolResultDisplay) */
export type ToolResultDisplay =
  | string
  | FileDiffDisplay
  | TodoResultDisplay
  | PlanResultDisplay
  | AnsiOutputDisplay
  | McpToolProgressDisplay;

export interface ToolCallInfo {
  callId: string;
  /** 工具原始名称（如 "edit_file"） */
  name: string;
  /** 工具展示名称（如 "Edit"） */
  displayName?: string;
  /** 工具调用的人类可读描述（如文件路径、命令内容） */
  description?: string;
  args: Record<string, unknown>;
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'awaiting_approval'
    | 'canceled';
  error?: string;
  /** 工具执行结果展示 */
  resultDisplay?: ToolResultDisplay;
  /** 实时输出（如 Shell ANSI 输出流） */
  liveOutput?: ToolResultDisplay;
  confirmationType?: 'exec' | 'edit' | 'plan' | 'mcp' | 'info';
  confirmationTitle?: string;
  confirmationDescription?: string;
  /** 编辑确认的 diff 内容 */
  confirmationFileDiff?: string;
  /** 编辑确认的文件名 */
  confirmationFileName?: string;
  /** 执行确认的命令 */
  confirmationCommand?: string;
  /** 计划确认的计划内容 (Markdown) */
  confirmationPlan?: string;
  /** MCP 确认的服务器名 */
  confirmationServerName?: string;
  /** MCP 确认的工具展示名 */
  confirmationToolDisplayName?: string;
  /** Info 确认的提示内容 */
  confirmationPrompt?: string;
  /** Info 确认的 URL 列表 */
  confirmationUrls?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

// 重新导出会话相关类型
export type { ResumedSessionData };
