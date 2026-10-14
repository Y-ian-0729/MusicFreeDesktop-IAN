/**
 * BatchDownloadModal — 批量下载弹窗
 *
 * 用户在歌曲列表中多选后，通过此弹窗统一选择音质并批量加入下载队列。
 *
 * 音质选项除四个等级外，额外提供两个语义化选项：
 * - 「全部最高音质」= 请求 super + 向低回退 → 每首歌取实际可用的最高等级
 * - 「全部最低音质」= 请求 low  + 向高回退 → 每首歌取实际可用的最低等级
 *
 * 这两个选项依赖 downloadManager 任务级的 qualityFallbackOrder，
 * 该值会随任务持久化，重启后 resume/retry 仍保持相同意图。
 */
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '@renderer/mainWindow/components/ui/Modal';
import { Button } from '@renderer/mainWindow/components/ui/Button';
import { RadioGroup } from '@renderer/mainWindow/components/ui/RadioGroup';
import { showToast } from '@renderer/mainWindow/components/ui/Toast';
import { LOCAL_PLUGIN_NAME } from '@common/constant';
import downloadManager from '@infra/downloadManager/renderer';
import type { QualityFallbackOrder } from '@appTypes/infra/downloadManager';
import './index.scss';

/** 单次 IPC 的歌曲数量上限，避免一次提交过多任务 */
const BATCH_CHUNK_SIZE = 100;

/** 超过此数量时二次确认 */
const LARGE_BATCH_THRESHOLD = 200;

/** 音质选项键：四个等级 + 两个语义化极值 */
type QualityChoice = 'low' | 'standard' | 'high' | 'super' | 'highest' | 'lowest';

/** 每个选项解析为「请求音质 + 回退方向」 */
function resolveQualityChoice(choice: QualityChoice): {
    quality: IMusic.IQualityKey;
    fallback?: QualityFallbackOrder;
} {
    switch (choice) {
        case 'highest':
            return { quality: 'super', fallback: 'lower' };
        case 'lowest':
            return { quality: 'low', fallback: 'higher' };
        default:
            return { quality: choice };
    }
}

export interface BatchDownloadModalProps {
    close: () => void;
    /** 用户在列表中选中的歌曲 */
    musicItems: IMusic.IMusicItem[];
    /** 完成后的回调（用于清空选择） */
    onDone?: () => void;
}

export default function BatchDownloadModal({ close, musicItems, onDone }: BatchDownloadModalProps) {
    const { t } = useTranslation();
    const [choice, setChoice] = useState<QualityChoice>('standard');
    const [loading, setLoading] = useState(false);
    const [largeConfirmed, setLargeConfirmed] = useState(false);

    /**
     * 过滤掉不可下载的曲目：
     * - 本地歌曲（已在本地，无需下载）
     * - 已下载或已在下载队列中的曲目
     */
    const eligibleItems = useMemo(
        () =>
            musicItems.filter(
                (item) =>
                    item.platform !== LOCAL_PLUGIN_NAME &&
                    downloadManager.isDownloaded(item) === null &&
                    downloadManager.getActiveTaskStatus(
                        `${item.platform}\u0000${String(item.id)}`,
                    ) === null,
            ),
        [musicItems],
    );

    const skippedCount = musicItems.length - eligibleItems.length;
    const needsLargeConfirm = eligibleItems.length > LARGE_BATCH_THRESHOLD && !largeConfirmed;

    const options = useMemo(
        () => [
            { value: 'lowest', label: t('download.batch_quality_lowest') },
            { value: 'low', label: t('quality.low') },
            { value: 'standard', label: t('quality.standard') },
            { value: 'high', label: t('quality.high') },
            { value: 'super', label: t('quality.super') },
            { value: 'highest', label: t('download.batch_quality_highest') },
        ],
        [t],
    );

    const handleConfirm = useCallback(async () => {
        if (eligibleItems.length === 0) {
            close();
            return;
        }
        if (needsLargeConfirm) {
            setLargeConfirmed(true);
            return;
        }

        setLoading(true);
        const { quality, fallback } = resolveQualityChoice(choice);

        let success = 0;
        try {
            // 分片提交，避免一次性 IPC 携带过多数据
            for (let i = 0; i < eligibleItems.length; i += BATCH_CHUNK_SIZE) {
                const chunk = eligibleItems.slice(i, i + BATCH_CHUNK_SIZE);
                const created = await downloadManager.addTasksBatch({
                    musicItems: chunk,
                    quality,
                    qualityFallbackOrder: fallback,
                });
                success += created.length;
            }

            showToast(
                t('download.batch_summary', {
                    success,
                    skipped: skippedCount,
                }),
            );
            onDone?.();
            close();
        } catch (e) {
            console.error('[BatchDownloadModal] batch download failed:', e);
            showToast(t('download.cannot_get_source'), { type: 'warn' });
        } finally {
            setLoading(false);
        }
    }, [eligibleItems, choice, close, onDone, skippedCount, t, needsLargeConfirm]);

    return (
        <Modal
            open
            onClose={close}
            title={t('download.batch_title')}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={close} disabled={loading}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleConfirm}
                        loading={loading}
                        disabled={eligibleItems.length === 0}
                    >
                        {needsLargeConfirm ? t('common.confirm') : t('download.batch_confirm')}
                    </Button>
                </>
            }
        >
            <div className="b-batch-download">
                <p className="b-batch-download__count">
                    {t('download.batch_selected_count', { count: eligibleItems.length })}
                </p>

                {skippedCount > 0 && (
                    <p className="b-batch-download__skipped">
                        {t('download.batch_skip_downloaded', { count: skippedCount })}
                    </p>
                )}

                {eligibleItems.length === 0 ? (
                    <p className="b-batch-download__empty">{t('download.batch_none_eligible')}</p>
                ) : needsLargeConfirm ? (
                    <p className="b-batch-download__empty">
                        {t('download.batch_large_confirm', { count: eligibleItems.length })}
                    </p>
                ) : (
                    <>
                        <p className="b-batch-download__label">
                            {t('download.batch_quality_label')}
                        </p>
                        <RadioGroup
                            value={choice}
                            options={options}
                            onChange={(val) => setChoice(val as QualityChoice)}
                        />
                    </>
                )}
            </div>
        </Modal>
    );
}
