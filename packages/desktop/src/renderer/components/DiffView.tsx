/**
 * DiffView - 文件差异渲染组件
 *
 * 解析 unified diff 格式并展示增删行高亮。
 */

import { cn } from '@renderer/lib/utils';

interface DiffViewProps {
  /** unified diff 字符串 */
  diff: string;
  /** 文件名 */
  fileName?: string;
  /** 最大显示行数 (0 = 不限制) */
  maxLines?: number;
  /** 附加 className */
  className?: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // 解析 hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      result.push({
        type: 'add',
        content: line.slice(1),
        newLineNo: newLine++,
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNo: oldLine++,
      });
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — skip
      continue;
    } else {
      // Context line (starts with space or is empty)
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({
        type: 'context',
        content,
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
    }
  }

  return result;
}

export function DiffView({
  diff,
  fileName,
  maxLines = 0,
  className,
}: DiffViewProps) {
  const diffLines = parseDiff(diff);
  const displayLines =
    maxLines > 0 ? diffLines.slice(0, maxLines) : diffLines;
  const truncated = maxLines > 0 && diffLines.length > maxLines;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border text-xs font-mono',
        className,
      )}
    >
      {/* 文件名头部 */}
      {fileName && (
        <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-1.5 text-muted-foreground">
          <span className="font-medium">{fileName}</span>
        </div>
      )}

      {/* Diff 内容 */}
      <div className="overflow-x-auto">
        <div className="w-fit min-w-full">
        {displayLines.map((line, i) => {
          if (line.type === 'header') {
            return (
              <div
                key={i}
                className="bg-blue-500/10 px-3 py-0.5 text-blue-600 dark:text-blue-400"
              >
                {line.content}
              </div>
            );
          }

          const bgClass =
            line.type === 'add'
              ? 'bg-green-500/15 text-green-700 dark:text-green-400'
              : line.type === 'remove'
                ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                : 'text-muted-foreground';

          const prefix =
            line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

          return (
            <div key={i} className={cn('flex', bgClass)}>
              {/* 行号 */}
              <span className="w-8 shrink-0 select-none border-r px-1 text-right text-muted-foreground/50">
                {line.type === 'remove'
                  ? line.oldLineNo ?? ''
                  : line.type === 'add'
                    ? line.newLineNo ?? ''
                    : line.oldLineNo ?? ''}
              </span>
              <span className="w-8 shrink-0 select-none border-r px-1 text-right text-muted-foreground/50">
                {line.type === 'remove'
                  ? ''
                  : line.type === 'add'
                    ? line.newLineNo ?? ''
                    : line.newLineNo ?? ''}
              </span>
              {/* 前缀 + 内容 */}
              <span className="shrink-0 select-none px-1">{prefix}</span>
              <span className="flex-1 whitespace-pre px-1">
                {line.content}
              </span>
            </div>
          );
        })}

        {truncated && (
          <div className="border-t bg-muted/30 px-3 py-1 text-center text-muted-foreground">
            ... 省略 {diffLines.length - maxLines} 行
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
