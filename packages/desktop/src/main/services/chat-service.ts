/**
 * Chat Service - 桥接 Electron 主进程与 @qwen-code/core
 *
 * 此服务封装了核心的 GeminiClient 和 Config，为渲染器进程提供
 * 通过 IPC 调用的高级 API。
 */

import type { Config } from '@qwen-code/qwen-code-core';
import {
  ApprovalMode,
  AuthType,
  GeminiClient,
  GeminiEventType,
  executeToolCall,
  readManyFiles,
  ToolConfirmationOutcome,
  uiTelemetryService,
  qwenOAuth2Events,
  QwenOAuth2Event,
  Storage,
  type ModelProvidersConfig,
  type ProviderModelConfig,
  type ResumedSessionData,
  type ServerGeminiStreamEvent,
  type ToolCallRequestInfo,
  type ToolCall,
  type WaitingToolCall,
  type DeviceAuthorizationData,
} from '@qwen-code/qwen-code-core';
import {
  CodingPlanRegion,
  CODING_PLAN_ENV_KEY,
  getCodingPlanConfig,
  isCodingPlanConfig,
} from '../constants/codingPlan.js';
import type { Part, PartListUnion } from '@google/genai';
import initCommand from '../Command/initCommand.js';
import type { IpcAttachment } from '../../preload/preload.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import stripJsonComments from 'strip-json-comments';

/** 从主进程发送到渲染器进程的事件 */
export interface ChatStreamEvent {
  type:
    | 'content'
    | 'thought'
    | 'tool-call-request'
    | 'tool-call-response'
    | 'tool-approval-request'
    | 'tool-output-update'
    | 'error'
    | 'finished'
    | 'retry'
    | 'user-cancelled'
    | 'session-list-update'
    | 'context-usage'
    | 'auth-oauth-event';
  data: unknown;
}

/** 认证结果 */
export interface AuthResult {
  success: boolean;
  error?: string;
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

/** OAuth 事件数据 */
export interface OAuthEventData {
  status:
    | 'requesting'
    | 'showing_uri'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'cancelled';
  verificationUri?: string;
  verificationUriComplete?: string;
  userCode?: string;
  expiresIn?: number;
  message?: string;
}

export class ChatService {
  private config: Config | null = null;
  private client: GeminiClient | null = null;
  private abortController: AbortController | null = null;
  private pendingToolApprovals = new Map<
    string,
    {
      onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
    }
  >();
  private uiTelemetryHandler:
    | ((data: { metrics: unknown; lastPromptTokenCount: number }) => void)
    | null = null;
  private oauthEventHandler: ((event: OAuthEventData) => void) | null = null;
  private currentAuthType: AuthType | null = null;
  private isAuthenticated = false;

  constructor(
    private readonly sendToRenderer: (event: ChatStreamEvent) => void,
  ) {}

  /**
   * 检查 Config 是否已初始化
   */
  isConfigInitialized(): boolean {
    return this.config !== null;
  }

  async initialize(workingDir: string): Promise<void> {
    // 延迟加载配置创建，避免在模块级别依赖 core
    const { createDesktopConfig } = await import('./config-factory.js');
    this.config = await createDesktopConfig(workingDir);
    await this.config.initialize();
  }

