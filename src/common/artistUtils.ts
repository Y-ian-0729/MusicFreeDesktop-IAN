/**
 * artistUtils — 歌手标签解析工具（纯函数，无副作用）
 *
 * 本地音乐库中，多歌手协作曲目的 artist 标签写法高度不一致：
 *   "周杰伦/费玉清"、"周杰伦 & 阿信"、"A feat. B"、"A、B"
 * 若直接以原始标签作为歌手唯一键，同一歌手会被拆成多个条目，
 * 出现「歌手列表里同一人出现多次、每个条目只有一两首歌」的混乱现象。
 *
 * 本模块把原始标签规范化为「歌手名数组」，供聚合与筛选共用，
 * 保证两侧口径一致（否则会出现「列表里有该歌手、点进去却没有歌」）。
 */

/** 超过此长度的标签视为异常数据，不再尝试拆分 */
const MAX_SPLIT_LENGTH = 200;

/** 全角分隔符 → 半角，统一后续处理 */
const FULLWIDTH_MAP: ReadonlyArray<[RegExp, string]> = [
    [/／/g, '/'],
    [/；/g, ';'],
    [/，/g, ','],
    [/＆/g, '&'],
    [/＋/g, '+'],
];

/**
 * 协作标记（feat. / ft. / featuring）→ 哨兵字符。
 * 这些标记语义明确，总是拆分。
 *
 * 注意：有意不处理裸 "with" —— "Sleeping With Sirens" 这类乐队名会被误拆。
 */
const FEAT_RE = /\s+(?:feat\.?|ft\.?|featuring)\s+/gi;
const FEAT_SENTINEL = '\u0001';

/** 一级分隔符：总是拆分 */
const PRIMARY_SPLIT_RE = new RegExp(`[${FEAT_SENTINEL}、；;]`);

/** 二级分隔符：仅当整体不在白名单时才拆分 */
const SECONDARY_SPLIT_RE = /[/&,+]/;

/**
 * 不拆分白名单（小写精确匹配）。
 * 这些名称本身包含二级分隔符，误拆会破坏既有歌手归类。
 */
export const NO_SPLIT_ARTIST_NAMES: ReadonlySet<string> = new Set([
    'ac/dc',
    'simon & garfunkel',
    'earth, wind & fire',
    'florence + the machine',
    'hall & oates',
    'daryl hall & john oates',
    'crosby, stills & nash',
    'crosby, stills, nash & young',
    'the mamas & the papas',
    'emerson, lake & palmer',
    'peter, paul & mary',
    'mumford & sons',
    'echo & the bunnymen',
    'sam & dave',
    'ike & tina turner',
    'martha & the vandellas',
    'kool & the gang',
    'sly & the family stone',
    'brooks & dunn',
    "booker t. & the m.g.'s",
]);

function normalizeSeparators(raw: string): string {
    let out = raw;
    for (const [pattern, replacement] of FULLWIDTH_MAP) {
        out = out.replace(pattern, replacement);
    }
    return out;
}

function isNoSplitName(name: string): boolean {
    return NO_SPLIT_ARTIST_NAMES.has(name.trim().toLowerCase());
}

function dedupeCaseInsensitive(names: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

/**
 * 把原始 artist 标签拆分为歌手名数组。
 *
 * 规则：
 * - `、` `；` `;` 与 feat./ft./featuring 标记：总是拆分
 * - `/` `&` `,` `+`：仅当该段不在 {@link NO_SPLIT_ARTIST_NAMES} 白名单时拆分
 * - 空标签返回空数组；超长标签原样返回
 * - 结果做大小写不敏感去重，保留首次出现的大小写
 *
 * @example
 * splitArtists('周杰伦/费玉清')       // ['周杰伦', '费玉清']
 * splitArtists('A feat. B')          // ['A', 'B']
 * splitArtists('AC/DC')              // ['AC/DC']
 * splitArtists('')                   // []
 */
export function splitArtists(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.length > MAX_SPLIT_LENGTH) return [trimmed];

    const normalized = normalizeSeparators(trimmed).replace(FEAT_RE, FEAT_SENTINEL);

    const result: string[] = [];
    for (const primaryPart of normalized.split(PRIMARY_SPLIT_RE)) {
        const part = primaryPart.trim();
        if (!part) continue;

        if (isNoSplitName(part)) {
            result.push(part);
            continue;
        }

        for (const sub of part.split(SECONDARY_SPLIT_RE)) {
            const name = sub.trim();
            if (name) result.push(name);
        }
    }

    return dedupeCaseInsensitive(result);
}

/**
 * 聚合/筛选统一入口：返回用于分组的歌手键数组。
 *
 * 与 {@link splitArtists} 的唯一区别：空标签归一为 `''`，
 * 使「无歌手信息」的曲目能稳定归入同一个分组（UI 侧渲染为「未知歌手」）。
 */
export function artistKeys(raw: string | null | undefined): string[] {
    const names = splitArtists(raw);
    return names.length > 0 ? names : [''];
}

/**
 * 取首位歌手，用于专辑归类。
 *
 * 专辑按「专辑名 + 首位歌手」成组，避免同一张专辑因协作曲目的
 * 多歌手标签（如「A/B」与「A」）被拆成多个专辑条目。
 */
export function primaryArtist(raw: string | null | undefined): string {
    return artistKeys(raw)[0];
}

/**
 * 歌手归一分组键：把「同一歌手的不同大小写/空白写法」归到同一组。
 *
 * 本地音乐库中常见 `LISA` / `LiSA`、`MIRROR` / `Mirror` 这类差异，
 * 若直接以原串为键，同一位歌手会占据多个条目。
 *
 * 归一规则：折叠连续空白 + 转小写。仅用于分组，展示仍用原始写法。
 */
export function normalizeArtistKey(name: string): string {
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 在多个写法中选出用于展示的名称。
 *
 * 规则（按优先级）：
 * 1. 出现次数最多者
 * 2. 次数相同则优先「非全大写」写法（`LiSA` 优于 `LISA`）
 * 3. 仍相同则取字典序最小者，保证结果稳定可复现
 */
export function pickDisplayName(variants: ReadonlyArray<{ name: string; count: number }>): string {
    if (variants.length === 0) return '';
    return [...variants].sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const aAllCaps = a.name === a.name.toUpperCase() && a.name !== a.name.toLowerCase();
        const bAllCaps = b.name === b.name.toUpperCase() && b.name !== b.name.toLowerCase();
        if (aAllCaps !== bAllCaps) return aAllCaps ? 1 : -1;
        return a.name.localeCompare(b.name);
    })[0].name;
}
