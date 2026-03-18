import {
  ipcMain,
  dialog,
  clipboard,
  shell,
  type BrowserWindow,
} from 'electron';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { SessionService } from '@qwen-code/qwen-code-core';
import type { ListSessionsOptions, AuthType } from '@qwen-code/qwen-code-core';
import type { ApprovalMode } from '@qwen-code/qwen-code-core';
import type { CodingPlanRegion } from './constants/codingPlan.js';
import { ChatService } from './services/chat-service.js';
import type { AuthCredentials } from './services/chat-service.js';
import type { IpcAttachment } from '../preload/preload.js';
import {
  readCurrentOutputLanguageSetting,
  saveOutputLanguageSetting,
  resolveOutputLanguage,
  isAutoLanguage,
  updateOutputLanguageFile,
  OUTPUT_LANGUAGE_AUTO,
} from './services/language-utils.js';

/** 应用共享状态，由 main.ts 传入并在 IPC 处理器中读写 */
export interface AppState {
  mainWindow: BrowserWindow | null;
  chatService: ChatService | null;
  chatServiceInitialized: boolean;
  sessionService: SessionService | null;
  isInitialized: boolean;
  currentCwd: string | null;
}

/** 递归遍历项目目录，返回匹配 pattern 的文件相对路径列表 */
function listFilesRecursive(root: string, pattern: string): string[] {
  const results: string[] = [];
  const lowerPattern = pattern.toLowerCase();
  const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '__pycache__',
    '.venv',
    'venv',
    '.cache',
    'coverage',
    '.nyc_output',
  ]);

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          // 将目录本身也作为结果返回（以 / 结尾标记）
          if (
            !lowerPattern ||
            relativePath.toLowerCase().includes(lowerPattern)
          ) {
            results.push(relativePath + '/');
          }
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (
          !lowerPattern ||
          relativePath.toLowerCase().includes(lowerPattern)
        ) {
          results.push(relativePath);
        }
      }
    }
  }

  walk(root);
  return results;
}

