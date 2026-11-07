/**
 * 仓库布局的**唯一来源**：仓库根与运行期数据目录
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么需要这个文件
 * ════════════════════════════════════════════════════════════════════
 * 运行期数据（配置覆盖 JSON、流量统计、公开/私有文件）都放在**仓库根**，不在 `src/` 下：
 *   - `src/` 只放代码（进镜像、可只读挂载）；运行期数据要单独挂卷 / 备份 / 多实例共享。
 *   - 容器里可写的就这几个目录（见 Dockerfile 的 `mkdir` + `chown`）。
 *
 * 之前每个模块自己数 `../` 层数去拼路径，已经出过真事故：
 *   `preview.js` 写 `path.resolve(__dirname, '../../../public/...')`，从
 *   `src/app/posecraft/utils/` 数三级落在 `src/` 而不是仓库根 ⇒ 预览图写进 `src/public`，
 *   静态服务读的是根 `public/` ⇒ 文件照写不误但永远 404，且没有任何报错。
 *
 * 所以：**任何模块都不许自己数层级拼这些根**，一律从这里取。
 * 由 `src/__tests__/storage-root.test.js` 静态扫描兜底。
 *
 * 目录一览（都在仓库根）：
 *   data/     运行期 JSON 状态（*_config.json 热改、traffic_stats.json）
 *   public/   公开静态资源（@fastify/static 直出）
 *   storage/  私有文件（只能经 /api/files/v1/:app/* 鉴权下发）
 *   logs/     滚动日志
 *
 * @author yijiu2025
 * @since 2026-11-04
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根（src/framework/config/paths.js → 上两级） */
const REPO_ROOT = path.resolve(__dirname, '../../..');

/** 运行期数据目录（配置覆盖 + 统计落盘） */
const DATA_ROOT = path.join(REPO_ROOT, 'data');

/**
 * 取运行期数据目录下的某个文件路径
 *
 * @param {string} name 文件名（如 `firewall_config.json`）
 * @returns {string} 绝对路径
 * @throws {Error} 名字含路径分隔符或 `..` 时抛错（防止拼到别的目录去）
 */
function dataFile(name) {
  if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error(`非法的数据文件名: ${String(name)}`);
  }
  return path.join(DATA_ROOT, name);
}

/**
 * 确保数据目录存在（幂等；落盘前调用）
 *
 * @returns {string} 数据目录绝对路径
 */
function ensureDataDir() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  return DATA_ROOT;
}

export { REPO_ROOT, DATA_ROOT, dataFile, ensureDataDir };
