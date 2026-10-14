const metaReg = /\[(.+):(.+)\]/g;

/**
 * 中日韩字符检测。
 *
 * 用于识别「同一时间戳多行」的内嵌双语歌词：原文多为拉丁字母，
 * 译文为中日韩文字。只依据语言差异判断，避免把同语言的多行误判为双语。
 */
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

type LyricMeta = Record<string, any>;

interface IOptions {
    musicItem?: IMusic.IMusicItem;
    translation?: string;
}

export interface IParsedLrcItem {
    /** 时间 s */
    time: number;
    /** 歌词 */
    lrc: string;
    /** 翻译 */
    translation?: string;
    /** 位置 */
    index: number;
}

export default class LyricParser {
    public hasTranslation = false;

    private _musicItem?: IMusic.IMusicItem;

    private meta: LyricMeta;
    private lrcItems: Array<IParsedLrcItem>;

    get musicItem() {
        return this._musicItem;
    }

    constructor(raw: string, options?: IOptions) {
        // init
        this._musicItem = options?.musicItem;
        let translation = options?.translation;
        if (!raw && translation) {
            raw = translation;
            translation = undefined;
        }

        const { lrcItems, meta } = this.parseLyricImpl(raw);
        this.meta = meta;
        this.lrcItems = lrcItems;

        if (translation) {
            const transLrcItems = this.parseLyricImpl(translation).lrcItems;

            if (transLrcItems.length > 0) {
                this.hasTranslation = true;

                // Two-pointer merge: both arrays are sorted by time
                let p2 = 0;
                for (let p1 = 0; p1 < this.lrcItems.length; ++p1) {
                    const lrcItem = this.lrcItems[p1];
                    while (p2 < transLrcItems.length - 1 && transLrcItems[p2].time < lrcItem.time) {
                        ++p2;
                    }
                    lrcItem.translation =
                        transLrcItems[p2].time === lrcItem.time ? transLrcItems[p2].lrc : '';
                }
            }
        }
    }

    /** Binary search: find the last lrcItem where time <= position, O(log n) */
    getPosition(position: number): IParsedLrcItem | null {
        position = position - (this.meta?.offset ?? 0);
        const items = this.lrcItems;

        if (!items.length || position < items[0].time) {
            return null;
        }

        let lo = 0;
        let hi = items.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (items[mid].time <= position) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return items[hi];
    }

    getLyricItems() {
        return this.lrcItems;
    }

    getMeta() {
        return this.meta;
    }

    toString(options?: { withTimestamp?: boolean; type?: 'raw' | 'translation' }) {
        const { type = 'raw', withTimestamp = true } = options || {};

        if (withTimestamp) {
            return this.lrcItems
                .map(
                    (item) =>
                        `${this.timeToLrctime(item.time)} ${
                            type === 'raw' ? item.lrc : item.translation
                        }`,
                )
                .join('\r\n');
        } else {
            return this.lrcItems
                .map((item) => (type === 'raw' ? item.lrc : item.translation))
                .join('\r\n');
        }
    }

    /** [xx:xx.xx] => x s */
    private parseTime(timeStr: string): number {
        let result = 0;
        const nums = timeStr.slice(1, timeStr.length - 1).split(':');
        for (let i = 0; i < nums.length; ++i) {
            result = result * 60 + +nums[i];
        }
        return result;
    }
    /** x s => [xx:xx.xx] */
    private timeToLrctime(sec: number) {
        const min = Math.floor(sec / 60);
        sec = sec - min * 60;
        const secInt = Math.floor(sec);
        const secFloat = sec - secInt;
        return `[${min.toFixed(0).padStart(2, '0')}:${secInt
            .toString()
            .padStart(2, '0')}.${secFloat.toFixed(2).slice(2)}]`;
    }

    private parseMetaImpl(metaStr: string) {
        if (metaStr === '') {
            return {};
        }
        const metaArr = metaStr.match(metaReg) ?? [];
        const meta: any = {};
        let k, v;
        for (const m of metaArr) {
            k = m.substring(1, m.indexOf(':'));
            v = m.substring(k.length + 2, m.length - 1);
            if (k === 'offset') {
                meta[k] = +v / 1000;
            } else {
                meta[k] = v;
            }
        }
        return meta;
    }

