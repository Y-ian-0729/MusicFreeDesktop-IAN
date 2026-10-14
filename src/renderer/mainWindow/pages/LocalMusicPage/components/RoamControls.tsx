/**
 * RoamControls — 本地音乐漫游控件
 *
 * 页头按钮：开始 / 停止漫游。
 * 漫游激活时展开熟悉度滑块（0 偏新鲜 ~ 100 偏常听），调整后立即生效。
 *
 * 漫游复用 RepeatMode.Roam，因此与播放条、托盘的模式切换按钮状态天然一致。
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai/react';
import { Compass } from 'lucide-react';
import { RepeatMode } from '@common/constant';
import trackPlayer from '@renderer/mainWindow/core/trackPlayer';
import { useRepeatMode } from '@renderer/mainWindow/core/trackPlayer/hooks';
import { registerRoamPool, resetRoamSession } from '@renderer/mainWindow/core/roam';
import { useConfigValue } from '@renderer/common/hooks/useConfigValue';
import { Button } from '../../../components/ui/Button';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { filteredLocalMusicAtom } from '../store';

export function RoamControls() {
    const { t } = useTranslation();
    const repeatMode = useRepeatMode();
    const isRoaming = repeatMode === RepeatMode.Roam;

    const localMusic = useAtomValue(filteredLocalMusicAtom);
    const [familiarity, setFamiliarity] = useConfigValue('localMusic.roamFamiliarity');

    /** 开始漫游：以当前过滤后的本地曲库作为候选池，并随机挑一首开始 */
    const startRoam = useCallback(() => {
        if (localMusic.length === 0) return;

        // 注册候选池（补全 folder 信息）并重置会话环
        registerRoamPool(localMusic);
        resetRoamSession();

        // 第一首也随机：若固定从 index 0 开始，每次开启漫游都播同一首，失去漫游意义
        const startItem = localMusic[Math.floor(Math.random() * localMusic.length)];

        trackPlayer.setRepeatMode(RepeatMode.Roam);
        trackPlayer.playMusicWithReplaceQueue(localMusic, { startItem });
    }, [localMusic]);

    /** 停止漫游：退回列表循环，但保留当前播放 */
    const stopRoam = useCallback(() => {
        trackPlayer.setRepeatMode(RepeatMode.Queue);
    }, []);

    const handleToggle = useCallback(() => {
        if (isRoaming) {
            stopRoam();
        } else {
            startRoam();
        }
    }, [isRoaming, startRoam, stopRoam]);

    const handleFamiliarityChange = useCallback(
        (value: number) => {
            setFamiliarity(value);
        },
        [setFamiliarity],
    );

    const currentFamiliarity = familiarity ?? 50;

    return (
        <div className="p-local-music__roam">
            <Button
                variant={isRoaming ? 'primary' : 'secondary'}
                size="md"
                icon={<Compass size={16} />}
                onClick={handleToggle}
                disabled={localMusic.length === 0}
            >
                {isRoaming ? t('local_music.stop_roam') : t('local_music.roam')}
            </Button>

            {isRoaming && (
                <div className="p-local-music__roam-panel">
                    <span className="p-local-music__roam-label">
                        {t('local_music.roam_familiarity')}
                    </span>
                    <span className="p-local-music__roam-hint">{t('local_music.roam_fresh')}</span>
                    <ProgressBar
                        className="p-local-music__roam-slider"
                        value={currentFamiliarity}
                        variant="slim"
                        interactive
                        onChange={handleFamiliarityChange}
                        onDragEnd={handleFamiliarityChange}
                        title={t('local_music.roam_familiarity_hint')}
                    />
                    <span className="p-local-music__roam-hint">
                        {t('local_music.roam_familiar')}
                    </span>
                    <span className="p-local-music__roam-value">
                        {Math.round(currentFamiliarity)}
                    </span>
                </div>
            )}
        </div>
    );
}

export default RoamControls;
