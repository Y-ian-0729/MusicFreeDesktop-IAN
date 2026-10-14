#!/usr/bin/env node
/**
 * Windows 便携版打包脚本
 *
 * 本仓库刻意保持最小依赖集，不引入 @electron-forge/maker-zip / maker-squirrel
 * （安装它们会触发 @electron/node-gyp 的 git 依赖，被 pnpm 的 blockExoticSubdeps 拦下）。
 *
 * 本脚本直接把 electron-forge package 的产物目录打包为 ZIP：
 *   - 解压即用，无需安装、无需管理员权限
 *   - 数据存在 %APPDATA%\MusicFree，与目录分离，绿色软件行为
 *
 * 用法：
 *   node scripts/package-win.mjs [--version <x.y.z>] [--out <dir>] [--name <name>]
 *
 * 默认：
 *   源目录  out/MusicFree-win32-x64
 *   输出    dist/MusicFree-<version>-win32-x64-portable.zip
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ── 解析参数 ──
function parseArgs(argv) {
    const out = { version: null, outDir: null, name: null };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--version') out.version = argv[++i];
        else if (a === '--out') out.outDir = argv[++i];
        else if (a === '--name') out.name = argv[++i];
        else if (a === '--help' || a === '-h') {
            console.log('用法: node scripts/package-win.mjs [--version <x.y.z>] [--out <dir>] [--name <name>]');
            process.exit(0);
        }
    }
    return out;
}

const args = parseArgs(process.argv);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = args.version ?? pkg.version;
const productName = 'MusicFree';
const sourceDir = path.join(root, 'out', 'MusicFree-win32-x64');
const outDir = args.outDir ?? path.join(root, 'dist');
const zipName = args.name ?? `${productName}-${version}-win32-x64-portable.zip`;
const zipPath = path.join(outDir, zipName);

// ── 前置检查 ──
if (!fs.existsSync(sourceDir)) {
    console.error(`✗ 找不到构建产物目录: ${sourceDir}`);
    console.error('  请先执行: pnpm run package');
    process.exit(1);
}

const exe = path.join(sourceDir, `${productName}.exe`);
if (!fs.existsSync(exe)) {
    console.error(`✗ 找不到可执行文件: ${exe}`);
    process.exit(1);
}

// ── 提示内容：很多用户会问「解压后怎么用」 ──
const readmeName = '使用说明.txt';
const readmeText =
    `MusicFree 桌面版 ${version}（非官方增强版 · Windows 便携版）\r\n` +
    `\r\n` +
    `【使用方法】\r\n` +
    `  解压本 ZIP 到任意目录（例如 D:\\MusicFree），双击 MusicFree.exe 即可使用。\r\n` +
    `  无需安装，绿色运行；若需卸载，直接删除整个文件夹即可。\r\n` +
    `\r\n` +
    `【数据位置】\r\n` +
    `  数据存放在 %APPDATA%\\MusicFree，与程序目录分离，因此升级时替换文件夹不会丢失数据。\r\n` +
    `  但若同时安装了官方版本，两者会共用该目录，请留意。\r\n` +
    `\r\n` +
    `【关于音源】\r\n` +
    `  本播放器不内置任何音源插件，需自行在「插件管理」中导入音源后才可在线搜索播放。\r\n` +
    `  详见: https://github.com/maotoumao/MusicFreePlugins\r\n` +
    `\r\n` +
    `【来源与许可】\r\n` +
    `  本项目基于 maotoumao/MusicFreeDesktop 二次开发，AGPL-3.0-only。\r\n` +
    `  这是非官方版本，与原作者无关联；最新官方版请访问:\r\n` +
    `  https://github.com/maotoumao/MusicFreeDesktop\r\n`;

// ── 打包 ──
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(sourceDir, readmeName), readmeText, 'utf-8');

if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

console.log(`打包中: ${path.basename(zipPath)}`);
// 用 -LiteralPath 避免路径中的特殊字符被当通配符
// -CompressionLevel Optimal 兼顾体积与速度
execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force"`,
    { stdio: 'inherit', cwd: root },
);

// ── 清理临时说明文件，避免污染构建目录 ──
fs.rmSync(path.join(sourceDir, readmeName), { force: true });

if (!fs.existsSync(zipPath)) {
    console.error('✗ 打包失败：未找到输出文件');
    process.exit(1);
}

const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
const sha256 = execSync(`powershell -NoProfile -Command "(Get-FileHash '${zipPath}' -Algorithm SHA256).Hash.ToLower()"`, {
    cwd: root,
})
    .toString()
    .trim();

console.log('');
console.log(`✓ 打包完成: ${path.relative(root, zipPath)} (${sizeMB} MB)`);
console.log(`  SHA256: ${sha256}`);
console.log('');
console.log('上传到 GitHub Release 时，建议把上面的 SHA256 一并写进 Release 说明。');
