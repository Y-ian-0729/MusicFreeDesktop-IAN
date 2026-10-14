<div align="center">

# 🎵 MusicFree 桌面版 · 增强版

**插件化、定制化、无广告的免费音乐播放器**

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0--beta.4-orange)](./package.json)

**[English](./README_EN.md)** | 简体中文

</div>

---

> [!IMPORTANT]
> **本仓库是 [maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop) 的二次开发版本**（`dev` 分支，`1.0.0-beta.4`），以 **AGPL-3.0-only** 发布，原始版权声明与许可协议完整保留。所作的修改在下方「本增强版新增了什么」与 [CHANGELOG.md](./CHANGELOG.md) 中说明。

### 致谢

本项目基于 [maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop) 二次开发，**感谢原作者猫头猫与所有为 MusicFree 贡献过的开发者**——这是站在他们肩膀上的成果。

---

## ✨ 本增强版新增了什么

以下改动都是在日常使用中觉得「要是能这样就好了」而补上的，完整记录见 [CHANGELOG.md](./CHANGELOG.md)。

1. **🌊 本地音乐「漫游」模式**——作为第四种播放模式接入（列表循环 → 随机 → 单曲循环 → 漫游），每次按「熟悉度 + 相似度（同歌手/专辑/目录）」动态挑选下一首，熟悉度滑块可调，开启时第一首也是随机的
2. **🎤 歌手分类优化**——`歌手A/歌手B`、`A feat. B` 等写法识别为多位歌手；`LISA` 与 `LiSA`、`MIRROR` 与 `Mirror` 等大小写差异合并为同一歌手
3. **🎼 桌面歌词增强**——双语歌词显示（主歌词下方显示翻译行），工具栏改为覆盖层不再挤压歌词；支持独立 `-tr.lrc` 翻译文件与同一时间戳多行的内嵌双语格式
4. **⬇️ 批量下载 + 统一音质**——各列表页「播放全部」旁新增「下载选中」按钮，配合新增的可见勾选框（表头全选 + 每行单选）选择歌曲，可统一选择音质，含「全部最高/最低音质」
5. **🪟 全屏播放页窗口控制**——最小化 / 最大化 / 关闭按钮
6. **🔧 构建修复**——修复 pnpm 11 下依赖树退化、原生模块未编译导致的打包失败

---

## 📥 使用方式

> [!NOTE]
> **普通用户无需 Node.js 或 pnpm**，以下两项只在你「从源码构建」时才需要。

### 下载安装即使用（Windows）

前往 [Releases](../../releases) 下载最新安装包，解压后双击 `MusicFree.exe` 即可使用：

- **便携版（ZIP）**：解压即用，无需安装、无需管理员权限；数据存在 `%APPDATA%\MusicFree`，与程序目录分离，删除文件夹即可卸载
- 上传时会把 SHA256 一并附在 Release 说明中，便于校验

> [!IMPORTANT]
> 本项目**不包含任何音源插件**，音源需自行在「插件管理」中导入后才能在线搜索播放。参考：[MusicFreePlugins](https://github.com/maotoumao/MusicFreePlugins)

### 从源码构建

|  依赖   |  版本  |
| :-----: | :----: |
| Node.js | >= 18  |
|  pnpm   | latest |

```bash
# 克隆仓库
git clone https://github.com/Y-ian-0729/MusicFreeDesktop-IAN.git
cd MusicFreeDesktop-IAN

# 安装依赖（首次会自动下载 Electron 并编译原生模块，耗时较久）
pnpm install

# 启动应用
pnpm start

# 构建安装包
pnpm run make
```

> **国内网络提示**：Electron 二进制默认从 GitHub 下载，可能很慢。可先设置镜像：
>
> ```powershell
> # Windows PowerShell
> $env:ELECTRON_MIRROR = "https://registry.npmmirror.com/-/binary/electron/"
> pnpm install
> ```

#### 常用命令

|       命令        | 说明         |
| :---------------: | ------------ |
|   `pnpm start`    | 启动应用     |
|  `pnpm run dev`   | 开发模式     |
|  `pnpm run make`  | 构建安装包   |
|  `pnpm run lint`  | 代码检查     |
| `pnpm run format` | 代码格式化   |

---

## 📦 改动范围

为便于审查与后续跟随上游，新增代码集中在少数独立模块中：

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 歌手标签解析 | `src/common/artistUtils.ts` | 纯函数：拆分、归一、展示名选取 |
| 漫游引擎 | `src/renderer/mainWindow/core/roam/` | 纯函数评分 + 会话环 + 播放统计持久化 |
| 批量下载按钮 | `.../business/BatchDownloadButton/` | 工具栏入口 |
| 批量下载弹窗 | `.../business/modals/BatchDownloadModal/` | 音质选择与分片提交 |
| 选择勾选框 | `.../business/SongTable/` | 表头全选 + 行内勾选 |

**数据库变更**：`download_tasks` 表新增 `quality_fallback` 列（schema v5 → v6），用于持久化批量下载的音质回退方向。**升级会自动迁移，不影响既有数据。**

---

## ⚠️ 已知限制

- 本地音乐元数据仅解析 **标题 / 歌手 / 专辑 / 时长 / 目录**，**没有风格、BPM、年份**等字段。因此漫游的「相似度」只能基于歌手、专辑、目录三项，**做不到按曲风漫游**。
- 漫游的「熟悉度」来自本地播放次数统计，**初次使用时统计为空**，需要听一段时间后才能体现偏好。
- 批量下载依赖音源插件的实际返回，**若某首歌所有音质都不可用，该曲目会被跳过**。

---

## 🤝 参与贡献

欢迎提交 Issue 与 PR。请先阅读 [贡献指南](./CONTRIBUTING.md)。

---

## 📄 开源协议

本项目以 **[AGPL-3.0-only](./LICENSE)** 发布，与上游保持一致。

- 原始版权声明、作者署名与 `LICENSE` 文件完整保留，未作任何删改
- 所有修改均已记录于 [CHANGELOG.md](./CHANGELOG.md) 与 [NOTICE.md](./NOTICE.md)
- 依据 AGPL-3.0 第 5 条 a 款，修改过的源文件均在提交历史中明确标注

---

## 🙏 致谢

本项目基于 [maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop) 二次开发，感谢原作者猫头猫与所有为 MusicFree 贡献过的开发者。

- [maotoumao/MusicFree](https://github.com/maotoumao/MusicFree) —— 安卓版与插件协议
- [MusicFreePlugins](https://github.com/maotoumao/MusicFreePlugins) · [MusicFreeThemePacks](https://github.com/maotoumao/MusicFreeThemePacks)
