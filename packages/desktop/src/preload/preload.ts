/**
 * 预加载脚本 - 向渲染器进程暴露安全的 IPC 方法。
 */

import { contextBridge, ipcRenderer } from 'electron';

/** 会话列表项 */
export interface SessionListItem {
  sessionId: string;
  cwd: string;
  startTime: string;
  mtime: number;
  prompt: string;
  gitBranch?: string;
  filePath: string;
  messageCount: number;
}

/** 会话列表选项 */
export interface ListSessionsOptions {
  cursor?: number;
  size?: number;
}

/** 会话列表结果 */
export interface ListSessionsResult {
  items: SessionListItem[];
  nextCursor?: number;
  hasMore: boolean;
}

/** 会话数据用于恢复会话 */
export interface ResumedSessionData {
  conversation: ConversationRecord;
  filePath: string;
  lastCompletedUuid: string | null;
}

/** 对话记录 */
export interface ConversationRecord {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: ChatRecord[];
}

/** 聊天记录的 JSONL 格式 */
export interface ChatRecord {
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  cwd: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'tool_result' | 'system';
  subtype?: string;
  message?: unknown;
  toolCallResult?: unknown;
  usageMetadata?: unknown;
  model?: string;
  gitBranch?: string;
  systemPayload?: unknown;
}

/** 认证主菜单选项 */
export interface AuthMainOption {
  key: string;
  label: string;
  description: string;
}

/** API-KEY 子菜单选项 */
export interface ApiKeySubOption {
  key: string;
  label: string;
  description: string;
  region?: string;
}

/** 认证类型选项（两级结构） */
export interface AuthTypesResult {
  mainOptions: AuthMainOption[];
  apiKeySubOptions: ApiKeySubOption[];
}

/** 认证凭据 */
export interface AuthCredentials {
  apiKey?: string;
  baseUrl?: string;
}

/** 详细认证状态 */
export interface DetailedAuthStatus {
  authenticated: boolean;
  authType?: string;
}

/** Coding Plan 认证凭据 */
export interface CodingPlanCredentials {
  apiKey: string;
  region: 'china' | 'global';
}

/** 认证结果 */
export interface AuthStartResult {
  success: boolean;
  error?: string;
}

/** OAuth 事件数据 */
export interface OAuthEventData {
  status: 'requesting' | 'showing_uri' | 'polling' | 'success' | 'error' | 'timeout' | 'cancelled';
  verificationUri?: string;
  verificationUriComplete?: string;
  userCode?: string;
  expiresIn?: number;
  message?: string;
}

/** 初始化结果 */
export interface InitializeResult {
  success: boolean;
  error?: string;
}

/** 初始化状态 */
export interface InitStatus {
  isInitialized: boolean;
  currentCwd: string | null;
}

/** MCP 服务器信息 */
export interface McpServerInfo {
  name: string;
  status: 'connected' | 'connecting' | 'disconnected';
  toolCount: number;
  tools: Array<{ name: string; displayName: string; description: string }>;
}

/** 剪贴板文件项 */
export interface ClipboardFileItem {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

/** 剪贴板读取结果 */
export interface ClipboardReadResult {
  type: 'image' | 'file';
  items: ClipboardFileItem[];
}

/** IPC 传输用的附件数据 */
export interface IpcAttachment {
  type: 'image' | 'file';
  name: string;
  /** image: base64 data URL; file: 文件绝对路径 */
  data: string;
  mimeType: string;
}

/** Electron API 接口定义 */
export interface ElectronAPI {
  sendMessage: (
    message: string,
    attachments?: IpcAttachment[],
  ) => Promise<void>;
  abortChat: () => Promise<void>;
  newSession: () => Promise<void>;
  onStreamEvent: (callback: (event: unknown) => void) => () => void;

  listSessions: (options?: ListSessionsOptions) => Promise<ListSessionsResult>;
  removeSession: (sessionId: string) => Promise<boolean>;
  loadSession: (sessionId: string) => Promise<ResumedSessionData | undefined>;

  setApiKey: (apiKey: string) => Promise<void>;
  getAuthStatus: () => Promise<boolean>;
  getApprovalMode: () => Promise<string>;
  setApprovalMode: (mode: string) => Promise<void>;

  // Auth API
  getAuthTypes: () => Promise<AuthTypesResult>;
  startAuth: (
    authType: string,
    credentials?: AuthCredentials,
  ) => Promise<AuthStartResult>;
  startCodingPlanAuth: (
    credentials: CodingPlanCredentials,
  ) => Promise<AuthStartResult>;
  getDetailedAuthStatus: () => Promise<DetailedAuthStatus>;
  getCurrentAuthType: () => Promise<string | null>;
  cancelOAuth: () => Promise<void>;
  onAuthEvent: (callback: (event: OAuthEventData) => void) => () => void;

  openFolder: () => Promise<string | null>;

  approveTool: (callId: string, outcome?: string) => Promise<void>;
  rejectTool: (callId: string) => Promise<void>;

  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // 项目文件列表
  listProjectFiles: (pattern?: string) => Promise<string[]>;

  // 项目目录选择功能
  initializeApp: (cwd: string) => Promise<InitializeResult>;
  getInitStatus: () => Promise<InitStatus>;
  reinitialize: (cwd: string) => Promise<InitializeResult>;
  getCurrentCwd: () => Promise<string | null>;

