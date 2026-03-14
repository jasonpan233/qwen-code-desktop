import { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  Send,
  Square,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Terminal,
  FileText,
  Folder,
  X,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupButton,
  InputGroupAddon,
} from '@renderer/components/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import type { Attachment } from '@renderer/types';
import { ScrollArea } from '@renderer/components/ui/scroll-area';

/** 斜杠命令定义 */
const SLASH_COMMANDS = [
  {
    id: 'init',
    name: 'init',
    description: '分析项目并生成 QWEN.md 文件',
  },
] as const;

/** 补全菜单类型 */
type CompletionMode = 'idle' | 'slash' | 'at';

/** 补全项分组 */
type CompletionGroup = '命令' | '技能';

/** 补全项 */
interface CompletionItem {
  id: string;
  label: string;
  description?: string;
  group?: CompletionGroup;
  type?: 'file' | 'folder';
}

/** 审批模式定义 */
const APPROVAL_MODES = [
  {
    id: 'plan',
    name: 'Plan',
    description: '仅分析，不修改文件或执行命令',
    icon: Shield,
  },
  {
    id: 'default',
    name: 'Default',
    description: '编辑和命令均需审批',
    icon: ShieldCheck,
  },
  {
    id: 'auto-edit',
    name: 'Auto Edit',
    description: '自动批准文件编辑',
    icon: ShieldAlert,
  },
  {
    id: 'yolo',
    name: 'YOLO',
    description: '自动批准所有工具',
    icon: Zap,
  },
] as const;

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  onAbort: () => void;
  isLoading: boolean;
  disabled?: boolean;
  approvalMode: string;
  onApprovalModeChange: (mode: string) => void;
  contextUsage?: { promptTokenCount: number; contextWindowSize: number };
  currentModel?: { model: string | null; authType: string | null };
  availableModels?: Array<{
    id: string;
    label: string;
    authType: string;
    isRuntimeModel?: boolean;
    runtimeSnapshotId?: string;
  }>;
  onModelChange?: (authType: string, modelId: string) => void;
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ChatInput 暴露给外部的方法 */
export interface ChatInputHandle {
  /** 将文件路径以 @path 形式插入输入框 */
  insertFilePath: (filePath: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({
  onSend,
  onAbort,
  isLoading,
  disabled,
  approvalMode,
  onApprovalModeChange,
  contextUsage,
  currentModel,
  availableModels,
  onModelChange,
}, ref) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 暴露 insertFilePath 方法给外部调用
  useImperativeHandle(ref, () => ({
    insertFilePath(filePath: string) {
      setInput((prev) => {
        const prefix = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
        return `${prev}${prefix}@${filePath} `;
      });
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          textarea.style.height = 'auto';
          textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
      });
    },
  }), []);

  // 附件状态
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // 补全菜单状态
  const [completionMode, setCompletionMode] = useState<CompletionMode>('idle');
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const fileSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skills 缓存，避免频繁 IPC
  const skillsCacheRef = useRef<Array<{ name: string; description: string }> | null>(null);
  const skillsCacheTimeRef = useRef<number>(0);
  const SKILLS_CACHE_TTL = 30_000; // 30秒缓存

  // 检测输入内容变化，决定是否显示补全菜单
  useEffect(() => {
    const trimmed = input.trimStart();

    // 检测 / 命令
    if (trimmed.startsWith('/')) {
      const query = trimmed.slice(1).toLowerCase();

      // 硬编码命令补全项
      const commandItems: CompletionItem[] = SLASH_COMMANDS.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(query) ||
          cmd.description.toLowerCase().includes(query),
      ).map((cmd) => ({
        id: cmd.id,
        label: `/${cmd.name}`,
        description: cmd.description,
        group: '命令' as CompletionGroup,
      }));

      // 异步加载 Skills
      const now = Date.now();
      const useCache = skillsCacheRef.current && (now - skillsCacheTimeRef.current < SKILLS_CACHE_TTL);

      if (useCache) {
        // 使用缓存
        const skillItems: CompletionItem[] = skillsCacheRef.current!
          .filter((s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))
          .map((s) => ({
            id: `skill:${s.name}`,
            label: `/${s.name}`,
            description: s.description,
            group: '技能' as CompletionGroup,
          }));
        const allItems = [...commandItems, ...skillItems];
        setCompletionItems(allItems);
        setCompletionMode(allItems.length > 0 ? 'slash' : 'idle');
        setActiveIndex(0);
      } else {
        // 先显示命令项，同时异步加载 skills
        setCompletionItems(commandItems);
        setCompletionMode(commandItems.length > 0 ? 'slash' : 'idle');
        setActiveIndex(0);

        void (async () => {
          try {
            const skills = await window.electronAPI.listSkills();
            skillsCacheRef.current = skills;
            skillsCacheTimeRef.current = Date.now();
            const skillItems: CompletionItem[] = skills
              .filter((s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))
              .map((s) => ({
                id: `skill:${s.name}`,
                label: `/${s.name}`,
                description: s.description,
                group: '技能' as CompletionGroup,
              }));
            const allItems = [...commandItems, ...skillItems];
            setCompletionItems(allItems);
            setCompletionMode(allItems.length > 0 ? 'slash' : 'idle');
          } catch {
            // Skills 加载失败，保留命令项
          }
        })();
      }
      return;
    }

    // 检测 @ 文件引用
    const textarea = textareaRef.current;
    if (textarea) {
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = input.slice(0, cursorPos);
      // 在光标位置向前查找最后一个 @ 符号（需在行首或空格后）
      const atMatch = textBeforeCursor.match(/(?:^|\s)@(\S*)$/);
      if (atMatch) {
        const query = atMatch[1];
        setCompletionMode('at');
        setActiveIndex(0);
        // 防抖搜索文件
        if (fileSearchTimer.current) {
          clearTimeout(fileSearchTimer.current);
        }
        fileSearchTimer.current = setTimeout(() => {
          void searchFiles(query);
        }, 150);
        return;
      }
    }

    // 无匹配，关闭补全菜单
    setCompletionMode('idle');
    setCompletionItems([]);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 搜索项目文件 */
  const searchFiles = useCallback(async (pattern: string) => {
    try {
      const files = await window.electronAPI.listProjectFiles(pattern);
      const items: CompletionItem[] = files.map((f: string) => {
        const isFolder = f.endsWith('/');
        return {
          id: isFolder ? f.slice(0, -1) : f,
          label: f,
          type: (isFolder ? 'folder' : 'file') as 'file' | 'folder',
        };
      });
      setCompletionItems(items);
      if (items.length === 0) {
        setCompletionMode('idle');
      }
    } catch {
      setCompletionItems([]);
      setCompletionMode('idle');
    }
  }, []);

  /** 选中补全项 */
  const handleCompletionSelect = useCallback(
    (item: CompletionItem) => {
      if (completionMode === 'slash') {
        if (item.group === '技能') {
          // 技能项：插入到输入框，允许与其他内容混合发送
          const skillName = item.id.replace('skill:', '');
          const commandText = `/skills ${skillName} `;
          setInput(commandText);
          // 移动光标到末尾
          requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (textarea) {
              textarea.selectionStart = commandText.length;
              textarea.selectionEnd = commandText.length;
              textarea.focus();
              textarea.style.height = 'auto';
              textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
            }
          });
        } else {
          // 斜杠命令：直接发送
          onSend(item.label);
          setInput('');
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        }
      } else if (completionMode === 'at') {
        // @ 文件：插入到输入框
        const textarea = textareaRef.current;
        if (textarea) {
          const cursorPos = textarea.selectionStart;
          const textBeforeCursor = input.slice(0, cursorPos);
          const atMatch = textBeforeCursor.match(/(?:^|\s)@(\S*)$/);
          if (atMatch) {
            const matchStart =
              textBeforeCursor.length - atMatch[0].length + (atMatch[0].startsWith(' ') ? 1 : 0);
            const before = input.slice(0, matchStart);
            const after = input.slice(cursorPos);

            if (item.type === 'folder') {
              // 文件夹：插入路径并继续补全（不关闭菜单）
              const folderPath = item.id + '/';
              const newValue = `${before}@${folderPath}${after}`;
              setInput(newValue);
              const newCursorPos = matchStart + 1 + folderPath.length;
              requestAnimationFrame(() => {
                textarea.selectionStart = newCursorPos;
                textarea.selectionEnd = newCursorPos;
                textarea.focus();
              });
              return;
            }

            // 文件：正常插入并关闭
            const newValue = `${before}@${item.id} ${after}`;
            setInput(newValue);
            // 移动光标到插入内容之后
            const newCursorPos = matchStart + 1 + item.id.length + 1;
            requestAnimationFrame(() => {
              textarea.selectionStart = newCursorPos;
              textarea.selectionEnd = newCursorPos;
              textarea.focus();
            });
          }
        }
      }
      setCompletionMode('idle');
      setCompletionItems([]);
    },
    [completionMode, input, onSend],
  );

  /** 添加附件 */
  const addAttachment = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  /** 移除附件 */
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /** 处理粘贴事件 - 支持剪贴板图片和文件管理器复制的文件 */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = e.clipboardData;

      // 优先检查浏览器 clipboardData 中的图片（截图粘贴）
      if (clipboardData.items) {
        for (const item of Array.from(clipboardData.items)) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            if (blob) {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                addAttachment({
                  id: crypto.randomUUID(),
                  type: 'image',
                  name: `截图-${new Date().toLocaleTimeString()}.png`,
                  data: dataUrl,
                  size: blob.size,
                  mimeType: item.type,
                });
              };
              reader.readAsDataURL(blob);
            }
            return;
          }
        }
      }

      // 检查剪贴板中是否只有纯文本（如果有纯文本，让默认粘贴行为处理）
      const hasPlainText = clipboardData.types.includes('text/plain');
      const plainText = hasPlainText ? clipboardData.getData('text/plain') : '';

      // 如果没有纯文本，或纯文本为空，尝试通过 Electron IPC 读取系统剪贴板
      // 这适用于从文件管理器复制的文件
      if (!plainText) {
        e.preventDefault();
        void (async () => {
          try {
            const result = await window.electronAPI.readClipboardFiles();
            if (result && result.items.length > 0) {
              for (const item of result.items) {
                if (result.type === 'image') {
                  // 剪贴板中的图片（已经是 data URL）
                  addAttachment({
                    id: crypto.randomUUID(),
                    type: 'image',
                    name: item.name,
                    data: item.path, // path 在此情况下就是 data URL
                    size: item.size,
                    mimeType: item.mimeType,
                  });
                } else {
                  // 文件管理器复制的文件
                  const isImageFile = item.mimeType.startsWith('image/');
                  let previewData = item.path;

                  // 如果是图片文件，读取为 data URL 用于预览
                  if (isImageFile) {
                    const dataUrl =
                      await window.electronAPI.readFileAsDataUrl(item.path);
                    if (dataUrl) {
                      previewData = dataUrl;
                    }
                  }

                  addAttachment({
                    id: crypto.randomUUID(),
                    type: isImageFile ? 'image' : 'file',
                    name: item.name,
                    data: isImageFile ? previewData : item.path,
                    size: item.size,
                    mimeType: item.mimeType,
                  });
                }
              }
            }
          } catch {
            // 读取剪贴板失败，忽略
          }
        })();
      }
    },
    [addAttachment],
  );

  const handleSend = useCallback(() => {
    if ((input.trim() || attachments.length > 0) && !isLoading) {
      onSend(input, attachments.length > 0 ? attachments : undefined);
      setInput('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input, isLoading, onSend, attachments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // 补全菜单打开时的键盘导航
      if (completionMode !== 'idle' && completionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < completionItems.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : completionItems.length - 1,
          );
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          handleCompletionSelect(completionItems[activeIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setCompletionMode('idle');
          setCompletionItems([]);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, completionMode, completionItems, activeIndex, handleCompletionSelect],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      // Auto-resize textarea
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    },
    [],
  );

  const currentModeInfo = APPROVAL_MODES.find((m) => m.id === approvalMode) ?? APPROVAL_MODES[1];
  const CurrentModeIcon = currentModeInfo.icon;

  const handleModeSelect = useCallback(
    (modeId: string) => {
      onApprovalModeChange(modeId);
    },
    [onApprovalModeChange],
  );

  // 补全菜单标题
  const completionTitle = useMemo(() => {
    if (completionMode === 'slash') return null; // 使用分组标题代替
    if (completionMode === 'at') return '文件和文件夹';
    return '';
  }, [completionMode]);

  // 按分组归类补全项
  const groupedCompletionItems = useMemo(() => {
    if (completionMode !== 'slash') return null;
    const groups = new Map<CompletionGroup, CompletionItem[]>();
    for (const item of completionItems) {
      const group = item.group ?? '命令';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(item);
    }
    return groups;
  }, [completionMode, completionItems]);

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto max-w-3xl relative">
        {/* 补全菜单浮层 */}
        {completionMode !== 'idle' && completionItems.length > 0 && (
          <div className="absolute bottom-full left-0 z-50 mb-1 w-full">
            <ScrollArea className="h-60 rounded-md border bg-popover p-1 shadow-md">
              {completionMode === 'slash' && groupedCompletionItems ? (
                // 分组渲染（命令 + 技能）
                Array.from(groupedCompletionItems.entries()).map(([groupName, items]) => (
                  <div key={groupName}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {groupName}
                    </div>
                    {items.map((item) => {
                      const globalIdx = completionItems.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none cursor-default ${
                            globalIdx === activeIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'text-popover-foreground'
                          }`}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCompletionSelect(item);
                          }}
                        >
                          {item.group === '技能' ? (
                            <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                          ) : (
                            <Terminal className="h-4 w-4 shrink-0 mt-0.5" />
                          )}
                          <div className="flex flex-col items-start overflow-hidden">
                            <span className="font-medium truncate w-full text-left">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="text-xs text-muted-foreground truncate w-full text-left">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                // @ 文件模式：原始渲染
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {completionTitle}
                  </div>
                  {completionItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none cursor-default ${
                        index === activeIndex
                          ? 'bg-accent text-accent-foreground'
                          : 'text-popover-foreground'
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCompletionSelect(item);
                      }}
                    >
                      {item.type === 'folder' ? (
                        <Folder className="h-4 w-4 shrink-0 mt-0.5" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                      )}
                      <div className="flex flex-col items-start overflow-hidden">
                        <span className="font-medium truncate w-full text-left">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground truncate w-full text-left">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </ScrollArea>
          </div>
        )}

        <InputGroup className="overflow-hidden">
          <InputGroupTextarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="发送消息… 输入 / 打开命令菜单，输入 @ 添加文件，Ctrl+V 粘贴图片或文件"
            disabled={disabled}
          />

          {/* 附件预览区域 */}
          {attachments.length > 0 && (
            <InputGroupAddon align="block-end">
              <div className="flex w-full flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group/att relative flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5"
                  >
                    {att.type === 'image' ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={att.data}
                          alt={att.name}
                          className="h-12 w-12 rounded object-cover"
                        />
                        <div className="flex flex-col">
                          <span className="max-w-[120px] truncate text-xs font-medium">
                            {att.name}
                          </span>
                          {att.size && (
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(att.size)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="max-w-[150px] truncate text-xs font-medium">
                            {att.name}
                          </span>
                          {att.size && (
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(att.size)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground shadow-sm group-hover/att:flex"
                      onClick={() => removeAttachment(att.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </InputGroupAddon>
          )}

          <InputGroupAddon align="block-end">
            <div className="flex w-full items-center justify-between">
              {/* 模式选择按钮 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    disabled={isLoading}
                  >
                    <CurrentModeIcon className="h-3.5 w-3.5" />
                    <span>{currentModeInfo.name}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start" side="top">
                  {APPROVAL_MODES.map((mode) => {
                    const ModeIcon = mode.icon;
                    return (
                      <DropdownMenuItem
                        key={mode.id}
                        className="flex items-start gap-2 focus:bg-accent focus:text-accent-foreground"
                        onClick={() => handleModeSelect(mode.id)}
                      >
                        <ModeIcon className="h-4 w-4 shrink-0" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{mode.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {mode.description}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 模型选择下拉 */}
              {availableModels && availableModels.length > 0 && onModelChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mr-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                      disabled={isLoading}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="max-w-[120px] truncate">
                        {currentModel?.model ?? '模型'}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-64 w-64 overflow-y-auto" align="start" side="top">
                    {availableModels.map((m) => {
                      const value = m.isRuntimeModel && m.runtimeSnapshotId
                        ? m.runtimeSnapshotId
                        : `${m.authType}::${m.id}`;
                      const currentKey = currentModel?.model
                        ? (availableModels.find(
                            (am) =>
                              am.id === currentModel.model ||
                              am.runtimeSnapshotId === currentModel.model,
                          )
                            ? (() => {
                                const found = availableModels.find(
                                  (am) =>
                                    am.id === currentModel.model ||
                                    am.runtimeSnapshotId === currentModel.model,
                                )!;
                                return found.isRuntimeModel && found.runtimeSnapshotId
                                  ? found.runtimeSnapshotId
                                  : `${found.authType}::${found.id}`;
                              })()
                            : null)
                        : null;
                      const isActive = value === currentKey;
                      return (
                        <DropdownMenuItem
                          key={value}
                          className={`flex items-start gap-2 focus:bg-accent focus:text-accent-foreground ${isActive ? 'bg-accent/50' : ''}`}
                          onClick={() => {
                            if (value.startsWith('$runtime|')) {
                              const parts = value.split('|');
                              onModelChange(parts[1]!, value);
                            } else {
                              const idx = value.indexOf('::');
                              onModelChange(value.slice(0, idx), value.slice(idx + 2));
                            }
                          }}
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-medium">
                              {m.label}
                              {m.isRuntimeModel && (
                                <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                                  Runtime
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {m.authType}
                            </span>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* 上下文消耗显示 */}
              {contextUsage && contextUsage.promptTokenCount > 0 && contextUsage.contextWindowSize > 0 && (
                <span className="ml-auto mr-2 text-xs text-muted-foreground">
                  {((contextUsage.promptTokenCount / contextUsage.contextWindowSize) * 100).toFixed(1)}% context used
                </span>
              )}

              {/* 发送/停止按钮 */}
              {isLoading ? (
                <InputGroupButton
                  variant="destructive"
                  size="icon-sm"
                  onClick={onAbort}
                >
                  <Square className="h-4 w-4" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  variant="default"
                  size="icon-sm"
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0) || disabled}
                >
                  <Send className="h-4 w-4" />
                </InputGroupButton>
              )}
            </div>
          </InputGroupAddon>
        </InputGroup>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Qwen Code 可能会出错。请检查重要信息。
        </p>
      </div>
    </div>
  );
});
ChatInput.displayName = 'ChatInput';
