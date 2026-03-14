import {
  ChevronRight,
  Wrench,
  Check,
  X,
  Loader2,
  Brain,
  ShieldQuestion,
  Terminal,
  FileEdit,
  Ban,
  ScrollText,
  Info,
  Server,
} from 'lucide-react';
import { MarkdownRenderer } from '@renderer/components/MarkdownRenderer';
import { ToolResultRenderer } from '@renderer/components/ToolResultRenderer';
import { DiffView } from '@renderer/components/DiffView';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';
import type { ChatMessage as ChatMessageType, ToolCallInfo, ContentBlock } from '@renderer/types';

interface ChatMessageProps {
  message: ChatMessageType;
  onApprove?: (callId: string, outcome: string) => void;
}

function ToolCallDisplay({
  toolCall,
  onApprove,
}: {
  toolCall: ToolCallInfo;
  onApprove?: (callId: string, outcome: string) => void;
}) {
  const statusConfig = {
    pending: {
      icon: <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />,
      badge: 'secondary' as const,
      label: '等待中',
    },
    running: {
      icon: <Loader2 className="h-3 w-3 animate-spin text-blue-500" />,
      badge: 'secondary' as const,
      label: '运行中',
    },
    completed: {
      icon: <Check className="h-3 w-3 text-green-500" />,
      badge: 'default' as const,
      label: '完成',
    },
    failed: {
      icon: <X className="h-3 w-3 text-red-500" />,
      badge: 'destructive' as const,
      label: '失败',
    },
    awaiting_approval: {
      icon: <ShieldQuestion className="h-3 w-3 text-amber-500" />,
      badge: 'outline' as const,
      label: '等待审批',
    },
    canceled: {
      icon: <Ban className="h-3 w-3 text-muted-foreground" />,
      badge: 'secondary' as const,
      label: '已取消',
    },
  }[toolCall.status];

  // 工具展示名称：优先使用 displayName，回退到 name
  const toolDisplayName = toolCall.displayName || toolCall.name;
  // 工具描述：优先使用 description
  const toolDescription = toolCall.description;

  // 当前活跃的展示内容：完成后显示 resultDisplay，运行中显示 liveOutput
  const activeDisplay = toolCall.resultDisplay || toolCall.liveOutput;

  return (
    <Collapsible defaultOpen={true} className="rounded-lg border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50">
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 shrink-0 font-medium text-xs">
          {toolDisplayName}
        </span>
        {toolDescription && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {toolDescription}
          </span>
        )}
        {statusConfig.icon}
        <Badge variant={statusConfig.badge} className="ml-auto text-[10px]">
          {statusConfig.label}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-3 py-2 space-y-2">
          {/* 富确认 UI */}
          {toolCall.status === 'awaiting_approval' && (
            <ToolApprovalContent
              toolCall={toolCall}
              onApprove={onApprove}
            />
          )}

          {/* 实时输出 / 结果展示 */}
          {activeDisplay && (
            <ToolResultRenderer resultDisplay={activeDisplay} />
          )}

          {/* 没有结果展示时回退显示原始参数 */}
          {!activeDisplay && toolCall.status !== 'awaiting_approval' && (
            <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          )}

          {/* 错误信息 */}
          {toolCall.error && (
            <p className="text-xs text-destructive">
              {typeof toolCall.error === 'string'
                ? toolCall.error
                : String(toolCall.error)}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 富确认内容：根据确认类型渲染不同 UI 和选项（对齐 CLI） */
function ToolApprovalContent({
  toolCall,
  onApprove,
}: {
  toolCall: ToolCallInfo;
  onApprove?: (callId: string, outcome: string) => void;
}) {
  const handleAction = (outcome: string) => onApprove?.(toolCall.callId, outcome);
  const type = toolCall.confirmationType;

  return (
    <div className="space-y-3">
      {/* === 编辑确认：展示 Diff === */}
      {type === 'edit' && toolCall.confirmationFileDiff && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <FileEdit className="h-3 w-3" />
            {toolCall.confirmationTitle || '应用此更改？'}
          </div>
          <DiffView
            diff={toolCall.confirmationFileDiff}
            fileName={toolCall.confirmationFileName}
            maxLines={50}
          />
        </>
      )}

      {/* === 执行确认：展示命令 === */}
      {type === 'exec' && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Terminal className="h-3 w-3" />
            {toolCall.confirmationTitle || '允许执行？'}
          </div>
          {toolCall.confirmationCommand && (
            <pre className="overflow-x-auto rounded-md bg-black/80 px-3 py-2 font-mono text-xs text-green-400">
              $ {toolCall.confirmationCommand}
            </pre>
          )}
        </>
      )}

      {/* === 计划确认：展示计划 Markdown === */}
      {type === 'plan' && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <ScrollText className="h-3 w-3" />
            {toolCall.confirmationTitle || 'Would you like to proceed?'}
          </div>
          {toolCall.confirmationPlan && (
            <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
              <MarkdownRenderer>{toolCall.confirmationPlan}</MarkdownRenderer>
            </div>
          )}
        </>
      )}

      {/* === Info 确认：展示提示和 URL === */}
      {type === 'info' && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Info className="h-3 w-3" />
            {toolCall.confirmationTitle || '是否继续？'}
          </div>
          {toolCall.confirmationPrompt && (
            <p className="text-xs text-muted-foreground">{toolCall.confirmationPrompt}</p>
          )}
          {toolCall.confirmationUrls && toolCall.confirmationUrls.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">URLs:</p>
              {toolCall.confirmationUrls.map((url, i) => (
                <p key={i} className="truncate text-xs text-blue-600 dark:text-blue-400">• {url}</p>
              ))}
            </div>
          )}
        </>
      )}

      {/* === MCP 确认：展示服务器和工具信息 === */}
      {type === 'mcp' && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Server className="h-3 w-3" />
            {toolCall.confirmationTitle || '允许 MCP 工具调用？'}
          </div>
          <div className="rounded bg-muted/50 px-2 py-1.5 text-xs space-y-0.5">
            {toolCall.confirmationServerName && (
              <p className="text-muted-foreground">服务器: <span className="font-medium text-foreground">{toolCall.confirmationServerName}</span></p>
            )}
            <p className="text-muted-foreground">工具: <span className="font-medium text-foreground">{toolCall.confirmationToolDisplayName || toolCall.name}</span></p>
          </div>
        </>
      )}

      {/* === 未知类型 fallback === */}
      {!type && toolCall.confirmationTitle && (
        <div className="rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <p className="font-medium">{toolCall.confirmationTitle}</p>
          {toolCall.confirmationDescription && (
            <p className="mt-1 text-muted-foreground">{toolCall.confirmationDescription}</p>
          )}
        </div>
      )}

      {/* === 选项按钮组（根据确认类型不同） === */}
      <div className="flex flex-wrap items-center gap-2">
        {type === 'plan' ? (
          /* Plan 确认：自动接受 / 手动批准 / 继续规划 */
          <>
            <Button
              size="sm"
              variant="default"
              className="h-7 bg-green-600 px-3 text-xs text-white hover:bg-green-700"
              onClick={() => handleAction('proceed_always')}
            >
              <Check className="mr-1 h-3 w-3" />
              是，自动接受编辑
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={() => handleAction('proceed_once')}
            >
              是，手动批准编辑
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs text-muted-foreground"
              onClick={() => handleAction('cancel')}
            >
              否，继续规划
            </Button>
          </>
        ) : type === 'mcp' ? (
          /* MCP 确认：允许一次 / 始终允许工具 / 始终允许服务器 / 拒绝 */
          <>
            <Button
              size="sm"
              variant="default"
              className="h-7 bg-green-600 px-3 text-xs text-white hover:bg-green-700"
              onClick={() => handleAction('proceed_once')}
            >
              <Check className="mr-1 h-3 w-3" />
              允许一次
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={() => handleAction('proceed_always_tool')}
            >
              始终允许该工具
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={() => handleAction('proceed_always_server')}
            >
              始终允许该服务器
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-3 text-xs"
              onClick={() => handleAction('cancel')}
            >
              <X className="mr-1 h-3 w-3" />
              拒绝
            </Button>
          </>
        ) : (
          /* edit / exec / info / 默认：允许一次 / 始终允许 / 拒绝 */
          <>
            <Button
              size="sm"
              variant="default"
              className="h-7 bg-green-600 px-3 text-xs text-white hover:bg-green-700"
              onClick={() => handleAction('proceed_once')}
            >
              <Check className="mr-1 h-3 w-3" />
              允许一次
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={() => handleAction('proceed_always')}
            >
              始终允许
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-3 text-xs"
              onClick={() => handleAction('cancel')}
            >
              <X className="mr-1 h-3 w-3" />
              {type === 'info' ? '拒绝' : '拒绝，建议修改'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** 渲染内容块 */
function ContentBlockDisplay({
  block,
  onApprove,
}: {
  block: ContentBlock;
  onApprove?: (callId: string, outcome: string) => void;
}) {
  switch (block.type) {
    case 'thought':
      return (
        <div className="text-sm italic text-muted-foreground">
          <Brain className="mr-1 inline h-4 w-4" />
          {block.text}
        </div>
      );
    case 'content':
      return <MarkdownRenderer>{block.text}</MarkdownRenderer>;
    case 'tool_call':
      return (
        <ToolCallDisplay
          toolCall={block.toolCall}
          onApprove={onApprove}
        />
      );
    default:
      return null;
  }
}

export function ChatMessage({ message, onApprove }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  return (
    <div
      className={cn(
        'group px-4 py-4',
        isUser ? 'flex justify-end' : ''
      )}
    >
      {/* 用户消息用 card 包裹，靠右显示 */}
      {isUser ? (
        <div className="max-w-[80%] rounded-lg border bg-card text-card-foreground px-4 py-3 shadow-sm">
          {message.content && (
            <MarkdownRenderer>{message.content}</MarkdownRenderer>
          )}
        </div>
      ) : (
        /* AI 消息去掉背景色，直接渲染内容 */
        <div className="w-full">
          {/* 助手消息按 blocks 顺序渲染 */}
          {message.blocks && message.blocks.length > 0 && (
            <div className="space-y-2">
              {message.blocks.map((block, index) => (
                <ContentBlockDisplay
                  key={`${block.type}-${index}`}
                  block={block}
                  onApprove={onApprove}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
