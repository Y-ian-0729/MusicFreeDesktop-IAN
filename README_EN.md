<div align="center">

# 🎵 MusicFree Desktop · Plus

**A plugin-based, customizable, ad-free music player**

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0--beta.4-orange)](./package.json)

English | **[简体中文](./README.md)**

</div>

---

> [!IMPORTANT]
> **This repository is a derivative of [maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop)** (`dev` branch, `1.0.0-beta.4`), released under **AGPL-3.0-only** with original copyright notices and license preserved in full. The modifications are described in "What this Plus version adds" below and in [CHANGELOG.md](./CHANGELOG.md).

### Acknowledgements

This project is derived from [maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop). **Thanks to the original author maotoumao and everyone who has contributed to MusicFree** — this work stands on their shoulders.

---

## ✨ What this Plus version adds

Each change below came from using the app and thinking "it would be nice if it worked like this". See [CHANGELOG.md](./CHANGELOG.md) for the full record.

1. **🌊 "Roam" mode for local music** — added as a fourth playback mode (queue → shuffle → loop → roam), picking the next track dynamically by "familiarity" plus similarity (same artist / album / folder), with an adjustable familiarity slider and a random first track
2. **🎤 Artist classification improvements** — tags like `Artist A/Artist B` and `A feat. B` are recognized as separate artists; case variants such as `LISA` / `LiSA` and `MIRROR` / `Mirror` merge into one artist
3. **🎼 Desktop lyric enhancements** — a translation line below the main lyric, with the toolbar moved to an overlay so it no longer pushes lyrics down. Supports both separate `-tr.lrc` files and the multi-line-same-timestamp inline bilingual format
4. **⬇️ Batch download with unified quality** — a "Download Selected" button next to "Play All" on every list page, paired with new visible checkboxes (select-all in the header plus a per-row checkbox) and a single quality choice for all selected songs, including "Highest / Lowest Available"
5. **🪟 Window controls in the fullscreen player** — minimize / maximize / close
6. **🔧 Build fixes** — packaging failures under pnpm 11 caused by a degraded dependency tree and uncompiled native modules

---

## 📥 Usage

> [!NOTE]
> **Regular users do not need Node.js or pnpm** — both are only required to build from source.

### Download and run (Windows)

Head to [Releases](../../releases) for the latest build. Extract and run `MusicFree.exe`:

- **Portable (ZIP)**: extract and run — no installation, no admin rights; data lives in `%APPDATA%\MusicFree`, separate from the program directory, so deleting the folder uninstalls it
- The SHA256 is included in each release notes for verification

> [!IMPORTANT]
> This project **bundles no music source plugins** — sources must be imported through "Plugin Management" before online search and playback work. See [MusicFreePlugins](https://github.com/maotoumao/MusicFreePlugins).

### Building from source

| Dependency | Version |
| :--------: | :-----: |
|  Node.js   |  >= 18  |
|    pnpm    | latest  |

```bash
# Clone the repository
git clone https://github.com/Y-ian-0729/MusicFreeDesktop-IAN.git
cd MusicFreeDesktop-IAN

# Install (first run downloads Electron and compiles native modules; can take a while)
pnpm install

# Start the app
pnpm start

# Build installers
pnpm run make
```

> **Slow downloads?** Electron's binary is fetched from GitHub by default. You can set a mirror first:
>
> ```powershell
> # Windows PowerShell
> $env:ELECTRON_MIRROR = "https://registry.npmmirror.com/-/binary/electron/"
> pnpm install
> ```

#### Common commands

|      Command      | Description          |
| :---------------: | -------------------- |
|   `pnpm start`    | Start the app        |
|  `pnpm run dev`   | Development mode     |
|  `pnpm run make`  | Build installers     |
|  `pnpm run lint`  | Lint the code        |
| `pnpm run format` | Format the code      |

---

## 📦 Scope of changes

To make review and future upstream rebases easier, new code is concentrated in a few self-contained modules:

| Module | Path | Responsibility |
| --- | --- | --- |
| Artist tag parsing | `src/common/artistUtils.ts` | Pure functions: split, normalize, pick display name |
| Roam engine | `src/renderer/mainWindow/core/roam/` | Pure scoring + session ring + play-stat persistence |
| Batch download button | `.../business/BatchDownloadButton/` | Toolbar entry point |
| Batch download modal | `.../business/modals/BatchDownloadModal/` | Quality selection and chunked submission |
| Selection checkboxes | `.../business/SongTable/` | Header select-all + per-row checkbox |

**Database change**: a `quality_fallback` column was added to `download_tasks` (schema v5 → v6) to persist the batch-download quality fallback direction. **Upgrades migrate automatically and do not affect existing data.**

---

## ⚠️ Known limitations

- Local music metadata only parses **title / artist / album / duration / folder** — there is **no genre, BPM or year**. Roam's similarity is therefore limited to artist, album and folder; **roaming by genre is not possible.**
- Roam's "familiarity" comes from local play counts, so it is **empty on first use** and needs some listening time before preferences show.
- Batch download depends on what the source plugin actually returns; **if no quality is available for a song, that track is skipped.**

---

## 🤝 Contributing

Issues and PRs are welcome. Please read the [Contributing Guide](./CONTRIBUTING.md) first.

---

## 📄 License

Released under **[AGPL-3.0-only](./LICENSE)**, consistent with upstream.

- Original copyright notices, author attribution and the `LICENSE` file are preserved in full, with no deletions
- All modifications are recorded in [CHANGELOG.md](./CHANGELOG.md) and [NOTICE.md](./NOTICE.md)
- Per AGPL-3.0 section 5(a), modified source files are explicitly marked in the commit history

---

## 🙏 Acknowledgements

This project is derived from [maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop). Thanks to the original author maotoumao and everyone who has contributed to MusicFree.

- [maotoumao/MusicFree](https://github.com/maotoumao/MusicFree) — the Android app and plugin protocol
- [MusicFreePlugins](https://github.com/maotoumao/MusicFreePlugins) · [MusicFreeThemePacks](https://github.com/maotoumao/MusicFreeThemePacks)
