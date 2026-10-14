/**
 * roamSession — 漫游会话
 *
 * 职责：
 * 1. 维护「本会话最近播放环」，避免漫游时刚播过的歌立刻重播。
 * 2. 缓存候选池的辅助信息（folder），因为播放队列会把曲目压缩为 slim
 *    格式并丢弃 folder 字段，而 folder 是本地音乐相似度的重要信号。
 * 3. 对外只暴露一个方法：resolveRoamNextIndex(queue, currentIndex, familiarity)。
 *
 * 与 PlayQueue 的关系：本模块**不修改**队列，只读取并返回一个下标，
 * 由 trackPlayer 决定如何播放。这样漫游不需要像 Shuffle 那样维护持久序列。
 */
import { compositeKey } from '@common/mediaKey';
import type { IMusicItemSlim } from '@appTypes/infra/musicSheet';
import { pickRoamCandidateIndex, type IRoamCandidate } from './roamEngine';
import { getStats, ensureRoamStatsLoaded } from './roamStats';

/** 环容量下限 / 上限 */
const RING_MIN = 3;
const RING_MAX = 20;

/** 本会话最近播放的 key（新→旧） */
let recentRing: string[] = [];

/** 候选池辅助信息：key → folder（本地音乐目录） */
let folderMap = new Map<string, string>();

/** 当前队列长度，用于计算自适应环容量 */
function ringCapacity(queueLength: number): number {
    // 队列很小时不能把候选排空：至少给队列留 1 首可选的
    const desired = Math.min(RING_MAX, Math.max(RING_MIN, Math.floor(queueLength * 0.1)));
    return Math.max(0, Math.min(desired, queueLength - 1));
}

function keyOf(item: IMusic.IMusicItem | IMusicItemSlim): string {
    return compositeKey(item.platform, item.id);
}

/** 把队列项适配为漫游候选（folder 取自注册的候选池信息） */
function toCandidate(item: IMusicItemSlim): IRoamCandidate {
    const key = keyOf(item);
    return {
        key,
        artist: item.artist ?? '',
        album: item.album ?? '',
        folder: folderMap.get(key) ?? '',
    };
}

/**
 * 注册漫游候选池。
 *
 * 在开始漫游时由调用方传入完整的本地音乐列表（含 folder 字段），
 * 用于补全播放队列中丢失的 folder 信息。
 * 同时重置会话环，避免上一轮漫游的排除集合影响新候选池。
 */
export function registerRoamPool(
    items: Array<IMusic.IMusicItem | (IMusicItemSlim & { folder?: string })>,
): void {
    folderMap = new Map();
    for (const item of items) {
        const folder = (item as { folder?: string }).folder;
        if (folder) {
            folderMap.set(keyOf(item), folder);
        }
    }
    recentRing = [];
}

/**
 * 解析漫游的下一首队列下标。
 *
 * @param queue        播放队列（slim 列表）
 * @param currentIndex 当前下标（-1 表示尚未播放）
 * @param familiarity  熟悉度 0~100
 * @returns 下一首的队列下标；队列为空时返回 -1
 */
export async function resolveRoamNextIndex(
    queue: IMusicItemSlim[],
    currentIndex: number,
    familiarity: number,
): Promise<number> {
    if (queue.length === 0) return -1;

    // 统计可能尚未从 IndexedDB 加载，首次漫游前确保就绪
    await ensureRoamStatsLoaded();

    const candidates = queue.map(toCandidate);

    const current =
        currentIndex >= 0 && currentIndex < candidates.length ? candidates[currentIndex] : null;
    const currentKey = current?.key ?? null;

    // 排除最近播放环内的曲目；若排除后为空，退化为「除当前曲目外任意一首」
    const ringSet = new Set(recentRing);
    let eligible = candidates.filter((c) => !ringSet.has(c.key));
    if (eligible.length === 0) {
        eligible = candidates.filter((c) => c.key !== currentKey);
    }
    if (eligible.length === 0) {
        // 队列只有一首歌
        return currentIndex >= 0 ? currentIndex : 0;
    }

    const pickedIndex = pickRoamCandidateIndex({
        current,
        candidates: eligible,
        stats: getStats(),
        familiarity,
    });
    if (pickedIndex < 0) return -1;

    const pickedKey = eligible[pickedIndex].key;
    return candidates.findIndex((c) => c.key === pickedKey);
}

/**
 * 记录一首歌已播放（推进最近播放环）。
 *
 * 由 trackPlayer 在成功切歌后调用。
 */
export function markRoamPlayed(queue: IMusicItemSlim[], index: number): void {
    if (index < 0 || index >= queue.length) return;
    const key = keyOf(queue[index]);

    recentRing = [key, ...recentRing.filter((k) => k !== key)].slice(
        0,
        Math.max(RING_MIN, ringCapacity(queue.length)),
    );
}

/**
 * 重置会话环。
 *
 * 队列整体被替换（如重新开始漫游、切换播放列表）时调用，
 * 避免旧的排除集合错误地压制新队列中的曲目。
 */
export function resetRoamSession(): void {
    recentRing = [];
}

/** 读取当前环内容（调试 / 测试用） */
export function getRoamRing(): readonly string[] {
    return recentRing;
}
