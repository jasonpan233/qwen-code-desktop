/**
 * Config Factory - 为桌面应用创建 Config 实例。
 *
 * 此文件与 CLI 创建 config 的方式类似，但针对 Electron 桌面环境进行了适配。
 * 从用户和工作区的 settings.json 中加载配置，对齐 CLI 的配置行为。
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import process from 'node:process';
import stripJsonComments from 'strip-json-comments';
import {
  Config,
  Storage,
  ApprovalMode,
  FileEncoding,
  DEFAULT_QWEN_EMBEDDING_MODEL,
  AuthType,
} from '@qwen-code/qwen-code-core';


/** 通用配置对象类型，键为字符串，值为任意类型。用于表示从 settings.json 解析出的未经类型化的配置数据。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySettings = Record<string, any>;

/**
 * 简单的深度合并。workspace settings 覆盖 user settings。
 * 数组直接替换（不合并），对象递归合并。
 */
function deepMerge(target: AnySettings, source: AnySettings): AnySettings {
  // 浅拷贝 target，避免修改原始对象
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      // 当 source 和 target 的值都是非空、非数组的普通对象时，
      // 递归合并子对象，实现嵌套配置的逐层覆盖
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as AnySettings, srcVal as AnySettings);
    } else {
      // 对于基本类型、数组或 null，source 直接覆盖 target
      // 注意：数组不做元素级合并，整体替换以保证配置语义明确
      result[key] = srcVal;
    }
  }
  return result;
}

/**
 * 从 settings.json 文件中读取并解析 JSON（支持注释）。
 */
function readSettingsFile(filePath: string): AnySettings {
  try {
    if (fs.existsSync(filePath)) {
      // 以 UTF-8 编码读取文件内容
      const content = fs.readFileSync(filePath, 'utf-8');
      // 使用 stripJsonComments 去除 JSON 中的注释（// 和 /* */），
      // 使 settings.json 支持用户添加注释的习惯（类似 VS Code 的 jsonc 格式）
      const parsed: unknown = JSON.parse(stripJsonComments(content));
      // 确保解析结果是一个普通对象（排除 null、数组等非对象类型），
      // 防止非法 JSON 内容（如 "[1,2,3]" 或 "null"）被当作有效配置
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as AnySettings;
      }
    }
  } catch {
    // 静默忽略文件不存在、权限不足或格式错误等异常，
    // 确保桌面应用不会因配置文件损坏而崩溃，返回空配置兜底
  }
  return {};
}

/**
 * 加载并合并用户级和工作区级的 settings.json。
 * 合并优先级: workspace > user（工作区覆盖用户级）。
 */
function loadDesktopSettings(workingDir: string): AnySettings {
  // 获取用户级全局配置路径（通常为 ~/.qwen/settings.json）
  const userSettingsPath = Storage.getGlobalSettingsPath();
  // 获取工作区级配置路径（通常为 <workingDir>/.qwen/settings.json）
  const workspaceSettingsPath = new Storage(
    workingDir,
  ).getWorkspaceSettingsPath();

  // 分别读取用户级和工作区级配置文件
  const userSettings = readSettingsFile(userSettingsPath);
  const workspaceSettings = readSettingsFile(workspaceSettingsPath);

  // 深度合并：工作区配置优先级高于用户配置，
  // 允许用户在项目级别覆盖全局设置（如不同项目使用不同模型或审批模式）
  return deepMerge(userSettings, workspaceSettings);
}

/**
 * 将 settings 中的审批模式字符串解析为 ApprovalMode 枚举。
 *
 * 支持的审批模式：
 * - plan:    仅分析模式，AI 只能读取代码和提出建议，不执行任何修改
 * - default: 默认模式，每次工具调用前需要用户手动审批确认
 * - yolo:    全自动模式，AI 可自由执行所有工具而无需人工审批
 * - auto_edit/autoedit/auto-edit: 自动编辑模式，自动批准文件编辑操作，但其他操作仍需审批
 *
 * @param value - 来自 settings.json 的审批模式字符串
 * @returns 对应的 ApprovalMode 枚举值，无法识别时返回 undefined（将使用默认值）
 */
function parseApprovalMode(
  value: string | undefined,
): ApprovalMode | undefined {
  if (!value) return undefined;
  // 统一转为小写并去除首尾空白，支持用户输入大小写不敏感
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'plan':
      return ApprovalMode.PLAN;
    case 'default':
      return ApprovalMode.DEFAULT;
    case 'yolo':
      return ApprovalMode.YOLO;
    // 兼容多种 auto-edit 的写法（下划线、驼峰、连字符）
    case 'auto_edit':
    case 'autoedit':
    case 'auto-edit':
      return ApprovalMode.AUTO_EDIT;
    default:
      return undefined;
  }
}