  /**
   * 启动认证流程（对齐 CLI 的 validateAuthMethod 逻辑）
   */
  async startAuth(
    authType: AuthType,
    credentials?: AuthCredentials,
  ): Promise<AuthResult> {
    if (!this.config) {
      return { success: false, error: 'Config not initialized' };
    }

    try {
      // 对于需要 API Key 的认证类型，先设置凭据
      if (credentials?.apiKey) {
        this.config.updateCredentials({
          apiKey: credentials.apiKey,
          ...(credentials.baseUrl ? { baseUrl: credentials.baseUrl } : {}),
        });
      }

      // 对于 Anthropic 需要 baseUrl
      if (authType === AuthType.USE_ANTHROPIC && credentials?.baseUrl) {
        process.env['ANTHROPIC_BASE_URL'] = credentials.baseUrl;
      }

      // 对于 Vertex AI 需要设置环境变量
      if (authType === AuthType.USE_VERTEX_AI) {
        process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
      }

      // 对于 QWEN_OAUTH，设置事件监听以转发 OAuth 事件到渲染器
      if (authType === AuthType.QWEN_OAUTH) {
        this.setupOAuthEventListeners();
      }

      await this.config.refreshAuth(authType);

      // 初始化 GeminiClient
      this.client = new GeminiClient(this.config);
      await this.client.initialize();

      // 订阅 uiTelemetryService
      this.setupTelemetryHandler();

      this.currentAuthType = authType;
      this.isAuthenticated = true;

      // 持久化 authType 到 settings.json（对齐 CLI 行为）
      this.persistAuthType(authType);

      // 清理 OAuth 事件监听
      if (authType === AuthType.QWEN_OAUTH) {
        this.cleanupOAuthEventListeners();
      }

      return { success: true };
    } catch (err) {
      // 清理 OAuth 事件监听
      this.cleanupOAuthEventListeners();
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * 取消进行中的 OAuth 流程
   */
  cancelAuth(): void {
    qwenOAuth2Events.emit(QwenOAuth2Event.AuthCancel);
    this.cleanupOAuthEventListeners();
  }

  /**
   * 返回主菜单认证选项（对齐 CLI /auth 的两级结构）
   */
  getAuthMainOptions(): AuthMainOption[] {
    return [
      {
        key: 'qwen-oauth',
        label: 'Qwen OAuth (免费)',
        description: '使用 QwenChat 账号登录，享受每日免费额度。',
      },
      {
        key: 'api-key',
        label: 'API-KEY',
        description: '使用 Coding Plan 凭证或自有 API Key / Provider。',
      },
    ];
  }

  /**
   * 返回 API-KEY 子菜单选项（对齐 CLI 的 Coding Plan / Custom 选择）
   */
  getApiKeySubOptions(): ApiKeySubOption[] {
    return [
      {
        key: 'coding-plan',
        label: 'Coding Plan (百炼, 中国)',
        description: '粘贴百炼 Coding Plan 的 API Key 即可完成配置。',
        region: CodingPlanRegion.CHINA,
      },
      {
        key: 'coding-plan-intl',
        label: 'Coding Plan (百炼, 全球/国际)',
        description: '粘贴百炼 Coding Plan 的 API Key 即可完成配置。',
        region: CodingPlanRegion.GLOBAL,
      },
      {
        key: 'custom',
        label: '自定义',
        description: '在 settings.json 中手动配置 modelProviders。',
      },
    ];
  }

  /**
   * Coding Plan 认证流程（对齐 CLI 的 handleCodingPlanSubmit）
   * 根据区域生成模板配置，写入 settings.json，然后 refreshAuth
   */
  async startCodingPlanAuth(
    apiKey: string,
    region: CodingPlanRegion,
  ): Promise<AuthResult> {
    if (!this.config) {
      return { success: false, error: 'Config not initialized' };
    }

    try {
      // 1. 获取 region 对应的模板配置
      const { template, version } = getCodingPlanConfig(region);

      // 2. 将 apiKey 写入 process.env
      process.env[CODING_PLAN_ENV_KEY] = apiKey;

      // 3. 生成 model configs
      const newConfigs: ProviderModelConfig[] = template.map(
        (templateConfig) => ({
          ...templateConfig,
          envKey: CODING_PLAN_ENV_KEY,
        }),
      );

      // 4. 读取现有 settings 并获取 existing configs
      const settingsPath = Storage.getGlobalSettingsPath();
      const currentSettings = this.readSettingsFile(settingsPath);
      const existingConfigs: ProviderModelConfig[] =
        (currentSettings.modelProviders as ModelProvidersConfig | undefined)?.[
          AuthType.USE_OPENAI
        ] || [];

      // 5. 过滤掉旧的 Coding Plan configs（互斥）
      const nonCodingPlanConfigs = existingConfigs.filter(
        (existing) => !isCodingPlanConfig(existing.baseUrl, existing.envKey),
      );

      // 6. 合并新配置
      const updatedConfigs = [...newConfigs, ...nonCodingPlanConfigs];

      // 7. 持久化到 settings.json
      if (!currentSettings.modelProviders) {
        currentSettings.modelProviders = {};
      }
      (currentSettings.modelProviders as Record<string, unknown>)[
        AuthType.USE_OPENAI
      ] = updatedConfigs;

      if (!currentSettings.security) {
        currentSettings.security = {};
      }
      if (!(currentSettings.security as Record<string, unknown>).auth) {
        (currentSettings.security as Record<string, unknown>).auth = {};
      }
      (
        (currentSettings.security as Record<string, unknown>).auth as Record<
          string,
          unknown
        >
      ).selectedType = AuthType.USE_OPENAI;

      if (!currentSettings.env) {
        currentSettings.env = {};
      }
      (currentSettings.env as Record<string, unknown>)[CODING_PLAN_ENV_KEY] =
        apiKey;

      if (!currentSettings.codingPlan) {
        currentSettings.codingPlan = {};
      }
      (currentSettings.codingPlan as Record<string, unknown>).region = region;
      (currentSettings.codingPlan as Record<string, unknown>).version = version;

      // 使用第一个模型作为默认模型
      if (updatedConfigs.length > 0 && updatedConfigs[0]?.id) {
        if (!currentSettings.model) {
          currentSettings.model = {};
        }
        (currentSettings.model as Record<string, unknown>).name =
          updatedConfigs[0].id;
      }

      this.writeSettingsFile(settingsPath, currentSettings);

      // 8. 热重载 modelProviders
      const updatedModelProviders: ModelProvidersConfig = {
        ...(currentSettings.modelProviders as ModelProvidersConfig),
      };
      this.config.reloadModelProvidersConfig(updatedModelProviders);

      // 9. refreshAuth
      await this.config.refreshAuth(AuthType.USE_OPENAI);

      // 10. 初始化 GeminiClient
      this.client = new GeminiClient(this.config);
      await this.client.initialize();

      this.setupTelemetryHandler();

      this.currentAuthType = AuthType.USE_OPENAI;
      this.isAuthenticated = true;

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * 从 settings.json 读取配置
   */
  private readSettingsFile(filePath: string): Record<string, unknown> {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed: unknown = JSON.parse(stripJsonComments(content));
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          return parsed as Record<string, unknown>;
        }
      }
    } catch {
      // Silently ignore malformed settings files
    }
    return {};
  }

  /**
   * 写入 settings.json
   */
  private writeSettingsFile(
    filePath: string,
    settings: Record<string, unknown>,
  ): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /**
   * 返回当前已选认证类型
   */
  getCurrentAuthType(): string | null {
    return this.currentAuthType;
  }

  /**
   * 兼容旧接口：返回所有支持的认证类型列表（保留供 IPC 使用）
   */
  getAvailableAuthTypes(): {
    mainOptions: AuthMainOption[];
    apiKeySubOptions: ApiKeySubOption[];
  } {
    return {
      mainOptions: this.getAuthMainOptions(),
      apiKeySubOptions: this.getApiKeySubOptions(),
    };
  }

  /**
   * 获取详细认证状态（懒加载恢复：首次调用时若未认证则尝试从持久化凭证恢复）
   */
  async getDetailedAuthStatus(): Promise<DetailedAuthStatus> {
    if (!this.isAuthenticated && this.config) {
      await this.tryRestoreAuth();
    }
    return {
      authenticated: this.isAuthenticated,
      authType: this.currentAuthType ?? undefined,
    };
  }

  /**
   * 尝试从持久化凭证恢复认证状态（对齐 CLI 的 validateAuthMethod 逻辑）。
   * 在 Config 已初始化但 isAuthenticated 为 false 时调用。
   */
  private async tryRestoreAuth(): Promise<boolean> {
    if (!this.config || this.isAuthenticated) {
      return this.isAuthenticated;
    }

    // 1. 从 settings 读取上次保存的 authType
    const savedAuthType = this.config.getModelsConfig().getCurrentAuthType();
    if (!savedAuthType) {
      return false;
    }

    // 2. 根据 authType 验证持久化凭证是否存在
    const hasValidCredentials =
      await this.validatePersistedCredentials(savedAuthType);
    if (!hasValidCredentials) {
      return false;
    }

    // 3. 尝试 refreshAuth 恢复认证状态
    try {
      // 对于 Vertex AI 需要设置环境变量
      if (savedAuthType === AuthType.USE_VERTEX_AI) {
        process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
      }

      await this.config.refreshAuth(savedAuthType);
      this.client = new GeminiClient(this.config);
      await this.client.initialize();
      this.setupTelemetryHandler();
      this.currentAuthType = savedAuthType;
      this.isAuthenticated = true;
      return true;
    } catch {
      // 恢复失败，静默回退到登录页
      return false;
    }
  }

  /**
   * 验证指定认证类型的持久化凭证是否存在。
   * 对齐 CLI 的 validateAuthMethod() 检查逻辑。
   */
  private async validatePersistedCredentials(
    authType: AuthType,
  ): Promise<boolean> {
    switch (authType) {
      case AuthType.QWEN_OAUTH: {
        // 检查 ~/.qwen/oauth_creds.json 是否存在
        const credsPath = path.join(os.homedir(), '.qwen', 'oauth_creds.json');
        return fs.existsSync(credsPath);
      }
      case AuthType.USE_OPENAI:
      case AuthType.USE_ANTHROPIC:
      case AuthType.USE_GEMINI:
      case AuthType.USE_VERTEX_AI: {
        return this.hasApiKeyForAuthType(authType);
      }
      default:
        return false;
    }
  }

  /**
   * 检查指定认证类型是否存在可用的 API Key（环境变量或 settings）。
   */
  private hasApiKeyForAuthType(authType: AuthType): boolean {
    const envKeyMap: Record<string, string> = {
      [AuthType.USE_OPENAI]: 'OPENAI_API_KEY',
      [AuthType.USE_ANTHROPIC]: 'ANTHROPIC_API_KEY',
      [AuthType.USE_GEMINI]: 'GEMINI_API_KEY',
      [AuthType.USE_VERTEX_AI]: 'GOOGLE_API_KEY',
    };

    const envKey = envKeyMap[authType];
    if (envKey && process.env[envKey]) {
      return true;
    }

    // 检查 settings.json 中的 apiKey
    const settingsPath = Storage.getGlobalSettingsPath();
    const settings = this.readSettingsFile(settingsPath);
    const apiKey = (settings.security as Record<string, unknown> | undefined)
      ?.auth as Record<string, unknown> | undefined;
    if (apiKey?.apiKey) {
      return true;
    }

    // 检查 settings.env 中是否有对应的环境变量
    const envSettings = settings.env as Record<string, string> | undefined;
    if (envKey && envSettings?.[envKey]) {
      return true;
    }

    return false;
  }

  /**
   * 将认证类型持久化到 settings.json（security.auth.selectedType）。
   */
  private persistAuthType(authType: AuthType): void {
    try {
      const settingsPath = Storage.getGlobalSettingsPath();
      const currentSettings = this.readSettingsFile(settingsPath);

      if (!currentSettings.security) {
        currentSettings.security = {};
      }
      if (!(currentSettings.security as Record<string, unknown>).auth) {
        (currentSettings.security as Record<string, unknown>).auth = {};
      }
      (
        (currentSettings.security as Record<string, unknown>).auth as Record<
          string,
          unknown
        >
      ).selectedType = authType;

      this.writeSettingsFile(settingsPath, currentSettings);
    } catch {
      // 持久化失败不影响当前会话
    }
  }

  private setupTelemetryHandler(): void {
    if (this.uiTelemetryHandler) {
      uiTelemetryService.off('update', this.uiTelemetryHandler);
    }
    this.uiTelemetryHandler = ({ lastPromptTokenCount }) => {
      const contextWindowSize =
        this.config?.getContentGeneratorConfig()?.contextWindowSize ?? 0;
      this.sendToRenderer({
        type: 'context-usage',
        data: { promptTokenCount: lastPromptTokenCount, contextWindowSize },
      });
    };
    uiTelemetryService.on('update', this.uiTelemetryHandler);
  }

  private setupOAuthEventListeners(): void {
    this.cleanupOAuthEventListeners();

    // 监听设备授权 URI 事件
    const authUriHandler = (data: DeviceAuthorizationData) => {
      this.sendToRenderer({
        type: 'auth-oauth-event' as ChatStreamEvent['type'],
        data: {
          status: 'showing_uri',
          verificationUri: data.verification_uri,
          verificationUriComplete: data.verification_uri_complete,
          userCode: data.user_code,
          expiresIn: data.expires_in,
        } as OAuthEventData,
      });
    };

    // 监听认证进度事件
    const progressHandler = (
      status: 'polling' | 'success' | 'error' | 'timeout' | 'rate_limit',
      message: string,
    ) => {
      const mappedStatus = status === 'rate_limit' ? 'error' : status;
      this.sendToRenderer({
        type: 'auth-oauth-event' as ChatStreamEvent['type'],
        data: {
          status: mappedStatus,
          message,
        } as OAuthEventData,
      });
    };

    qwenOAuth2Events.on(QwenOAuth2Event.AuthUri, authUriHandler);
    qwenOAuth2Events.on(QwenOAuth2Event.AuthProgress, progressHandler);

    this.oauthEventHandler = () => {
      qwenOAuth2Events.off(QwenOAuth2Event.AuthUri, authUriHandler);
      qwenOAuth2Events.off(QwenOAuth2Event.AuthProgress, progressHandler);
    };
  }

  private cleanupOAuthEventListeners(): void {
    if (this.oauthEventHandler) {
      this.oauthEventHandler({} as OAuthEventData);
      this.oauthEventHandler = null;
    }
  }

  async shutdown(): Promise<void> {
    // 移除 uiTelemetryService 事件监听
    if (this.uiTelemetryHandler) {
      uiTelemetryService.off('update', this.uiTelemetryHandler);
      this.uiTelemetryHandler = null;
    }
    if (this.config) {
      await this.config.shutdown();
    }
  }

  async sendMessage(
    message: string,
    attachments?: IpcAttachment[],
  ): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error('Chat service not initialized');
    }

