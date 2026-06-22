/**
 * PoseCraft CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- posecraft stats       # 统计信息
 *   npm run cli -- posecraft templates   # 模板列表
 *   npm run cli -- posecraft works       # 作品列表
 */
import { getModels } from '../../../../scripts/lib/db.js';
import { printTable, printInfo, printLine } from '../../../../scripts/lib/table.js';

/**
 * 统计信息
 */
async function posecraftStats() {
  const { Template, Work, Analysis } = getModels();

  const [templateCount, workCount, analysisCount] = await Promise.all([
    Template.count({ where: { delete_version: 0 } }).catch(() => 0),
    Work.count({ where: { delete_version: 0 } }).catch(() => 0),
    Analysis.count().catch(() => 0)
  ]);

  console.log('\n📊 PoseCraft 统计：');
  printLine();
  console.log(`  模板数:   ${templateCount}`);
  console.log(`  作品数:   ${workCount}`);
  console.log(`  分析记录: ${analysisCount}`);
  printLine();
}

/**
 * 模板列表
 */
async function listTemplates() {
  const { Template } = getModels();
  const templates = await Template.findAll({
    where: { delete_version: 0 },
    order: [['created_at', 'DESC']],
    limit: 20
  });

  if (templates.length === 0) {
    printInfo('暂无模板');
    return;
  }

  console.log('\n📋 模板列表：');
  printTable(
    ['ID', '标题', '分类', '使用次数', '创建时间'],
    templates.map((t) => [
      t.id,
      t.title?.substring(0, 20),
      t.category,
      t.uses_count,
      new Date(t.created_at).toLocaleString('zh-CN')
    ])
  );
}

/**
 * 作品列表
 */
async function listWorks() {
  const { Work } = getModels();
  const works = await Work.findAll({
    where: { delete_version: 0 },
    order: [['created_at', 'DESC']],
    limit: 20
  });

  if (works.length === 0) {
    printInfo('暂无作品');
    return;
  }

  console.log('\n🎨 作品列表：');
  printTable(
    ['ID', '标题', '点赞', '浏览', '创建时间'],
    works.map((w) => [
      w.id,
      w.title?.substring(0, 20),
      w.likes_count,
      w.views_count,
      new Date(w.created_at).toLocaleString('zh-CN')
    ])
  );
}

// 导出 CLI 插件配置
export default {
  command: 'posecraft',
  appName: 'posecraft',
  description: 'PoseCraft AI 姿势分析',
  subcommands: {
    'stats':     { description: '统计信息', handler: posecraftStats },
    'templates': { description: '模板列表', handler: listTemplates },
    'works':     { description: '作品列表', handler: listWorks }
  }
};
