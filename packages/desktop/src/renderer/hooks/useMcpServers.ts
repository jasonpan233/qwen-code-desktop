import { useState, useCallback, useEffect, useRef } from 'react';
import type { McpServerInfo } from '@preload/preload';

/** MCP 服务器列表 Hook - 定时轮询获取 MCP 服务器状态 */
export function useMcpServers() {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getMcpServers();
      setServers(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  /** 首次加载 + 定时轮询（每 60 秒） */
  useEffect(() => {
    void fetchServers();
    timerRef.current = setInterval(() => {
      void fetchServers();
    }, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchServers]);

  return { servers, loading, refresh: fetchServers };
}
