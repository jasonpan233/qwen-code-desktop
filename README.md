# Qwen Code Desktop

Qwen Code Desktop 是 Qwen Code 的桌面端应用。它把 Qwen Code Core 的项目理解、对话、工具调用、会话记录、MCP 和模型配置能力封装进 Electron 桌面界面，让用户可以在图形界面里选择项目目录、登录模型服务、发起代码任务并审批文件编辑或命令执行。

本说明只覆盖 `packages/desktop` 桌面应用部分。

## 主要功能

- 项目入口：启动后选择项目目录，也可以使用当前默认目录；运行中可切换项目。
- 对话体验：支持流式回复、思考内容分段、上下文用量展示、中止当前请求和新建对话。
- 会话管理：左侧栏展示历史会话、消息数量、相对时间和 Git 分支，支持加载和删除会话。
- 认证方式：支持 Qwen OAuth 登录、百炼 Coding Plan API Key（中国/国际区域）以及自定义 modelProviders 配置。
- 模型管理：读取当前配置中的模型列表，并在桌面端切换模型。
- 工具审批：支持 Plan、Default、Auto Edit、YOLO 审批模式；工具调用可展示执行状态、实时输出、diff、计划和结果。
- 文件上下文：右侧文件树浏览项目文件，可一键把文件路径以 `@path` 形式插入输入框；输入框也支持 `@` 文件引用补全。
- 附件输入：支持从剪贴板读取图片或文件，图片会作为多模态内容发送，文本文件会读取内容发送。
- MCP 面板：展示 MCP 服务器连接状态、工具数量和工具说明。
- 语言与外观：支持浅色、深色、跟随系统主题，以及输出语言偏好设置。
- 检查点回滚：执行编辑类工具前会尝试创建 Git 快照，界面可触发恢复到对应检查点。

## 技术栈

- 桌面容器：Electron `40.6.1`
- 打包工具：Electron Forge `7.11.1`
- 构建工具：Vite `5.4.x`
- 前端框架：React `19`
- 语言：TypeScript
- 样式：Tailwind CSS `4`、Radix UI 风格组件、`class-variance-authority`、`tailwind-merge`
- 图标：`lucide-react`
- 内容渲染：`react-markdown`、`remark-gfm`、`react-syntax-highlighter`、`react-diff-view`
- 核心能力：通过 `@qwen-code/qwen-code-core` 复用 Qwen Code 的配置、认证、模型、会话、工具调用、MCP、Git 快照和文件读取能力。

## 运行与构建

项目使用 npm workspaces。建议在仓库根目录安装依赖：

```bash
npm install
```

启动桌面开发环境：

```bash
npm --workspace=@qwen-code/desktop run start
```

也可以进入桌面包目录运行：

```bash
cd packages/desktop
npm run start
```

打包当前平台的应用目录：

```bash
npm --workspace=@qwen-code/desktop run package
```

生成安装包：

```bash
npm --workspace=@qwen-code/desktop run make
```

发布构建产物：

```bash
npm --workspace=@qwen-code/desktop run publish
```

运行桌面包 lint：

```bash
npm --workspace=@qwen-code/desktop run lint
```

## 桌面目录结构

```text
packages/desktop/
├── forge.config.ts              # Electron Forge 配置，声明 main/preload/renderer 的 Vite 构建和安装包 maker
├── vite.main.config.ts          # 主进程 Vite 配置
├── vite.preload.config.ts       # preload Vite 配置，输出 CJS preload
├── vite.renderer.config.ts      # 渲染进程 Vite 配置
├── index.html                   # 渲染进程 HTML 入口
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron 主进程入口，创建 BrowserWindow 并注册 IPC
│   │   ├── ipc.ts               # IPC 处理器：聊天、会话、认证、工具审批、文件、MCP、模型、语言等
│   │   ├── Command/initCommand.ts
│   │   ├── constants/
│   │   └── services/
│   │       ├── chat-service.ts  # 桌面端 ChatService，桥接渲染器与 qwen-code-core
│   │       ├── config-factory.ts # 桌面 Config 创建与 settings 合并逻辑
│   │       └── language-utils.ts # 输出语言偏好读写
│   ├── preload/
│   │   └── preload.ts           # 通过 contextBridge 暴露安全的 window.electronAPI
│   └── renderer/
│       ├── App.tsx              # React 路由入口
│       ├── index.tsx            # 渲染进程入口
│       ├── pages/               # ProjectPicker、ChatPage
│       ├── components/          # 聊天、侧栏、登录、文件树、MCP、Markdown、Diff 等组件
│       ├── hooks/               # useChat、useSessionList、useFileTree、useMcpServers
│       ├── lib/
│       └── types/
└── package.json                 # desktop 包脚本和依赖
```

## 架构说明

桌面应用由三层组成：

1. 主进程负责 Electron 窗口生命周期、系统能力和 IPC 处理。`src/main/main.ts` 创建窗口，`src/main/ipc.ts` 注册渲染器可调用的能力。
2. Preload 层通过 `contextBridge.exposeInMainWorld('electronAPI', api)` 暴露受控 API，渲染器不直接访问 Node/Electron 主进程能力。
3. 渲染器是 React 应用，使用 HashRouter 在项目选择页和聊天页之间切换。聊天页组合侧边栏、消息区、输入框、文件树和 MCP 面板。

`ChatService` 是桌面端和 `@qwen-code/qwen-code-core` 的主要桥接层。它负责初始化 `Config` 和 `GeminiClient`，处理认证、流式消息、工具调用循环、工具审批、`@` 文件引用、附件转 Gemini Part、MCP 状态、模型切换、会话恢复和 Git 检查点。

## 配置与数据

- 全局用户配置读取自 `~/.qwen/settings.json`。
- 工作区配置读取自 `<project>/.qwen/settings.json`。
- 系统默认配置和系统强制配置可通过 `QWEN_CODE_SYSTEM_DEFAULTS_PATH`、`QWEN_CODE_SYSTEM_SETTINGS_PATH` 指定。
- desktop 的配置合并顺序与 CLI 对齐：`systemDefaults < user < workspace < system`。
- 输出语言偏好会写入 `~/.qwen/settings.json` 的 `general.outputLanguage`，并维护 `~/.qwen/output-language.md` 规则文件。
- Qwen OAuth 会尝试复用 `~/.qwen/oauth_creds.json` 中的持久化凭证。

## 开发备注

- `main` 和 `preload` 分别由 Vite 构建，渲染进程由 Electron Forge 的 Vite renderer 配置启动。
- 打包配置启用 `asar`，并通过 Electron Fuses 禁用 RunAsNode、Node options 环境变量和 CLI inspect 参数等能力。
- 桌面包是 private workspace，不作为 npm 包单独发布。
