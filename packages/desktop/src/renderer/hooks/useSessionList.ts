import { useCallback, useEffect } from 'react';
import { useInfiniteScroll } from 'ahooks';
import type { RefObject } from 'react';
import type { SessionListItem } from '@preload/preload';

const SESSION_PAGE_SIZE = 20;

interface InfiniteScrollData {
  list: SessionListItem[];
  nextCursor?: number;
  hasMore: boolean;
}

/** 会话列表 Hook - 使用 useInfiniteScroll 管理无限滚动加载 */
export function useSessionList(target: RefObject<HTMLElement | null>) {
  const fetchSessions = async (
    data?: InfiniteScrollData,
  ): Promise<InfiniteScrollData> => {
    const result = await window.electronAPI.listSessions({
      size: SESSION_PAGE_SIZE,
      cursor: data?.nextCursor,
    });
    return {
      list: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  };

  const { data, loading, loadingMore, noMore, reload, mutate } =
    useInfiniteScroll(fetchSessions, {
      target,
      isNoMore: (d) => d?.hasMore === false,
      threshold: 100,
    });

  /** 删除会话 - 通过 mutate 更新本地状态 */
  const removeSession = useCallback(
    async (sessionId: string) => {
      try {
        const removed = await window.electronAPI.removeSession(sessionId);
        if (removed) {
          mutate((prevData) => {
            if (!prevData) return prevData;
            return {
              ...prevData,
              list: prevData.list.filter((s) => s.sessionId !== sessionId),
            };
          });
        }
        return removed;
      } catch {
        return false;
      }
    },
    [mutate],
  );

  // 监听会话列表更新事件
  useEffect(() => {
    const cleanup = window.electronAPI.onStreamEvent((event: unknown) => {
      const streamEvent = event as { type: string; data: unknown };
      if (streamEvent.type === 'session-list-update') {
        reload();
      }
    });
    return cleanup;
  }, [reload]);

  return {
    sessions: data?.list ?? [],
    loading,
    loadingMore,
    noMore,
    refresh: reload,
    removeSession,
  };
}
