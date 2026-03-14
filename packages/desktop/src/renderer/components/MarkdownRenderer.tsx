/**
 * MarkdownRenderer — 统一的 Markdown 渲染组件
 *
 * 功能：
 * - 代码块使用 react-syntax-highlighter (Prism) 进行语法高亮
 * - 表格应用 Tailwind 样式（无需 @tailwindcss/typography 插件）
 * - 支持 remark-gfm（表格、删除线、任务列表等 GitHub 扩展语法）
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';

/** Markdown 组件映射：代码高亮 + 表格样式 */
const markdownComponents: Components = {
  // 代码块 / 行内代码
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '');
    const isBlock = Boolean(match);

    if (isBlock) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match![1]}
          PreTag="div"
          className="rounded-md text-sm"
          {...(props as object)}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    }

    return (
      <code
        className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground break-all whitespace-pre-wrap"
        {...props}
      >
        {children}
      </code>
    );
  },

  // 表格元素样式
  table({ children, ...props }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...props}>
          {children}
        </table>
      </div>
    );
  },
  thead({ children, ...props }) {
    return (
      <thead className="bg-muted/50" {...props}>
        {children}
      </thead>
    );
  },
  tbody({ children, ...props }) {
    return <tbody {...props}>{children}</tbody>;
  },
  tr({ children, ...props }) {
    return (
      <tr className="even:bg-muted/20" {...props}>
        {children}
      </tr>
    );
  },
  th({ children, ...props }) {
    return (
      <th
        className="border border-border px-3 py-1.5 text-left font-semibold"
        {...props}
      >
        {children}
      </th>
    );
  },
  td({ children, ...props }) {
    return (
      <td className="border border-border px-3 py-1.5" {...props}>
        {children}
      </td>
    );
  },

  // 链接：蓝色高亮，点击后用默认浏览器打开
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        className="text-blue-500 hover:text-blue-400 underline underline-offset-2 cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          if (href) {
            window.electronAPI.openExternal(href);
          }
        }}
        {...props}
      >
        {children}
      </a>
    );
  },
};

interface MarkdownRendererProps {
  /** Markdown 文本内容 */
  children: string;
  /** 额外的容器 className */
  className?: string;
}

/**
 * 统一 Markdown 渲染组件，带代码高亮与表格样式。
 */
export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  return (
    <div
      className={
        'prose prose-sm dark:prose-invert max-w-none break-words prose-pre:bg-transparent prose-pre:p-0' +
        (className ? ` ${className}` : '')
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
