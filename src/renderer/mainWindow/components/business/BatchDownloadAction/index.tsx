/**
 * BatchDownloadAction — 批量下载入口（业务组件）
 *
 * 供各歌曲列表页放进 SongTable 的 `selectionToolbar` 插槽：
 * 显示选中数量并提供「下载选中」按钮，点击后打开 BatchDownloadModal 统一选择音质。
 *
 * 不在此处过滤已下载曲目——过滤逻辑放在 BatchDownloadModal 内，
 * 因为下载状态可能随时变化，弹窗打开时的判定更准确。
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@renderer/mainWindow/components/ui/Button';
import { showModal } from '@renderer/mainWindow/components/ui/Modal/modalManager';

export interface BatchDownloadActionProps {
    /** 当前选中的歌曲 */
    selectedItems: IMusic.IMusicItem[];
    /** 清空选中项（下载提交后调用） */
    clearSelection: () => void;
}

export function BatchDownloadAction({ selectedItems, clearSelection }: BatchDownloadActionProps) {
    const { t } = useTranslation();

    const handleClick = useCallback(() => {
        showModal('BatchDownloadModal', {
            musicItems: selectedItems,
            onDone: clearSelection,
        });
    }, [selectedItems, clearSelection]);

    if (selectedItems.length === 0) return null;

    return (
        <>
            <span className="song-table__selection-count">
                {t('download.batch_selected_count', { count: selectedItems.length })}
            </span>
            <Button variant="primary" size="sm" icon={<Download size={14} />} onClick={handleClick}>
                {t('download.download_selected')}
            </Button>
        </>
    );
}

export default BatchDownloadAction;
