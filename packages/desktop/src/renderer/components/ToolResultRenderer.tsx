/**
 * ToolResultRenderer - 统一的工具结果渲染器
 *
 * 根据 ToolResultDisplay 的多态类型分发到不同的渲染组件，
 * 对齐 CLI 的 useResultDisplayRenderer 逻辑。
 */

import { MarkdownRenderer } from '@renderer/components/MarkdownRenderer';
import { DiffView } from '@renderer/components/DiffView';
import { cn } from '@renderer/lib/utils';
import {
  CheckCircle2,
  Circle,
  Loader2,
  ListTodo,
  FileText,
} from 'lucide-react';
import type { ToolResultDisplay } from '@renderer/types';

interface ToolResultRendererProps {
  resultDisplay: ToolResultDisplay;
  className?: string;
}

/**
 * 判断结果展示类型并渲染
 */
export function ToolResultRenderer({
  resultDisplay,
  className,
}: ToolResultRendererProps) {
  if (!resultDisplay) return null;

  // 1. 字符串 → Markdown 渲染
  if (typeof resultDisplay === 'string') {
    if (!resultDisplay.trim()) return null;
    return (
      <div className={cn('text-xs text-muted-foreground', className)}>
        <MarkdownRenderer>{resultDisplay}</MarkdownRenderer>
      </div>
    );
  }

  // 2. FileDiff → DiffView
  if ('fileDiff' in resultDisplay && typeof resultDisplay.fileDiff === 'string') {
    return (
      <DiffView
        diff={resultDisplay.fileDiff}
        fileName={'fileName' in resultDisplay ? (resultDisplay.fileName as string) : undefined}
        maxLines={200}
        className={className}
      />
    );
  }

  // 3. TodoResultDisplay → Todo 列表
  if (
    typeof resultDisplay === 'object' &&
    'type' in resultDisplay &&
    resultDisplay.type === 'todo_list' &&
    'todos' in resultDisplay
  ) {
    return <TodoListView todos={resultDisplay.todos} className={className} />;
  }

  // 4. PlanResultDisplay → 计划摘要
  if (
    typeof resultDisplay === 'object' &&
    'type' in resultDisplay &&
    resultDisplay.type === 'plan_summary'
  ) {
    return (
      <div className={cn('rounded-md border bg-muted/20 p-2', className)}>
        <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <FileText className="h-3 w-3" />
          Plan
        </div>
        {'message' in resultDisplay && resultDisplay.message && (
          <p className="mb-1 text-xs text-muted-foreground">
            {resultDisplay.message}
          </p>
        )}
        {'plan' in resultDisplay && resultDisplay.plan && (
          <div className="text-xs">
            <MarkdownRenderer>{resultDisplay.plan}</MarkdownRenderer>
          </div>
        )}
      </div>
    );
  }

  // 5. AnsiOutputDisplay → ANSI 输出
  if ('ansiOutput' in resultDisplay) {
    const lines = (resultDisplay as { ansiOutput: string[] }).ansiOutput;
    if (!lines || lines.length === 0) return null;
    return (
      <pre
        className={cn(
          'max-h-60 overflow-auto rounded-md bg-black/90 p-2 font-mono text-xs text-green-400',
          className,
        )}
      >
        {lines.join('\n')}
      </pre>
    );
  }

  // 6. McpToolProgressData → 进度条
  if (
    typeof resultDisplay === 'object' &&
    'type' in resultDisplay &&
    resultDisplay.type === 'mcp_tool_progress'
  ) {
    const progress = resultDisplay as {
      progress: number;
      total?: number;
      message?: string;
    };
    const msg = progress.message ?? `Progress: ${progress.progress}`;
    const totalStr = progress.total != null ? `/${progress.total}` : '';
    return (
      <div className={cn('text-xs text-muted-foreground', className)}>
        ⏳ [{progress.progress}{totalStr}] {msg}
      </div>
    );
  }

  // 兜底：未知对象类型 → JSON 字符串展示，避免 React 直接渲染对象崩溃
  return (
    <div className={cn('text-xs text-muted-foreground', className)}>
      <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">
        {JSON.stringify(resultDisplay, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Todo 列表视图
 */
function TodoListView({
  todos,
  className,
}: {
  todos: Array<{ id: string; content: string; status: string }>;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border bg-muted/20 p-2', className)}>
      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <ListTodo className="h-3 w-3" />
        Todo List
      </div>
      <div className="space-y-1">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-start gap-1.5 text-xs">
            {todo.status === 'completed' ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
            ) : todo.status === 'in_progress' ? (
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-blue-500" />
            ) : (
              <Circle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={cn(
                todo.status === 'completed' && 'line-through text-muted-foreground/60',
              )}
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