    // 处理斜杠命令和 @文件引用，并合并附件 Parts
    const processedParts = await this.preprocessMessage(message, attachments);
    // 如果命令处理器返回 null，表示命令已在本地处理完毕（不需发送给模型）
    if (processedParts === null) {
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const promptId = Math.random().toString(16).slice(2);

    let currentParts: PartListUnion = processedParts;
    let isFirstTurn = true;

    try {
      // 工具调用循环
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const toolCallRequests: ToolCallRequestInfo[] = [];

        const events = this.client.sendMessageStream(
          currentParts,
          signal,
          promptId,
          { isContinuation: !isFirstTurn },
        );
        isFirstTurn = false;

        // 遍历流事件
        for await (const event of events) {
          if (signal.aborted) break;

          // 在工具调用循环中，先不发送 finished 事件
          if (event.type === GeminiEventType.Finished) {
            continue;
          }

          this.handleStreamEvent(event as ServerGeminiStreamEvent);

          // 收集工具调用请求
          if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          }
        }

        // 如果有工具调用请求，执行并继续
        if (toolCallRequests.length > 0 && !signal.aborted) {
          const toolResponseParts = await this.executeToolCalls(
            toolCallRequests,
            signal,
          );
          currentParts = toolResponseParts;
        } else {
          // 无工具调用，结束循环
          break;
        }
      }

