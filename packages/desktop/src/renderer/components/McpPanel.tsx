import { useState } from 'react';
import {
  Server,
  ChevronRight,
  Wrench,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
  Plug,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@renderer/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { cn } from '@renderer/lib/utils';
import type { McpServerInfo } from '@preload/preload';

interface McpPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: McpServerInfo[];
  loading: boolean;
  onRefresh: () => void;
}

const statusConfig = {
  connected: {
    icon: Wifi,
    label: '已连接',
    dotClass: 'bg-green-500',
    badgeVariant: 'default' as const,
    iconClass: 'text-green-500',
  },
  connecting: {
    icon: Loader2,
    label: '连接中',
    dotClass: 'bg-yellow-500',
    badgeVariant: 'secondary' as const,
    iconClass: 'text-yellow-500',
  },
  disconnected: {
    icon: WifiOff,
    label: '未连接',
    dotClass: 'bg-muted-foreground/40',
    badgeVariant: 'outline' as const,
    iconClass: 'text-muted-foreground',
  },
};

/** 单个 MCP 服务器卡片 */
function McpServerCard({ server }: { server: McpServerInfo }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = statusConfig[server.status] || statusConfig.disconnected;
  const StatusIcon = config.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/50 cursor-pointer">
        {/* 状态指示点 */}
        <div className="relative flex shrink-0 items-center justify-center">
          <Server className={cn('h-4 w-4', config.iconClass)} />
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-card',
              config.dotClass,
              server.status === 'connecting' && 'animate-pulse',
            )}
          />
        </div>

        {/* 服务器名称和工具数 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {server.name}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {server.toolCount > 0 ? `${server.toolCount} 个工具` : '暂无工具'}
          </p>
        </div>

        {/* 状态徽章 */}
        <Badge variant={config.badgeVariant} className="shrink-0 text-[10px] px-1.5 h-5">
          <StatusIcon
            className={cn(
              'mr-1 h-2.5 w-2.5',
              server.status === 'connecting' && 'animate-spin',
            )}
          />
          {config.label}
        </Badge>

        {/* 展开箭头 */}
        {server.tools.length > 0 && (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-90',
            )}
          />
        )}
      </CollapsibleTrigger>

      {server.tools.length > 0 && (
        <CollapsibleContent>
          <div className="ml-3 mt-1 mb-1 space-y-0.5 border-l-2 border-muted pl-3">
            {server.tools.map((tool) => (
              <Tooltip key={tool.name}>
                <TooltipTrigger asChild>
                  <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 cursor-default">
                    <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground/90">
                        {tool.displayName}
                      </span>
                      {tool.description && (
                        <span className="block truncate text-[11px] text-muted-foreground leading-tight">
                          {tool.description}
                        </span>
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium">{tool.displayName}</p>
                  {tool.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{tool.name}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/** MCP 面板 - 以 Sheet 抽屉形式展示所有 MCP 服务器 */
export function McpPanel({
  open,
  onOpenChange,
  servers,
  loading,
  onRefresh,
}: McpPanelProps) {
  const connectedCount = servers.filter((s) => s.status === 'connected').length;
  const totalToolCount = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:max-w-sm p-0">
        {/* 头部 */}
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <Plug className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-sm">MCP 服务器</SheetTitle>
                <SheetDescription className="text-xs">
                  Model Context Protocol
                </SheetDescription>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onRefresh}
                  disabled={loading}
                >
                  <RefreshCw
                    className={cn(
                      'h-3.5 w-3.5',
                      loading && 'animate-spin',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新</TooltipContent>
            </Tooltip>
          </div>
        </SheetHeader>

        {/* 统计概览 */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b">
          <div className="rounded-md bg-muted/50 px-2.5 py-2 text-center">
            <p className="text-lg font-semibold text-foreground">{servers.length}</p>
            <p className="text-[10px] text-muted-foreground">服务器</p>
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-2 text-center">
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">{connectedCount}</p>
            <p className="text-[10px] text-muted-foreground">已连接</p>
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-2 text-center">
            <p className="text-lg font-semibold text-foreground">{totalToolCount}</p>
            <p className="text-[10px] text-muted-foreground">工具数</p>
          </div>
        </div>

        {/* 服务器列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {loading && servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="mt-2 text-sm">正在获取服务器状态...</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Server className="h-8 w-8 opacity-30" />
              <p className="mt-2 text-sm font-medium">暂无 MCP 服务器</p>
              <p className="mt-1 max-w-[200px] text-center text-xs text-muted-foreground/70">
                在项目配置中添加 MCP 服务器以启用外部工具扩展
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => (
                <McpServerCard key={server.name} server={server} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
