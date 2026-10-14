/**
 * roamStats — 漫游播放统计（持久化）
 *
 * 记录每首歌的累计播放次数与最近播放时间，供 roamEngine 计算熟悉度。
 *
 * 存储选型：IndexedDB（asyncKV），与 recentlyPlayed 同模式。
 * 不写入 mediaMeta，因为：
 * - mediaMeta 每次写入都要走 IPC → SQLite，而漫游统计是渲染进程的局部关注点；
 * - 避免改动 DB schema 与 IMediaMeta 类型，把风险限制在渲染进程内。
 *
 * 写入策略：内存为准、防抖落盘，避免高频切歌时反复写 IndexedDB。
 */
import { asyncKV } from '@renderer/common/kvStore';
import logger from '@infra/logger/renderer';
import type { IRoamStat } from './roamEngine';

/** 落盘防抖延迟（ms） */
const PERSIST_DEBOUNCE_MS = 2000;

/** 统计条目上限，超出按 lastAt 淘汰最旧的，防止无限增长 */
const MAX_ENTRIES = 2000;

type RoamStatsMap = Map<string, IRoamStat>;

let stats: RoamStatsMap = new Map();
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** 自守护加载：首次访问时从 IndexedDB 拉取，失败可重试 */
function ensureLoaded(): Promise<void> {
    if (!loadPromise) {
        loadPromise = asyncKV
            .get('roamStats')
            .then((raw) => {
                if (raw && typeof raw === 'object') {
                    stats = new Map(Object.entries(raw));
                }
            })
            .catch((e) => {
                // 重置以便下次重试；统计缺失只影响推荐倾向，不影响播放
                loadPromise = null;
                logger.warn('[roamStats] Failed to load from IndexedDB', e);
            });
    }
    return loadPromise;
}

/** 按 lastAt 淘汰最旧条目，使总量不超过 MAX_ENTRIES */
function pruneIfNeeded(): void {
    if (stats.size <= MAX_ENTRIES) return;

    const entries = Array.from(stats.entries()).sort((a, b) => a[1].lastAt - b[1].lastAt);
    const removeCount = stats.size - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i++) {
        stats.delete(entries[i][0]);
    }
}

function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        const plain: Record<string, IRoamStat> = {};
        for (const [key, value] of stats) {
            plain[key] = value;
        }
        asyncKV.set('roamStats', plain).catch((e) => {
            logger.warn('[roamStats] Failed to persist', e);
        });
    }, PERSIST_DEBOUNCE_MS);
}

/**
 * 记录一次播放。
 *
 * @param key compositeKey(platform, id)
 */
export function recordPlay(key: string): void {
    if (!key) return;

    void ensureLoaded().then(() => {
        const prev = stats.get(key);
        stats.set(key, {
            count: (prev?.count ?? 0) + 1,
            lastAt: Date.now(),
        });
        pruneIfNeeded();
        schedulePersist();
    });
}

/** 获取当前统计快照（同步读取内存，供评分使用） */
export function getStats(): ReadonlyMap<string, IRoamStat> {
    return stats;
}

/** 确保统计已从磁盘加载（供首次漫游前调用） */
export function ensureRoamStatsLoaded(): Promise<void> {
    return ensureLoaded();
}

/** 清空全部漫游统计（用户重置偏好时使用） */
export async function clearRoamStats(): Promise<void> {
    stats = new Map();
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }
    try {
        await asyncKV.remove('roamStats');
    } catch (e) {
        logger.warn('[roamStats] Failed to clear', e);
    }
}
