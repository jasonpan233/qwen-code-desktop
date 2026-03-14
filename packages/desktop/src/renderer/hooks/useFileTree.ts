import { useState, useCallback, useEffect, useMemo } from 'react';

/** 文件树节点 */
export interface FileTreeNode {
  /** 文件/目录名 */
  name: string;
  /** 完整相对路径 */
  path: string;
  /** 类型 */
  type: 'file' | 'directory';
  /** 子节点 (仅目录有) */
  children: FileTreeNode[];
}

/**
 * 将扁平文件路径列表转为嵌套树结构。
 * 路径分隔符同时兼容 `/` 和 `\`。
 */
function buildTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = {
    name: '',
    path: '',
    type: 'directory',
    children: [],
  };

  for (const filePath of paths) {
    const parts = filePath.split(/[/\\]/);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isLast = i === parts.length - 1;
      const existingChild = current.children.find(
        (c) => c.name === part && c.type === (isLast ? 'file' : 'directory'),
      );

      if (existingChild) {
        current = existingChild;
      } else {
        const newNode: FileTreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: isLast ? 'file' : 'directory',
          children: [],
        };
        current.children.push(newNode);
        current = newNode;
      }
    }
  }

  // 排序：目录在前，文件在后，同类型按名称排序
  function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes
      .map((node) => ({
        ...node,
        children: sortTree(node.children),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  }

  return sortTree(root.children);
}

/** 文件树 Hook - 获取项目文件并构建树结构 */
export function useFileTree() {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.electronAPI.listProjectFiles();
      setFiles(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次加载
  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const tree = useMemo(() => buildTree(files), [files]);

  return { tree, files, loading, error, refresh: fetchFiles };
}
