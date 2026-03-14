import { useRef, useState, useEffect } from 'react';
import { Plus, MessageSquare, Settings, Sun, Moon, Monitor, Trash2, Loader2, GitBranch, Plug, Languages } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { useTheme } from '@renderer/components/theme-provider';
import { cn } from '@renderer/lib/utils';
import { useSessionList } from '@renderer/hooks/useSessionList';
import type { SessionListItem } from '@preload/preload';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from '@renderer/components/ui/sidebar';
import { OutputLanguageDialog } from '@renderer/components/OutputLanguageDialog';

interface SidebarProps {
  onNewChat: () => void;
  onOpenAuth?: () => void;
  onSelectSession?: (sessionId: string) => void;
  currentSessionId?: string | null;
  onOpenMcp?: () => void;
  mcpServerCount?: number;
}

const themeOptions = [
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' },
  { value: 'system', icon: Monitor, label: '系统' },
] as const;

/** 菜单按钮 —— 复用 shadcn SidebarMenuButton 样式，但不依赖 SidebarProvider 上下文 */
function MenuButton({
  isActive = false,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { isActive?: boolean }) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-active={isActive}
      className={cn(
        'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        'h-8 text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** 提取会话显示标题：取第一行文本（对齐 CLI truncateText 逻辑） */
function getSessionDisplayTitle(prompt: string): string {
  if (!prompt) return '(空对话)';
  const firstLine = prompt.split(/\r?\n/, 1)[0].trim();
  return firstLine || '(空对话)';
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} 个月前`;
}

function SessionItem({
  session,
  isSelected,
  onSelect,
  onRemove,
}: {
  session: SessionListItem;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <SidebarMenuItem>
      <MenuButton
        isActive={isSelected}
        onClick={onSelect}
        className="h-auto items-start py-2"
      >
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-medium leading-tight">
            {getSessionDisplayTitle(session.prompt)}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatRelativeTime(session.startTime)}</span>
            <span>·</span>
            <span>{session.messageCount} 条消息</span>
          </div>
          {session.gitBranch && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{session.gitBranch}</span>
            </div>
          )}
        </div>
      </MenuButton>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-1 top-2 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive group-hover/menu-item:block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">删除会话</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ onNewChat, onOpenAuth, onSelectSession, currentSessionId, onOpenMcp, mcpServerCount }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    sessions,
    loading,
    loadingMore,
    removeSession,
    refresh,
  } = useSessionList(scrollRef);

  // 输出语言弹窗状态
  const [langDialogOpen, setLangDialogOpen] = useState(false);
  const [currentLangDisplay, setCurrentLangDisplay] = useState<string>('');

  // 初始加载当前输出语言
  useEffect(() => {
    window.electronAPI.getOutputLanguage().then(({ setting, resolved }) => {
      setCurrentLangDisplay(setting.toLowerCase() === 'auto' ? 'Auto' : resolved);
    }).catch(() => { /* ignore */ });
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-slot="sidebar"
        className="bg-sidebar text-sidebar-foreground flex h-full w-60 flex-col border-r"
      >
        <SidebarHeader>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              onNewChat();
              void refresh();
            }}
          >
            <Plus className="h-4 w-4" />
            新建对话
          </Button>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {loading && sessions.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-sm">加载中...</span>
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground">
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <span>暂无对话</span>
                    </div>
                  ) : (
                    <>
                      {sessions.map((session) => (
                        <SessionItem
                          key={session.sessionId}
                          session={session}
                          isSelected={currentSessionId === session.sessionId}
                          onSelect={() => onSelectSession?.(session.sessionId)}
                          onRemove={() => void removeSession(session.sessionId)}
                        />
                      ))}
                      {loadingMore && (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter>
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-1 h-6">主题</SidebarGroupLabel>
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = theme === option.value;
                return (
                  <Tooltip key={option.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          'flex flex-1 items-center justify-center rounded-md p-1.5 transition-colors',
                          isActive
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{option.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </SidebarGroup>

          <SidebarMenu>
            <SidebarMenuItem>
              <MenuButton onClick={() => setLangDialogOpen(true)}>
                <Languages className="h-4 w-4" />
                <span>输出语言</span>
                {currentLangDisplay && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {currentLangDisplay}
                  </span>
                )}
              </MenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuButton onClick={onOpenMcp}>
                <Plug className="h-4 w-4" />
                <span>MCP 服务器</span>
                {mcpServerCount != null && mcpServerCount > 0 && (
                  <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-medium text-primary">
                    {mcpServerCount}
                  </span>
                )}
              </MenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuButton onClick={onOpenAuth}>
                <Settings className="h-4 w-4" />
                <span>切换授权</span>
              </MenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </div>
      <OutputLanguageDialog
        open={langDialogOpen}
        onOpenChange={setLangDialogOpen}
        onLanguageChanged={(resolved) => setCurrentLangDisplay(resolved)}
      />
    </TooltipProvider>
  );
}