      // 工具调用循环完全结束后，发送 finished 事件
      if (!signal.aborted) {
        this.sendToRenderer({
          type: 'finished',
          data: { reason: undefined, usageMetadata: undefined },
        });
        // 通知渲染器刷新会话列表
        this.sendToRenderer({ type: 'session-list-update', data: null });
      }
    } catch (err) {
      if (!signal.aborted) {
        this.sendToRenderer({
          type: 'error',
          data: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    } finally {
      this.abortController = null;
    }
  }

  abortCurrentRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.sendToRenderer({ type: 'user-cancelled', data: null });
    }
  }

  async newSession(): Promise<void> {
    if (this.config && this.client) {
      this.config.startNewSession();
      await this.client.resetChat();
    }
  }

  async resumeSession(
    sessionId: string,
    sessionData: ResumedSessionData,
  ): Promise<void> {
    if (this.config && this.client) {
      // 将 sessionData 设置到 Config 中（与 CLI 流程一致）
      this.config.startNewSession(sessionId, sessionData);
      // 重新调用 initialize()，其内部会检测 resumedSessionData
      // 并自动执行 replayUiTelemetry + buildApiHistory + startChat
      await this.client.initialize();
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    if (this.config) {
      this.config.updateCredentials({ apiKey });
    }
  }

  getAuthStatus(): boolean {
    return this.isAuthenticated;
  }

  getApprovalMode(): ApprovalMode {
    return this.config?.getApprovalMode() ?? ApprovalMode.DEFAULT;
  }

  setApprovalMode(mode: ApprovalMode): void {
    if (this.config) {
      this.config.setApprovalMode(mode);
    }
  }

  /** 获取当前模型 ID */
  getCurrentModel(): string | null {
    return this.config?.getModel() ?? null;
  }

  /** 获取所有已配置模型列表（对齐 CLI /model 命令） */
  getAllConfiguredModels(): Array<{
    id: string;
    label: string;
    authType: string;
    isRuntimeModel?: boolean;
    runtimeSnapshotId?: string;
    description?: string;
  }> {
    if (!this.config) return [];
    return this.config.getAllConfiguredModels().map((m) => ({
      id: m.id,
      label: m.label,
      authType: m.authType,
      isRuntimeModel: m.isRuntimeModel,
      runtimeSnapshotId: m.runtimeSnapshotId,
      description: m.description,
    }));
  }

  /** 切换模型（对齐 CLI ModelDialog.handleSelect 逻辑） */
  async switchModel(authType: string, modelId: string): Promise<void> {
    if (!this.config) throw new Error('Config not initialized');
    const currentAuth = this.config.getAuthType();
    await this.config.switchModel(
      authType as AuthType,
      modelId,
      authType !== currentAuth && authType === AuthType.QWEN_OAUTH
        ? { requireCachedCredentials: true }
        : undefined,
    );
  }

  /**
   * 获取 MCP 服务器状态信息（供渲染器进程展示）
   */
  getMcpServerStatus(): Array<{
    name: string;
    status: string;
    toolCount: number;
    tools: Array<{ name: string; displayName: string; description: string }>;
  }> {
    if (!this.config) return [];
    const mcpServers = this.config.getMcpServers();
    if (!mcpServers) return [];

    const toolRegistry = this.config.getToolRegistry();
    const result: Array<{
      name: string;
      status: string;
      toolCount: number;
      tools: Array<{ name: string; displayName: string; description: string }>;
    }> = [];

    for (const serverName of Object.keys(mcpServers)) {
      const serverTools = toolRegistry.getToolsByServer(serverName);
      result.push({
        name: serverName,
        status: serverTools.length > 0 ? 'connected' : 'disconnected',
        toolCount: serverTools.length,
        tools: serverTools.map((t) => ({
          name: t.name,
          displayName: t.displayName,
          description: t.description,
        })),
      });
    }
    return result;
  }

  /**
   * 预处理消息：处理斜杠命令和 @文件引用，并将附件转换为 Gemini Part
   * 返回处理后的消息 Parts，或者返回 null 表示命令已在本地处理（不需发给模型）
   */
  private async preprocessMessage(
    message: string,
    attachments?: IpcAttachment[],
  ): Promise<PartListUnion | null> {
    const trimmed = message.trim();

    // 处理 /init 斜杠命令
    if (trimmed === '/init') {
      return this.handleInitCommand();
    }

    // 处理 @文件引用
    const textParts = await this.processAtFileReferences(trimmed);

    // 将附件转换为 Gemini Part 并合并
    if (attachments && attachments.length > 0) {
      const attachmentParts = this.convertAttachmentsToParts(attachments);
      const baseParts = Array.isArray(textParts) ? textParts : [textParts];
      return [...(baseParts as Part[]), ...attachmentParts];
    }

    return textParts;
  }

  /**
   * 处理 /init 命令：委托给 InitCommand 模块
   */
  private handleInitCommand(): PartListUnion | null {
    if (!this.config) return null;
    return initCommand(this.config, (message) => {
      this.sendToRenderer({ type: 'error', data: { message } });
    });
  }

  /**
   * 处理消息中的 @文件引用，使用 core 的 readManyFiles 读取文件内容
   * 支持文本、图片、PDF、音视频等多模态文件，自动检测文件类型并正确处理
   */
  private async processAtFileReferences(
    message: string,
  ): Promise<PartListUnion> {
    if (!this.config) return [{ text: message }];

    // 匹配 @文件路径 模式：@后跟非空格字符，且 @ 在行首或前面是空格
    const atFilePattern = /(?:^|\s)@(\S+)/g;
    const pathsToRead: string[] = [];
    let matchResult;

    while ((matchResult = atFilePattern.exec(message)) !== null) {
      pathsToRead.push(matchResult[1]);
    }

    if (pathsToRead.length === 0) {
      return [{ text: message }];
    }

    try {
      const result = await readManyFiles(this.config, {
        paths: pathsToRead,
      });

      // 用户原始消息作为第一个 Part
      const parts: Part[] = [{ text: message }];

      // 将读取到的文件内容（文本/图片/PDF 等多模态 Part）追加
      const contentParts = Array.isArray(result.contentParts)
        ? result.contentParts
        : [result.contentParts];

      for (const part of contentParts) {
        if (typeof part === 'string') {
          parts.push({ text: part });
        } else {
          parts.push(part);
        }
      }

      // 如果有错误，通知渲染器（文件被忽略/跳过等）
      if (result.error) {
        this.sendToRenderer({
          type: 'error',
          data: { message: result.error },
        });
      }

      return parts;
    } catch (err) {
      // 读取失败，通知渲染器
      this.sendToRenderer({
        type: 'error',
        data: {
          message: `Failed to read @ referenced files: ${err instanceof Error ? err.message : String(err)}`,
        },
      });
      return [{ text: message }];
    }
  }

  /**
   * 将 IPC 附件转换为 Gemini Part 对象
   * - 图片附件：base64 data URL → inlineData Part
   * - 文件附件：读取文件内容，图片转 inlineData，文本转 text Part
   */
  private convertAttachmentsToParts(attachments: IpcAttachment[]): Part[] {
    const parts: Part[] = [];
    const imageMimeTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
    ]);