/** 设置所有 IPC 处理器 */
export function setupIpcHandlers(state: AppState): void {
  ipcMain.handle(
    'chat:send',
    async (_event, message: string, attachments?: IpcAttachment[]) => {
      if (!state.chatService) {
        throw new Error('Chat service not initialized');
      }
      if (!state.chatServiceInitialized) {
        throw new Error(
          'Chat service is not ready yet. Please wait a moment and try again.',
        );
      }
      return state.chatService.sendMessage(message, attachments);
    },
  );

  ipcMain.handle('chat:abort', async () => {
    if (state.chatService) {
      state.chatService.abortCurrentRequest();
    }
  });

  ipcMain.handle('chat:new-session', async () => {
    if (state.chatService) {
      await state.chatService.newSession();
    }
  });

  ipcMain.handle('config:set-api-key', async (_event, apiKey: string) => {
    if (state.chatService) {
      await state.chatService.setApiKey(apiKey);
    }
  });

  ipcMain.handle(
    'config:get-auth-status',
    async () => state.chatService?.getAuthStatus() ?? false,
  );

  // --- Auth IPC handlers ---
  ipcMain.handle('auth:get-types', async () => {
    if (!state.chatService) {
      return [];
    }
    return state.chatService.getAvailableAuthTypes();
  });

  ipcMain.handle(
    'auth:start',
    async (_event, authType: string, credentials?: AuthCredentials) => {
      if (!state.chatService) {
        return { success: false, error: 'Chat service not available' };
      }
      if (!state.chatService.isConfigInitialized()) {
        return {
          success: false,
          error: 'Config not initialized. Please select a project first.',
        };
      }
      const result = await state.chatService.startAuth(
        authType as AuthType,
        credentials,
      );
      if (result.success) {
        state.chatServiceInitialized = true;
      }
      return result;
    },
  );

  ipcMain.handle('auth:get-status', async () => {
    if (!state.chatService) {
      return { authenticated: false };
    }
    const status = await state.chatService.getDetailedAuthStatus();
    // 如果通过 tryRestoreAuth 自动恢复了认证，同步更新 chatServiceInitialized 标志
    if (status.authenticated && !state.chatServiceInitialized) {
      state.chatServiceInitialized = true;
    }
    return status;
  });

  ipcMain.handle(
    'auth:get-current-type',
    async () => state.chatService?.getCurrentAuthType() ?? null,
  );

  ipcMain.handle('auth:cancel-oauth', async () => {
    if (state.chatService) {
      state.chatService.cancelAuth();
    }
  });

  ipcMain.handle(
    'auth:start-coding-plan',
    async (_event, apiKey: string, region: string) => {
      if (!state.chatService) {
        return { success: false, error: 'Chat service not available' };
      }
      if (!state.chatService.isConfigInitialized()) {
        return {
          success: false,
          error: 'Config not initialized. Please select a project first.',
        };
      }
      const result = await state.chatService.startCodingPlanAuth(
        apiKey,
        region as CodingPlanRegion,
      );
      if (result.success) {
        state.chatServiceInitialized = true;
      }
      return result;
    },
  );

  ipcMain.handle(
    'config:get-approval-mode',
    async () => state.chatService?.getApprovalMode() ?? 'default',
  );

  ipcMain.handle('config:set-approval-mode', async (_event, mode: string) => {
    if (state.chatService) {
      state.chatService.setApprovalMode(mode as ApprovalMode);
    }
  });

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    'tool:approve',
    async (_event, callId: string, outcome?: string) => {
      if (state.chatService) {
        state.chatService.approveToolCall(callId, outcome);
      }
    },
  );

  ipcMain.handle('tool:reject', async (_event, callId: string) => {
    if (state.chatService) {
      state.chatService.rejectToolCall(callId);
    }
  });

  ipcMain.handle(
    'chat:restore-checkpoint',
    async (_event, commitHash: string) => {
      if (state.chatService) {
        await state.chatService.restoreCheckpoint(commitHash);
      }
    },
  );

  ipcMain.handle(
    'session:list',
    async (_event, options?: ListSessionsOptions) => {
      if (!state.sessionService) {
        throw new Error('Session service not initialized');
      }
      return state.sessionService.listSessions(options);
    },
  );

  ipcMain.handle('session:remove', async (_event, sessionId: string) => {
    if (!state.sessionService) {
      throw new Error('Session service not initialized');
    }
    return state.sessionService.removeSession(sessionId);
  });

  ipcMain.handle('session:load', async (_event, sessionId: string) => {
    if (!state.sessionService) {
      throw new Error('Session service not initialized');
    }
    const sessionData = await state.sessionService.loadSession(sessionId);
    if (sessionData && state.chatService) {
      await state.chatService.resumeSession(sessionId, sessionData);
    }
    return sessionData;
  });

  ipcMain.handle('window:minimize', () => state.mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (state.mainWindow?.isMaximized()) {
      state.mainWindow.unmaximize();
    } else {
      state.mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => state.mainWindow?.close());

  // 项目文件列表 IPC 处理
  ipcMain.handle('files:list', async (_event, pattern?: string) => {
    if (!state.currentCwd) {
      return [];
    }
    try {
      return listFilesRecursive(state.currentCwd, pattern ?? '');
    } catch {
      return [];
    }
  });

  // Skills 列表 IPC 处理
  ipcMain.handle('skills:list', async () => {
    if (!state.chatService) return [];
    return state.chatService.listSkills();
  });

  // MCP 服务器状态 IPC 处理
  ipcMain.handle('mcp:get-servers', async () => {
    if (!state.chatService) return [];
    return state.chatService.getMcpServerStatus();
  });

  // 项目目录选择功能 IPC 处理
  ipcMain.handle('app:initialize', async (_event, cwd: string) => {
    if (state.isInitialized) {
      return { success: false, error: 'Already initialized' };
    }

    try {
      if (!state.chatService) {
        return { success: false, error: 'Chat service not available' };
      }
      await state.chatService.initialize(cwd);
      // 不再在此处设置 chatServiceInitialized = true，等待认证完成后再设置
      state.sessionService = new SessionService(cwd);
      state.isInitialized = true;
      state.currentCwd = cwd;
      // eslint-disable-next-line no-console
      console.log('Chat service initialized successfully with cwd:', cwd);
      return { success: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('app:reinitialize', async (_event, cwd: string) => {
    try {
      // 保存当前认证类型
      const previousAuthType = state.chatService?.getCurrentAuthType();

      // 清理之前的资源
      if (state.chatService) {
        await state.chatService.shutdown();
      }

      // 重新初始化
      state.chatService = new ChatService((event) => {
        state.mainWindow?.webContents.send('chat:stream-event', event);
      });

      await state.chatService.initialize(cwd);

      // 如果之前已认证，使用相同的认证类型重新认证
      if (previousAuthType) {
        const result = await state.chatService.startAuth(
          previousAuthType as AuthType,
        );
        if (result.success) {
          state.chatServiceInitialized = true;
        }
      }

      state.sessionService = new SessionService(cwd);
      state.isInitialized = true;
      state.currentCwd = cwd;
      // eslint-disable-next-line no-console
      console.log('Chat service reinitialized successfully with cwd:', cwd);
      return { success: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to reinitialize:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('app:get-init-status', () => ({
    isInitialized: state.isInitialized,
    currentCwd: state.currentCwd,
  }));

  ipcMain.handle('app:get-current-cwd', () => state.currentCwd);

  // 剪贴板文件读取 IPC 处理
  ipcMain.handle('clipboard:read-files', () => {
    const result: Array<{
      name: string;
      path: string;
      size: number;
      mimeType: string;
    }> = [];

    // 尝试读取剪贴板中的图片
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const pngBuffer = image.toPNG();
      const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      result.push({
        name: `clipboard-image-${Date.now()}.png`,
        path: dataUrl,
        size: pngBuffer.length,
        mimeType: 'image/png',
      });
      return { type: 'image' as const, items: result };
    }

    // 尝试读取剪贴板中的文件路径 (Windows: FileNameW / CF_HDROP)
    if (process.platform === 'win32') {
      try {
        // Windows 剪贴板中的文件路径以 UTF-16LE 编码存储在 FileNameW 格式中
        const fileNameBuffer = clipboard.readBuffer('FileNameW');
        if (fileNameBuffer && fileNameBuffer.length > 0) {
          // 解析 UTF-16LE 字符串，去除尾部的 null 字符
          const filePath = fileNameBuffer
            .toString('utf16le')
            .replace(/\0+$/, '');
          if (filePath) {
            try {
              const stat = statSync(filePath);
              const ext = path.extname(filePath).toLowerCase();
              const mimeMap: Record<string, string> = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.bmp': 'image/bmp',
                '.svg': 'image/svg+xml',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.json': 'application/json',
                '.md': 'text/markdown',
              };
              result.push({
                name: path.basename(filePath),
                path: filePath,
                size: stat.size,
                mimeType: mimeMap[ext] ?? 'application/octet-stream',
              });
            } catch {
              // 文件不可访问，忽略
            }
          }
        }
      } catch {
        // 读取剪贴板失败，忽略
      }
    } else if (process.platform === 'darwin') {
      try {
        // macOS: 尝试读取 public.file-url
        const fileUrl = clipboard.read('public.file-url');
        if (fileUrl) {
          const filePath = decodeURIComponent(fileUrl.replace('file://', ''));
          try {
            const stat = statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.bmp': 'image/bmp',
              '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf',
              '.txt': 'text/plain',
              '.json': 'application/json',
              '.md': 'text/markdown',
            };
            result.push({
              name: path.basename(filePath),
              path: filePath,
              size: stat.size,
              mimeType: mimeMap[ext] ?? 'application/octet-stream',
            });
          } catch {
            // 文件不可访问，忽略
          }
        }
      } catch {
        // 读取剪贴板失败，忽略
      }
    }

    if (result.length > 0) {
      return { type: 'file' as const, items: result };
    }

    return null;
  });

  // 读取文件为 base64 data URL（用于预览文件管理器复制的图片文件）
  ipcMain.handle('file:read-as-data-url', async (_event, filePath: string) => {
    const { readFileSync } = await import('node:fs');
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
    };
    const mime = mimeMap[ext];
    if (!mime) return null;
    try {
      const buffer = readFileSync(filePath);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  });

  // ── 模型管理 ──────────────────────────────────────────────────

  ipcMain.handle('model:get-current', async () => ({
    model: state.chatService?.getCurrentModel() ?? null,
    authType: state.chatService?.getCurrentAuthType() ?? null,
  }));

  ipcMain.handle(
    'model:get-all',
    async () => state.chatService?.getAllConfiguredModels() ?? [],
  );

  ipcMain.handle(
    'model:switch',
    async (_event, authType: string, modelId: string) => {
      if (!state.chatService) throw new Error('ChatService not initialized');
      await state.chatService.switchModel(authType, modelId);
    },
  );

  // 用系统默认浏览器打开外部链接
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });

  // --- 输出语言 IPC handlers ---
  ipcMain.handle('language:get-output', async () => {
    const setting = readCurrentOutputLanguageSetting();
    const resolved = resolveOutputLanguage(setting);
    return { setting, resolved };
  });

  ipcMain.handle('language:set-output', async (_event, language: string) => {
    try {
      const isAuto = isAutoLanguage(language);
      const resolved = resolveOutputLanguage(language);
      const settingValue = isAuto ? OUTPUT_LANGUAGE_AUTO : resolved;

      // 更新 output-language.md 规则文件
      updateOutputLanguageFile(settingValue);
      // 持久化到 settings.json
      saveOutputLanguageSetting(settingValue);

      return { success: true, resolved };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
