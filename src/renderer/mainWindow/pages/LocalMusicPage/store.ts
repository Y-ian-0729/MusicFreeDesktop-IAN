/**
 * LocalMusicPage Store — jotai 全局状态
 *
 * 数据源：通过异步 IPC 获取全量 IMusicItem[]（含 folder 字段）。
 * 聚合/过滤全部在渲染进程侧通过 atom 派生同步完成。
 *
 * 首次进入页面时加载，之后 libraryChanged 自动刷新（防抖 200ms）。
 * 数据常驻内存，再次进入页面秒开。
 */

import { atom, getDefaultStore } from 'jotai';
import localMusic from '@infra/localMusic/renderer';
import appConfig from '@infra/appConfig/renderer';
import debounce from '@common/debounce';
import {
    artistKeys,
    primaryArtist,
    normalizeArtistKey,
    pickDisplayName,
} from '@common/artistUtils';

const store = getDefaultStore();

// ─── 类型 ───

/** IMusicItem + folder（由主进程 toMusicItem 附加） */
export type LocalMusicItem = IMusic.IMusicItem & { folder: string };

export interface ArtistAggregation {
    artist: string;
    count: number;
}

export interface AlbumAggregation {
    album: string;
    artist: string;
    count: number;
}

export interface FolderAggregation {
    folder: string;
    count: number;
}

// ─── 源数据 Atom ───

/** 全量本地音乐 */
const allLocalMusicAtom = atom<LocalMusicItem[]>([]);

/** 是否正在加载（仅首次） */
export const localMusicLoadingAtom = atom(true);

/** 是否正在扫描本地音乐 */
export const scanningAtom = atom(false);

/** 最短时长过滤阈值（秒），0 = 不过滤 */
export const minDurationSecAtom = atom(0);

/**
 * 是否拆分多歌手标签。
 * true（默认）：「周杰伦/费玉清」计入「周杰伦」与「费玉清」两位歌手。
 * false：退回按原始标签整串分组（旧行为），供误拆时关闭。
 */
export const splitMultiArtistAtom = atom(true);

// ─── 派生 Atom ───

/** 过滤后的本地音乐（按 minDurationSec 过滤短音频） */
export const filteredLocalMusicAtom = atom<LocalMusicItem[]>((get) => {
    const songs = get(allLocalMusicAtom);
    const minDuration = get(minDurationSecAtom);
    if (minDuration <= 0) return songs;
    return songs.filter((s) => s.duration == null || s.duration >= minDuration);
});

/**
 * 取一首歌用于歌手归类的键数组。
 *
 * 拆分开关关闭时退化为原始标签整串，保证与「是否拆分」配置一致。
 * 导出供 ArtistsTab 复用，避免聚合与筛选口径漂移。
 */
export function artistKeysOf(item: LocalMusicItem, split: boolean): string[] {
    if (!split) {
        const raw = (item.artist ?? '').trim();
        return raw ? [raw] : [''];
    }
    return artistKeys(item.artist);
}

/**
 * 判断一首歌是否属于某个歌手条目。
 *
 * 必须用归一化键比较：歌手条目展示的是「出现最多的写法」（如 LiSA），
 * 而该歌的标签可能是另一种写法（如 LISA），直接比字符串会漏掉。
 */
export function songBelongsToArtist(
    item: LocalMusicItem,
    artistDisplayName: string,
    split: boolean,
): boolean {
    const target = normalizeArtistKey(artistDisplayName);
    return artistKeysOf(item, split).some((k) => normalizeArtistKey(k) === target);
}

/**
 * 取一首歌用于专辑归类的歌手键（首位歌手）。
 *
 * 与 {@link artistKeysOf} 同理：拆分关闭时退化为原始标签整串。
 * 导出供 AlbumsTab 复用，保证与 albumListAtom 口径一致。
 */
export function albumArtistOf(item: LocalMusicItem, split: boolean): string {
    if (!split) return (item.artist ?? '').trim();
    return primaryArtist(item.artist);
}

