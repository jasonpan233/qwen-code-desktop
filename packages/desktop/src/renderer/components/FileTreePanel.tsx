import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Loader2,
  Plus,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { cn } from '@renderer/lib/utils';
import type { FileTreeNode } from '@renderer/hooks/useFileTree';

interface FileTreePanelProps {
  tree: FileTreeNode[];
  loading: boolean;
  onRefresh: () => void;
  onAddToInput?: (filePath: string) => void;
  currentProject?: string;
  onSwitchProject?: () => void;
}

/** 单个树节点 */
function TreeNode({
  node,
  depth,
  onAddToInput,
}: {
  node: FileTreeNode;
  depth: number;
  onAddToInput?: (filePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDir = node.type === 'directory';

  const handleToggle = useCallback(() => {
    if (isDir) setExpanded((prev) => !prev);
  }, [isDir]);

  return (
    <div>
      <div
        className="group/node flex items-center"
      >
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'flex flex-1 min-w-0 items-center gap-1 rounded-sm px-1 py-[3px] text-left text-[13px] leading-5 transition-colors',
            'hover:bg-accent/60 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          title={node.path}
        >
          {/* 展开/折叠箭头 */}
          {isDir ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="inline-block h-3.5 w-3.5 shrink-0" />
          )}

          {/* 图标 */}
          {isDir ? (
            expanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            )
          ) : (
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          {/* 名称 */}
          <span className="truncate">{node.name}</span>
        </button>

        {/* 添加到输入框按钮 - hover 时显示 */}
        {onAddToInput && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover/node:flex"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToInput(node.path);
                }}
              >
                <Plus className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">添加到输入框</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* 子节点 */}
      {isDir && expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onAddToInput={onAddToInput}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 文件树面板 - 右侧可折叠的文件浏览器 */
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

export function FileTreePanel({ tree, loading, onRefresh, onAddToInput, currentProject, onSwitchProject }: FileTreePanelProps) {
  const [open, setOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // 面板在右侧，鼠标左移 = 宽度增大
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!open) {
    return (
      <div className="flex items-start pt-3 pr-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)}
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">展开文件树</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="relative flex h-full shrink-0 flex-col border-l bg-muted/20" style={{ width: panelWidth }}>
      {/* 拖拽手柄 */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/50"
        onMouseDown={handleResizeMouseDown}
      />
      {/* 头部 */}
      <div className="flex flex-col border-b">
        {/* 项目名 + 工具栏 */}
        <div className="flex items-center gap-1 px-2 pt-2 pb-1">
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={currentProject}>
            {currentProject ? (currentProject.split(/[/\\]/).pop() ?? currentProject) : '未选择项目'}
          </span>

          {/* 操作按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">刷新</TooltipContent>
          </Tooltip>
          {onSwitchProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={onSwitchProject}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">切换项目</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">收起</TooltipContent>
          </Tooltip>
        </div>

        {/* 工作区路径 */}
        {currentProject && (
          <p className="truncate px-3 pb-2 text-[11px] leading-none text-muted-foreground/60" title={currentProject}>
            {currentProject}
          </p>
        )}
      </div>

      {/* 文件树内容 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1">
          {loading && tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="mt-2 text-xs">加载文件列表...</span>
            </div>
          ) : tree.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              暂无文件
            </div>
          ) : (
            tree.map((node) => (
              <TreeNode key={node.path} node={node} depth={0} onAddToInput={onAddToInput} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