    for (const att of attachments) {
      if (att.type === 'image') {
        // 图片附件：data 是 base64 data URL，提取纯 base64 数据
        const base64 = att.data.includes(',')
          ? att.data.split(',')[1]
          : att.data;
        // 从 data URL 中提取真实 mimeType，避免 fallback 到不支持的类型
        let mimeType = att.mimeType;
        if (!mimeType || !imageMimeTypes.has(mimeType)) {
          // 尝试从 data URL 头部提取：data:image/png;base64,...
          const match = att.data.match(/^data:([^;]+);/);
          mimeType = match ? match[1] : 'image/png';
        }
        parts.push({
          inlineData: {
            data: base64,
            mimeType,
          },
        });
      } else {
        // 文件附件：data 是文件绝对路径
        try {
          const filePath = att.data;
          const isImage = imageMimeTypes.has(att.mimeType);

          if (isImage) {
            // 图片文件 → 读取为 base64 inlineData
            const buffer = fs.readFileSync(filePath);
            parts.push({
              inlineData: {
                data: buffer.toString('base64'),
                mimeType: att.mimeType,
              },
            });
          } else {
            // 非图片文件 → 读取为文本
            const content = fs.readFileSync(filePath, 'utf8');
            parts.push({
              text: `[文件: ${att.name}]\n${content}`,
            });
          }
        } catch {
          // 文件读取失败，以文本形式告知模型
          parts.push({
            text: `[无法读取文件: ${att.name} (${att.data})]`,
          });
        }
      }
    }