/** 歌手聚合列表 */
export const artistListAtom = atom<ArtistAggregation[]>((get) => {
    const songs = get(filteredLocalMusicAtom);
    const split = get(splitMultiArtistAtom);

    // 按归一化键（小写 + 折叠空白）分组，把 LISA / LiSA、MIRROR / Mirror
    // 这类同一位歌手的多种写法合并为一个条目；展示名取出现最多的写法。
    const groups = new Map<string, Map<string, number>>();
    for (const s of songs) {
        for (const key of artistKeysOf(s, split)) {
            const norm = normalizeArtistKey(key);
            const variants = groups.get(norm);
            if (variants) {
                variants.set(key, (variants.get(key) ?? 0) + 1);
            } else {
                groups.set(norm, new Map([[key, 1]]));
            }
        }
    }

    return Array.from(groups.values())
        .map((variants) => {
            const entries = Array.from(variants, ([name, count]) => ({ name, count }));
            return {
                artist: pickDisplayName(entries),
                count: entries.reduce((sum, e) => sum + e.count, 0),
            };
        })
        .sort((a, b) => a.artist.localeCompare(b.artist));
});

/** 专辑聚合列表（按「专辑名 + 首位歌手」成组，避免协作曲目拆散专辑） */
export const albumListAtom = atom<AlbumAggregation[]>((get) => {
    const songs = get(filteredLocalMusicAtom);
    const split = get(splitMultiArtistAtom);
    const map = new Map<string, AlbumAggregation>();
    for (const s of songs) {
        const artist = albumArtistOf(s, split);
        const key = `${s.album ?? ''}||${artist}`;
        const existing = map.get(key);
        if (existing) {
            existing.count++;
        } else {
            map.set(key, { album: s.album ?? '', artist, count: 1 });
        }
    }
    return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album));
});

/** 文件夹聚合列表 */
export const folderListAtom = atom<FolderAggregation[]>((get) => {
    const songs = get(filteredLocalMusicAtom);
    const map = new Map<string, number>();
    for (const s of songs) {
        map.set(s.folder, (map.get(s.folder) ?? 0) + 1);
    }
    return Array.from(map, ([folder, count]) => ({ folder, count })).sort((a, b) =>
        a.folder.localeCompare(b.folder),
    );
});

/** 总歌曲数 */
export const totalCountAtom = atom((get) => get(filteredLocalMusicAtom).length);

// ─── 初始化 ───

let initialized = false;
let loadGeneration = 0;

async function loadAllMusicItems() {
    const gen = ++loadGeneration;
    try {
        const items = (await localMusic.getAllMusicItems()) as LocalMusicItem[];
        if (gen !== loadGeneration) return;
        store.set(allLocalMusicAtom, items);
    } catch (e) {
        if (gen !== loadGeneration) return;
        console.error('[LocalMusicPage] load all music items error:', e);
    } finally {
        if (gen === loadGeneration) {
            store.set(localMusicLoadingAtom, false);
        }
    }
}

const debouncedLoad = debounce(loadAllMusicItems, 200);

/**
 * 确保本地音乐数据已加载。
 * 首次调用时异步拉取全量并注册 libraryChanged 监听。
 * 多次调用安全（幂等）。注册的监听为永久性全局监听，无需清理。
 */
export function ensureLocalMusicStore() {
    if (initialized) return;
    initialized = true;

    // 初始化 minDurationSec
    store.set(minDurationSecAtom, appConfig.getConfigByKey('localMusic.minDurationSec') ?? 0);

    // 初始化 splitMultiArtist
    store.set(
        splitMultiArtistAtom,
        appConfig.getConfigByKey('localMusic.splitMultiArtist') ?? true,
    );

    // 监听配置变化，同步本地音乐相关配置
    appConfig.onConfigUpdated((patch) => {
        if ('localMusic.minDurationSec' in patch) {
            store.set(minDurationSecAtom, patch['localMusic.minDurationSec'] ?? 0);
        }
        if ('localMusic.splitMultiArtist' in patch) {
            store.set(splitMultiArtistAtom, patch['localMusic.splitMultiArtist'] ?? true);
        }
    });

    loadAllMusicItems();

    localMusic.onLibraryChanged(() => {
        debouncedLoad();
    });

    localMusic.onScanProgress((p) => {
        store.set(scanningAtom, p.phase !== 'done');
    });
}
