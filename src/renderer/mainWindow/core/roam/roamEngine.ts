/**
 * roamEngine — 漫游取歌算法（纯函数，无副作用、无 IO）
 *
 * 与 Shuffle 的区别：
 * - Shuffle 一次性生成**固定**的随机序列，之后按序前进。
 * - Roam 每次按需**动态**计算下一首，因此可以结合播放统计与相似度，
 *   并保证「最近刚播过的不再立刻重播」。
 *
 * 评分由三项线性组合而成，各项均归一化到 [0,1]，便于单独断言：
 *   fam(c) 熟悉度 = min(1, count / FAMILY_FULL_COUNT)
 *   nov(c) 新鲜度 = 1 - fam(c)
 *   sim(c) 相似度 = 0.5*同歌手 + 0.3*同专辑 + 0.2*同目录
 *   score(c) = f*fam + (1-f)*nov + SIM_WEIGHT*sim    其中 f = familiarity/100
 *
 * 挑选使用**轮盘赌加权随机**（而非直接取最高分），保留探索性：
 * 分数高的更可能被选中，但并非必然，避免漫游变成死板的排序播放。
 */

/** 播放次数达到该值时，熟悉度记为满值 */
export const FAMILY_FULL_COUNT = 8;

/** 相似度项在总分中的权重 */
export const SIM_WEIGHT = 0.35;

/** 各相似度因子的权重（同歌手 / 同专辑 / 同目录） */
export const SIM_ARTIST_WEIGHT = 0.5;
export const SIM_ALBUM_WEIGHT = 0.3;
export const SIM_FOLDER_WEIGHT = 0.2;

/**
 * 兜底概率下限。
 * 即使 familiarity 取到极值 0 或 100，也保留少量相反倾向，
 * 避免「完全只播没听过的」或「永远只播同一批」导致体验僵化。
 */
export const EXPLORE_FLOOR = 0.05;

/** 漫游候选曲目（含相似度所需字段） */
export interface IRoamCandidate {
    /** compositeKey(platform, id) */
    key: string;
    artist: string;
    album: string;
    folder: string;
}

/** 单曲播放统计 */
export interface IRoamStat {
    /** 累计播放次数 */
    count: number;
    /** 最近一次播放时间戳（ms） */
    lastAt: number;
}

export interface IRoamContext {
    /** 当前正在播放的曲目（可为 null，例如刚开始漫游） */
    current: IRoamCandidate | null;
    /** 候选池（调用方应已排除最近播放环内的曲目） */
    candidates: IRoamCandidate[];
    /** 播放统计，缺失视为 count=0 */
    stats: ReadonlyMap<string, IRoamStat>;
    /** 熟悉度 0（偏新鲜）~ 100（偏常听） */
    familiarity: number;
}

/** 归一化熟悉度到 [0,1]，并施加兜底下限 */
export function resolveFamiliarityWeight(familiarity: number): number {
    const clamped = Math.min(100, Math.max(0, familiarity)) / 100;
    return EXPLORE_FLOOR + clamped * (1 - 2 * EXPLORE_FLOOR);
}

/** 熟悉度：0（从未播放）~ 1（播放次数达到 FAMILY_FULL_COUNT） */
export function familiarityOf(count: number): number {
    if (!(count > 0)) return 0;
    return Math.min(1, count / FAMILY_FULL_COUNT);
}

/** 相似度：与当前曲目的歌手/专辑/目录重合程度，0 ~ 1 */
export function similarityOf(current: IRoamCandidate | null, candidate: IRoamCandidate): number {
    if (!current) return 0;
    let score = 0;
    if (current.artist && candidate.artist && current.artist === candidate.artist) {
        score += SIM_ARTIST_WEIGHT;
    }
    if (current.album && candidate.album && current.album === candidate.album) {
        score += SIM_ALBUM_WEIGHT;
    }
    if (current.folder && candidate.folder && current.folder === candidate.folder) {
        score += SIM_FOLDER_WEIGHT;
    }
    return score;
}

/**
 * 计算单个候选的综合得分。
 * 分数越高越可能被选中，但不保证一定被选中。
 */
export function scoreCandidate(ctx: IRoamContext, candidate: IRoamCandidate): number {
    const f = resolveFamiliarityWeight(ctx.familiarity);
    const fam = familiarityOf(ctx.stats.get(candidate.key)?.count ?? 0);
    const nov = 1 - fam;
    const sim = similarityOf(ctx.current, candidate);
    return f * fam + (1 - f) * nov + SIM_WEIGHT * sim;
}

/**
 * 从候选池中挑选下一首。
 *
 * @returns 选中曲目的 key；候选池为空时返回 null
 */
export function pickRoamKey(ctx: IRoamContext): string | null {
    const { candidates } = ctx;
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].key;

    const weights = candidates.map((c) => Math.max(0, scoreCandidate(ctx, c)));
    const total = weights.reduce((sum, w) => sum + w, 0);

    // 全部权重为 0（理论上不会发生，因 sim/nov 非负且存在兜底）→ 均匀随机
    if (!(total > 0)) {
        return candidates[Math.floor(Math.random() * candidates.length)].key;
    }

    let cursor = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
        cursor -= weights[i];
        if (cursor <= 0) return candidates[i].key;
    }
    // 浮点误差兜底
    return candidates[candidates.length - 1].key;
}

/**
 * 从候选池中挑选下一首的索引。
 *
 * @returns 选中曲目在 `candidates` 中的下标；候选池为空时返回 -1
 */
export function pickRoamCandidateIndex(ctx: IRoamContext): number {
    const key = pickRoamKey(ctx);
    if (key === null) return -1;
    return ctx.candidates.findIndex((c) => c.key === key);
}