    return parts;
  }

  approveToolCall(callId: string, outcome?: string): void {
    const pending = this.pendingToolApprovals.get(callId);
    if (pending) {
      void pending.onConfirm(this.mapOutcome(outcome));
      this.pendingToolApprovals.delete(callId);
    }
  }

  /** 将字符串 outcome 映射到 ToolConfirmationOutcome 枚举值 */
  private mapOutcome(outcome?: string): ToolConfirmationOutcome {
    switch (outcome) {
      case 'proceed_once':
        return ToolConfirmationOutcome.ProceedOnce;
      case 'proceed_always':
        return ToolConfirmationOutcome.ProceedAlways;
      case 'proceed_always_server':
        return ToolConfirmationOutcome.ProceedAlwaysServer;
      case 'proceed_always_tool':
        return ToolConfirmationOutcome.ProceedAlwaysTool;
      case 'modify_with_editor':
        return ToolConfirmationOutcome.ModifyWithEditor;
      case 'cancel':
        return ToolConfirmationOutcome.Cancel;
      default:
        return ToolConfirmationOutcome.ProceedOnce;
    }
  }

  rejectToolCall(callId: string): void {
    const pending = this.pendingToolApprovals.get(callId);
    if (pending) {
      void pending.onConfirm(ToolConfirmationOutcome.Cancel);
      this.pendingToolApprovals.delete(callId);
    }
  }

  /**
   * 执行工具调用并收集响应
   */
  private async executeToolCalls(
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<Part[]> {
    const responseParts: Part[] = [];

    for (const request of requests) {
      // 从工具注册表获取 displayName 和 description
      const toolRegistry = this.config!.getToolRegistry();
      const tool = toolRegistry.getTool(request.name);
      let displayName = request.name;
      let description = '';
      if (tool) {
        displayName = tool.displayName || request.name;
        try {
          const invocation = tool.build(request.args);
          description = invocation.getDescription();
        } catch {
          // 构建失败时静默跳过
        }
      }

      // 通知 UI 工具开始执行
      this.sendToRenderer({
        type: 'tool-call-request',
        data: {
          callId: request.callId,
          name: request.name,
          displayName,
          description,
          args: request.args,
        },
      });

      try {
        const response = await executeToolCall(this.config!, request, signal, {
          outputUpdateHandler: (toolCallId, outputChunk) => {
            // 发送工具实时输出到 UI
            this.sendToRenderer({
              type: 'tool-output-update',
              data: {
                callId: toolCallId,
                output: outputChunk,
              },
            });
          },
          onToolCallsUpdate: (toolCalls: ToolCall[]) => {
            for (const tc of toolCalls) {
              if (
                tc.status === 'awaiting_approval' &&
                !this.pendingToolApprovals.has(tc.request.callId)
              ) {
                const waitingTc = tc as WaitingToolCall;
                // 存储 onConfirm 回调
                this.pendingToolApprovals.set(tc.request.callId, {
                  onConfirm: waitingTc.confirmationDetails.onConfirm,
                });
                // 发送审批请求到 UI
                this.sendToRenderer({
                  type: 'tool-approval-request',
                  data: this.buildApprovalRequestData(waitingTc),
                });
              }
            }
          },
        });

        // 通知 UI 工具执行完成，附带 resultDisplay
        this.sendToRenderer({
          type: 'tool-call-response',
          data: {
            callId: request.callId,
            error: response.error?.message,
            resultDisplay: response.resultDisplay,
          },
        });

        if (response.responseParts) {
          responseParts.push(...response.responseParts);
        }
      } catch (err) {
        this.sendToRenderer({
          type: 'tool-call-response',
          data: {
            callId: request.callId,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    return responseParts;
  }

  /**
   * 根据 ToolCallConfirmationDetails 构建发送给渲染器的审批请求数据
   */
  private buildApprovalRequestData(
    waitingTc: WaitingToolCall,
  ): Record<string, unknown> {
    const details = waitingTc.confirmationDetails;
    const base = {
      callId: waitingTc.request.callId,
      toolName: waitingTc.request.name,
      confirmationType: details.type,
      confirmationTitle: details.title,
    };

    switch (details.type) {
      case 'exec':
        return {
          ...base,
          command: details.command,
          rootCommand: details.rootCommand,
          confirmationDescription: `执行命令: ${details.command}`,
        };
      case 'edit':
        return {
          ...base,
          fileName: details.fileName,
          filePath: details.filePath,
          fileDiff: details.fileDiff,
          confirmationDescription: `编辑文件: ${details.fileName}`,
        };
      case 'plan':
        return {
          ...base,
          plan: details.plan,
          confirmationDescription: details.plan,
        };
      case 'mcp':
        return {
          ...base,
          serverName: details.serverName,
          toolName: details.toolName,
          toolDisplayName: details.toolDisplayName,
          confirmationDescription: `MCP 调用: ${details.serverName} → ${details.toolDisplayName}`,
        };
      case 'info':
        return {
          ...base,
          prompt: details.prompt,
          urls: details.urls,
          confirmationDescription: details.prompt,
        };
      default:
        return {
          ...base,
        };
    }
  }

  private handleStreamEvent(event: ServerGeminiStreamEvent): void {
    switch (event.type) {
      case GeminiEventType.Content:
        this.sendToRenderer({ type: 'content', data: { text: event.value } });
        break;
      case GeminiEventType.Thought:
        this.sendToRenderer({ type: 'thought', data: event.value });
        break;
      // ToolCallRequest 和 ToolCallResponse 都在 executeToolCalls 中统一处理，避免重复发送
      case GeminiEventType.Error:
        this.sendToRenderer({
          type: 'error',
          data: { message: event.value.error.message },
        });
        break;
      case GeminiEventType.Retry:
        this.sendToRenderer({ type: 'retry', data: null });
        break;
      case GeminiEventType.UserCancelled:
        this.sendToRenderer({ type: 'user-cancelled', data: null });
        break;
      default:
        // Other events (citation, loop detection, etc.) can be handled later
        break;
    }
  }

  /** 获取可用的 Skills 列表 */
  async listSkills(): Promise<Array<{ name: string; description: string }>> {
    const skillManager = this.config?.getSkillManager();
    if (!skillManager) return [];
    const skills = await skillManager.listSkills();
    return skills.map((s) => ({ name: s.name, description: s.description }));
  }
}
