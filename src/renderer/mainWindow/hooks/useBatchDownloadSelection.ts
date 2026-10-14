import { useMemo, useCallback, type DependencyList } from 'react';
import { useSelection } from './useSelection';

/**
 * 列表页的「多选 + 批量下载」状态。
 *
 * 在 {@link useSelection} 基础上补两件事：
 * 1. 把选中的 id 集合解析回完整的歌曲对象（批量下载需要 platform/id/title 等字段）；
 * 2. 提供清空选择的方法（下载提交后调用）。
 *
 * 供各列表页把 BatchDownloadButton 放进 SongToolbar、与「播放全部」并列。
 */
export function useBatchDownloadSelection<T extends { id: string }>(
    data: T[],
    resetDeps: DependencyList,
) {
    const { selectedIds, setSelectedIds, selectionProps } = useSelection(resetDeps);

    const selectedItems = useMemo(
        () => data.filter((item) => selectedIds.has(String(item.id))),
        [data, selectedIds],
    );

    const clearSelection = useCallback(() => setSelectedIds(new Set()), [setSelectedIds]);

    return { selectedItems, clearSelection, selectionProps };
}