/**
 * Web 搜索提供商的单项配置。
 * 每个提供商代表一个可用的搜索引擎后端。
 */
interface WebSearchProviderConfig {
  /** 提供商类型：tavily（AI 搜索引擎）、google（Google Custom Search）、dashscope（阿里云搜索服务） */
  type: 'tavily' | 'google' | 'dashscope';
  /** 搜索 API 密钥（tavily、google 需要；dashscope 通过 OAuth 认证，无需单独密钥） */
  apiKey?: string;
  /** Google Custom Search 引擎 ID（仅 google 类型需要） */
  searchEngineId?: string;
}

/**
 * Web 搜索的完整配置，包含所有可用提供商和默认使用的提供商。
 */
interface WebSearchConfig {
  /** 所有已配置的搜索提供商列表 */
  provider: WebSearchProviderConfig[];
  /** 默认使用的搜索提供商类型名称 */
  default: string;
}

/**
 * 从 settings 构建 web search 配置（简化版，不含 CLI argv）。
 *
 * 配置来源优先级：
 * 1. settings.json 中的 webSearch 配置（显式配置）
 * 2. settings.advanced.tavilyApiKey 或环境变量 TAVILY_API_KEY（Tavily 回退）
 * 3. 环境变量 GOOGLE_API_KEY + GOOGLE_SEARCH_ENGINE_ID（Google 回退）
 * 4. 对于 Qwen OAuth 用户，自动注入 dashscope 提供商作为保底
 *
 * @param settings - 合并后的用户/工作区配置
 * @param authType - 当前用户的认证类型，用于判断是否需要自动注入 dashscope
 * @returns 完整的 Web 搜索配置，或 undefined（无任何可用搜索提供商时）
 */
function buildDesktopWebSearchConfig(
  settings: AnySettings,
  authType?: string,
): WebSearchConfig | undefined {
  // 判断当前用户是否通过 Qwen OAuth 认证（阿里云账号登录）
  const isQwenOAuth = authType === AuthType.QWEN_OAUTH;

  let providers: WebSearchProviderConfig[] = [];
  let userDefault: string | undefined;

  if (settings.webSearch) {
    // 优先使用 settings.json 中用户显式配置的 webSearch
    providers = [...settings.webSearch.provider];
    userDefault = settings.webSearch.default;
  } else {
    // 未显式配置时，从环境变量回退构建提供商列表
    // 尝试从 settings 或环境变量获取 Tavily API Key
    const tavilyKey =
      settings.advanced?.tavilyApiKey || process.env['TAVILY_API_KEY'];
    if (tavilyKey) {
      providers.push({ type: 'tavily', apiKey: tavilyKey });
    }

    // 尝试从环境变量获取 Google Custom Search 配置（需同时提供 API Key 和 Search Engine ID）
    const googleKey = process.env['GOOGLE_API_KEY'];
    const googleEngineId = process.env['GOOGLE_SEARCH_ENGINE_ID'];
    if (googleKey && googleEngineId) {
      providers.push({
        type: 'google',
        apiKey: googleKey,
        searchEngineId: googleEngineId,
      });
    }
  }

  // 对于 Qwen OAuth 用户，确保 dashscope 搜索始终可用
  // dashscope 通过 OAuth token 认证，无需额外 API Key
  if (isQwenOAuth) {
    const hasDashscope = providers.some((p) => p.type === 'dashscope');
    if (!hasDashscope) {
      providers.push({ type: 'dashscope' });
    }
  }

  // 没有任何可用的搜索提供商时，返回 undefined 禁用 web 搜索功能
  if (providers.length === 0) {
    return undefined;
  }

  // 确定默认搜索提供商：优先使用用户指定的，否则按优先级自动选择
  // 优先级：tavily > google > dashscope（tavily 搜索质量最高，dashscope 作为兜底）
  const providerPriority: Array<'tavily' | 'google' | 'dashscope'> = [
    'tavily',
    'google',
    'dashscope',
  ];
  let defaultProvider = userDefault;
  if (!defaultProvider) {
    // 按优先级遍历，选择第一个已配置的提供商作为默认
    for (const providerType of providerPriority) {
      if (providers.some((p) => p.type === providerType)) {
        defaultProvider = providerType;
        break;
      }
    }
    // 兜底：如果优先级列表中没有匹配的，使用列表第一个或 dashscope
    if (!defaultProvider) {
      defaultProvider = providers[0]?.type || 'dashscope';
    }
  }

  return {
    provider: providers,
    default: defaultProvider,
  };
}

