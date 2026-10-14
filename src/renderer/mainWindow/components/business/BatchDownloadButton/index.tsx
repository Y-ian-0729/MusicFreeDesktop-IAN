/**
 * BatchDownloadButton — 批量下载入口（工具栏版）
 *
 * 放在 SongToolbar 中「播放全部」右侧，与各列表页的播放操作并列。
 * 未选中歌曲时禁用；选中后点击打开 BatchDownloadModal 统一选择音质。
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@renderer/mainWindow/components/ui/Button';
import { showModal } from '@renderer/mainWindow/components/ui/Modal/modalManager';

export interface BatchDownloadButtonProps {
    /** 当前选中的歌曲 */
    selectedItems: IMusic.IMusicItem[];
    /** 下载提交后清空选中项 */
    onDone?: () => void;
}

export function BatchDownloadButton({ selectedItems, onDone }: BatchDownloadButtonProps) {
    const { t } = useTranslation();
    const count = selectedItems.length;

    const handleClick = useCallback(() => {
        if (count === 0) return;
        showModal('BatchDownloadModal', {
            musicItems: selectedItems,
            onDone,
        });
    }, [selectedItems, count, onDone]);

    return (
        <Button
            variant="secondary"
            size="md"
            icon={<Download size={16} />}
            disabled={count === 0}
            onClick={handleClick}
        >
            {count > 0
                ? `${t('download.download_selected')} (${count})`
                : t('download.download_selected')}
        </Button>
    );
}

export default BatchDownloadButton;