  // 剪贴板文件读取
  readClipboardFiles: () => Promise<ClipboardReadResult | null>;
  // 读取文件为 data URL（用于图片预览）
  readFileAsDataUrl: (filePath: string) => Promise<string | null>;

  // MCP 服务器状态
  getMcpServers: () => Promise<McpServerInfo[]>;

  // Skills 列表
  listSkills: () => Promise<Array<{ name: string; description: string }>>;

  // 模型管理
  getCurrentModel: () => Promise<{
    model: string | null;
    authType: string | null;
  }>;
  getAllModels: () => Promise<
    Array<{
      id: string;
      label: string;
      authType: string;
      isRuntimeModel?: boolean;
      runtimeSnapshotId?: string;
      description?: string;
    }>
  >;
  switchModel: (authType: string, modelId: string) => Promise<void>;

  // 用系统默认浏览器打开外部链接
  openExternal: (url: string) => Promise<void>;

  // 输出语言管理
  getOutputLanguage: () => Promise<{ setting: string; resolved: string }>;
  setOutputLanguage: (
    language: string,
  ) => Promise<{ success: boolean; resolved?: string; error?: string }>;
}

const api: ElectronAPI = {
  sendMessage: (message: string, attachments?: IpcAttachment[]) =>
    ipcRenderer.invoke('chat:send', message, attachments),
  abortChat: () => ipcRenderer.invoke('chat:abort'),
  newSession: () => ipcRenderer.invoke('chat:new-session'),
  onStreamEvent: (callback: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data);
    };
    ipcRenderer.on('chat:stream-event', handler);
    return () => {
      ipcRenderer.removeListener('chat:stream-event', handler);
    };
  },

  listSessions: (options?: ListSessionsOptions) =>
    ipcRenderer.invoke('session:list', options),
  removeSession: (sessionId: string) =>
    ipcRenderer.invoke('session:remove', sessionId),
  loadSession: (sessionId: string) =>
    ipcRenderer.invoke('session:load', sessionId),
  setApiKey: (apiKey: string) =>
    ipcRenderer.invoke('config:set-api-key', apiKey),
  getAuthStatus: () => ipcRenderer.invoke('config:get-auth-status'),
  getApprovalMode: () => ipcRenderer.invoke('config:get-approval-mode'),
  setApprovalMode: (mode: string) =>
    ipcRenderer.invoke('config:set-approval-mode', mode),

  // Auth API
  getAuthTypes: () => ipcRenderer.invoke('auth:get-types'),
  startAuth: (authType: string, credentials?: AuthCredentials) =>
    ipcRenderer.invoke('auth:start', authType, credentials),
  startCodingPlanAuth: (credentials: CodingPlanCredentials) =>
    ipcRenderer.invoke(
      'auth:start-coding-plan',
      credentials.apiKey,
      credentials.region,
    ),
  getDetailedAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  getCurrentAuthType: () => ipcRenderer.invoke('auth:get-current-type'),
  cancelOAuth: () => ipcRenderer.invoke('auth:cancel-oauth'),
  onAuthEvent: (callback: (event: OAuthEventData) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: OAuthEventData,
    ) => {
      callback(data);
    };
    ipcRenderer.on('auth:oauth-event', handler);
    return () => {
      ipcRenderer.removeListener('auth:oauth-event', handler);
    };
  },

  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),

  approveTool: (callId: string, outcome?: string) =>
    ipcRenderer.invoke('tool:approve', callId, outcome),
  rejectTool: (callId: string) => ipcRenderer.invoke('tool:reject', callId),

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // 项目文件列表
  listProjectFiles: (pattern?: string) =>
    ipcRenderer.invoke('files:list', pattern),

  // 项目目录选择功能
  initializeApp: (cwd: string) => ipcRenderer.invoke('app:initialize', cwd),
  getInitStatus: () => ipcRenderer.invoke('app:get-init-status'),
  reinitialize: (cwd: string) => ipcRenderer.invoke('app:reinitialize', cwd),
  getCurrentCwd: () => ipcRenderer.invoke('app:get-current-cwd'),

  // 剪贴板文件读取
  readClipboardFiles: () => ipcRenderer.invoke('clipboard:read-files'),
  // 读取文件为 data URL（用于图片预览）
  readFileAsDataUrl: (filePath: string) =>
    ipcRenderer.invoke('file:read-as-data-url', filePath),

  // MCP 服务器状态
  getMcpServers: () => ipcRenderer.invoke('mcp:get-servers'),

  // Skills 列表
  listSkills: () => ipcRenderer.invoke('skills:list'),

  // 模型管理
  getCurrentModel: () => ipcRenderer.invoke('model:get-current'),
  getAllModels: () => ipcRenderer.invoke('model:get-all'),
  switchModel: (authType: string, modelId: string) =>
    ipcRenderer.invoke('model:switch', authType, modelId),

  // 用系统默认浏览器打开外部链接
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // 输出语言管理
  getOutputLanguage: () => ipcRenderer.invoke('language:get-output'),
  setOutputLanguage: (language: string) =>
    ipcRenderer.invoke('language:set-output', language),
};

contextBridge.exposeInMainWorld('electronAPI', api);