/**
 * 创建一个适用于桌面应用的 Config 实例。
 * 从 settings.json 加载配置，对齐 CLI 的配置行为，但去除终端相关选项。
 */
export async function createDesktopConfig(workingDir: string): Promise<Config> {
  // 加载并合并用户级和工作区级的 settings.json 配置
  // 合并逻辑与 CLI 的 loadSettings 保持一致，确保桌面版和 CLI 行为对齐
  const settings = loadDesktopSettings(workingDir);

  // 自动加载输出语言配置文件（~/.qwen/output-language.md），与 CLI 行为一致。
  // 该文件包含用户期望 AI 使用的回复语言（如 "请用中文回答"），
  // 会作为系统提示注入给模型，引导其使用指定语言输出。
  let outputLanguageFilePath: string | undefined = path.join(
    Storage.getGlobalQwenDir(),
    'output-language.md',
  );
  if (!fs.existsSync(outputLanguageFilePath)) {
    outputLanguageFilePath = undefined;
  }

  // 从 settings 中解析认证类型（如 qwen-oauth、api-key、openai 等），
  // 决定与模型服务通信时使用的认证方式
  const selectedAuthType: AuthType | undefined = settings.security?.auth
    ?.selectedType as AuthType | undefined;

  // 从环境变量中解析 HTTP/HTTPS 代理地址，与 CLI 使用相同的优先级顺序：
  // HTTPS_PROXY > https_proxy > HTTP_PROXY > http_proxy
  // 支持企业内网环境下通过代理访问外部 API 服务
  const proxy =
    process.env['HTTPS_PROXY'] ||
    process.env['https_proxy'] ||
    process.env['HTTP_PROXY'] ||
    process.env['http_proxy'];

  const config = new Config({
    // --- Core parameters ---
    // 项目工作目录的绝对路径，用于文件操作和上下文发现的根目录
    targetDir: workingDir,
    // 当前工作目录，用于解析相对路径
    cwd: workingDir,
    // 桌面应用始终以交互模式运行（区别于 CLI 的非交互/headless 模式）
    interactive: true,
    // 调试模式开关，桌面应用默认关闭
    debugMode: false,
    // 输出语言配置文件路径（~/.qwen/output-language.md），控制 AI 回复的语言
    outputLanguageFilePath,
    // 嵌入模型名称，用于语义搜索和代码检索
    embeddingModel: DEFAULT_QWEN_EMBEDDING_MODEL,

    // --- Model & Auth ---
    // 使用的 LLM 模型名称（如 qwen-max、gpt-4 等）
    model: settings.model?.name,
    // 认证类型（如 qwen-oauth、api-key 等），决定如何与模型服务通信
    authType: selectedAuthType,
    // 按 authType 分组的模型提供商配置（包含多个提供商的模型列表）
    modelProvidersConfig: settings.modelProviders,
    // 内容生成配置（temperature、baseUrl、apiKey、contextWindowSize 等）
    generationConfig: settings.model?.generationConfig,

    // --- Approval Mode ---
    // 工具执行审批模式：plan(仅分析)、default(需审批)、auto-edit(自动批准编辑)、yolo(全自动)
    approvalMode: parseApprovalMode(settings.tools?.approvalMode),

    // --- MCP Servers ---
    // MCP (Model Context Protocol) 服务器配置映射，键为服务器名称
    mcpServers: settings.mcpServers || {},
    // 启动 MCP 服务器的命令
    mcpServerCommand: settings.mcp?.serverCommand,
    // 允许使用的 MCP 服务器白名单
    allowedMcpServers: settings.mcp?.allowed,
    // 排除的 MCP 服务器黑名单
    excludedMcpServers: settings.mcp?.excluded,

    // --- Tools ---
    // 核心工具列表，定义始终可用的工具集
    coreTools: settings.tools?.core,
    // 额外允许使用的工具白名单
    allowedTools: settings.tools?.allowed,
    // 排除不使用的工具黑名单
    excludeTools: settings.tools?.exclude,
    // 自定义工具发现命令，用于动态发现可用工具
    toolDiscoveryCommand: settings.tools?.discoveryCommand,
    // 自定义工具调用命令，用于执行外部工具
    toolCallCommand: settings.tools?.callCommand,

    // --- Sandbox ---
    // 沙箱配置（如 Docker/Podman），在隔离环境中执行命令以提高安全性
    sandbox: settings.tools?.sandbox,

    // --- Network ---
    // HTTP/HTTPS 代理地址，用于网络请求（按优先级从环境变量读取）
    proxy,
    // 禁用浏览器打开行为（如 OAuth 回调时不自动打开浏览器）
    noBrowser: !!process.env['NO_BROWSER'],

    // --- File & Context ---
    // 文件过滤配置（是否遵循 .gitignore、.qwenignore、递归搜索、模糊搜索）
    fileFiltering: settings.context?.fileFiltering,
    // 额外包含的目录列表，这些目录会被加入上下文搜索范围
    includeDirectories: settings.context?.includeDirectories,
    // 是否从 includeDirectories 中加载 QWEN.md 记忆文件
    loadMemoryFromIncludeDirectories:
      settings.context?.loadFromIncludeDirectories || false,
    // 记忆导入格式：'tree'(树形结构) 或 'flat'(扁平结构)
    importFormat: settings.context?.importFormat || 'tree',
    // 默认文件编码（UTF-8 等），用于读写文件时的编码处理
    defaultFileEncoding:
      settings.general?.defaultFileEncoding ?? FileEncoding.UTF8,

    // --- Session ---
    // 单次会话的最大 token 数限制，-1 表示不限制
    sessionTokenLimit: settings.model?.sessionTokenLimit ?? -1,
    // 单次会话的最大对话轮次，-1 表示不限制
    maxSessionTurns: settings.model?.maxSessionTurns ?? -1,

    // --- Shell & Execution ---
    // 是否使用 ripgrep 进行代码搜索（比原生搜索更快）
    useRipgrep: settings.tools?.useRipgrep,
    // 是否使用内置的 ripgrep 二进制文件（而非系统安装的）
    useBuiltinRipgrep: settings.tools?.useBuiltinRipgrep,
    // 是否使用 node-pty 交互式 Shell（支持更丰富的终端交互）
    shouldUseNodePtyShell: settings.tools?.shell?.enableInteractiveShell,
    // 工具输出截断的 token 阈值，超过此值将被截断
    truncateToolOutputThreshold: settings.tools?.truncateToolOutputThreshold,
    // 工具输出截断的最大行数
    truncateToolOutputLines: settings.tools?.truncateToolOutputLines,
    // 是否启用工具输出截断功能
    enableToolOutputTruncation: settings.tools?.enableToolOutputTruncation,

    // --- Model behavior ---
    // 跳过 "下一个发言者" 检查，避免多轮对话中不必要的角色切换判断
    skipNextSpeakerCheck: settings.model?.skipNextSpeakerCheck,
    // 跳过循环检测，避免模型陷入重复操作时被强制中断
    skipLoopDetection: settings.model?.skipLoopDetection ?? false,
    // 跳过启动时的上下文加载（如项目结构摘要），加快启动速度
    skipStartupContext: settings.model?.skipStartupContext ?? false,
    // VLM（视觉语言模型）切换模式，控制何时启用视觉能力
    vlmSwitchMode: settings.experimental?.vlmSwitchMode,
    // 聊天压缩配置，当上下文过长时自动压缩历史消息
    chatCompression: settings.model?.chatCompression,
    // 工具输出摘要配置，控制对工具输出进行 AI 摘要的 token 预算
    summarizeToolOutput: settings.model?.summarizeToolOutput,

    // --- General ---
    // 启用检查点功能，支持会话状态的保存和恢复
    checkpointing: settings.general?.checkpointing?.enabled,
    // 启用聊天记录保存到磁盘，支持会话恢复和历史查看
    chatRecording: settings.general?.chatRecording ?? true,
    // Git 提交时是否添加 AI 共同作者信息（Co-authored-by）
    gitCoAuthor: settings.general?.gitCoAuthor,
    // Bug 报告命令配置，定义如何收集和提交 bug 信息
    bugCommand: settings.advanced?.bugCommand,

    // --- Telemetry & Privacy ---
    // 遥测配置（是否启用、目标端点、OTLP 协议等）
    telemetry: settings.telemetry,
    // 是否启用匿名使用统计收集
    usageStatisticsEnabled: settings.privacy?.usageStatisticsEnabled ?? true,

    // --- Security ---
    // 文件夹信任功能开关，未信任的文件夹会限制工具执行权限
    folderTrust: settings.security?.folderTrust?.enabled ?? false,

    // --- UI & Accessibility ---
    // 无障碍设置（如屏幕阅读器支持、加载动画短语等）
    accessibility: settings.ui?.accessibility,
    // IDE 模式开关，启用后会集成 IDE 特有功能（如 LSP）
    ideMode: settings.ide?.enabled ?? false,

    // --- Web Search ---
    // Web 搜索配置（搜索提供商列表和默认提供商：tavily/google/dashscope）
    webSearch: buildDesktopWebSearchConfig(settings, selectedAuthType),
  });

  return config;
}