    private parseLyricImpl(raw: string) {
        raw = raw.trim();

        const timeRegLocal = /\[[\d:.]+\]/g;
        const rawLrcs = raw.split(timeRegLocal);
        const rawTimes = raw.match(timeRegLocal) ?? [];
        const len = rawTimes.length;

        const meta = this.parseMetaImpl(rawLrcs[0].trim());

        // Use cursor instead of shift() to avoid O(n²) array re-indexing
        let cursor = 1;
        const rawLrcItems: Array<IParsedLrcItem> = [];

        for (let i = 0; i < len; ++i) {
            let counter = 0;
            while (rawLrcs[cursor] === '') {
                ++counter;
                ++cursor;
            }
            const lrc = rawLrcs[cursor]?.trim() ?? '';
            for (let j = i; j < i + counter; ++j) {
                rawLrcItems.push({
                    time: this.parseTime(rawTimes[j]),
                    lrc,
                    index: 0,
                });
            }
            i += counter;
            if (i < len) {
                rawLrcItems.push({
                    time: this.parseTime(rawTimes[i]),
                    lrc,
                    index: 0,
                });
            }
            ++cursor;
        }

        // Sort by time, then reassign continuous indices
        rawLrcItems.sort((a, b) => a.time - b.time);

        // 内嵌双语识别：同一时间戳出现多行，且存在「有 CJK」与「无 CJK」两类文本时，
        // 视为双语歌词——按 LRC 惯例，该时间戳的**首行是原文**，其余行为译文。
        //
        // 采用「首行即原文」而非「英文即原文」的理由：中英双向都要正确。
        //   英文歌：[00:00.507] Number 4   ← 原文
        //           [00:00.507] 倒数第四    ← 译文
        //   中文歌：[00:01.00] 你好世界     ← 原文
        //           [00:01.00] Hello World ← 译文
        // 若按「非 CJK 即原文」判断，中文歌的主行会被错误地换成英文。
        //
        // 必须两类都存在才认定双语，避免同语言的多行（如一句歌词被拆成两行）
        // 被误判为原文+译文而丢失内容。
        //
        // 注意：此处尚未分配 index（全为 0），因此用对象标识判断是否为该时间戳的首行。
        const mergeInlineTranslation = (items: Array<IParsedLrcItem>) => {
            const firstOfTime = new Map<number, IParsedLrcItem>();
            const byTime = new Map<number, Array<IParsedLrcItem>>();
            for (const item of items) {
                if (!firstOfTime.has(item.time)) firstOfTime.set(item.time, item);
                const group = byTime.get(item.time);
                if (group) {
                    group.push(item);
                } else {
                    byTime.set(item.time, [item]);
                }
            }

            let detected = false;
            const result: Array<IParsedLrcItem> = [];

            for (const item of items) {
                // 非该时间戳首行：已在首行处一并消化
                if (firstOfTime.get(item.time) !== item) continue;

                const group = byTime.get(item.time)!;
                if (group.length < 2) {
                    result.push(item);
                    continue;
                }

                const hasCjk = group.some((g) => CJK_RE.test(g.lrc));
                const hasNonCjk = group.some((g) => !CJK_RE.test(g.lrc));

                if (!hasCjk || !hasNonCjk) {
                    result.push(...group);
                    continue;
                }

                detected = true;
                result.push({
                    ...item,
                    lrc: item.lrc,
                    translation: group
                        .slice(1)
                        .map((g) => g.lrc)
                        .join(' '),
                });
            }

            return { items: result, detected };
        };

        const merged = mergeInlineTranslation(rawLrcItems);
        let lrcItems = merged.items;
        if (merged.detected) {
            this.hasTranslation = true;
        }

        // 重新编号，保证 index 连续（播放定位依赖 index）
        for (let i = 0; i < lrcItems.length; ++i) {
            lrcItems[i].index = i;
        }

        if (lrcItems.length === 0 && raw.length) {
            lrcItems = raw.split('\n').map((line, index) => ({
                time: 0,
                lrc: line,
                index,
            }));
        }

        return {
            lrcItems,
            meta,
        };
    }
}
