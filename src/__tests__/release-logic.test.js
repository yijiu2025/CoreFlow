/**
 * 发版决策逻辑的契约测试。
 *
 * 重点钉死两个"看起来对、实际会误判"的形态：
 *   1. 正文里**提到** `BREAKING CHANGE`（例如写发版规则本身）不得被判成破坏性变更
 *      —— 这个缺陷在真实仓库上发生过：一句规则说明把 minor 抬成了 major；
 *   2. 未识别的 type 不得被当成"无需发版"之外的任何档位。
 *
 * @author yijiu2025
 */
import { describe, it, expect } from '@jest/globals';
import {
  parseSubject,
  classify,
  decideBump,
  bumpVersion,
  compareSemver,
  buildNotes,
  findSensitive,
  bumpChangelog
} from '../framework/release/index.js';

const commit = (subject, body = '') => ({ subject, body });

describe('parseSubject：解析 Conventional Commits 前缀', () => {
  it('拆出 type / scope / 破坏性标记 / 正文', () => {
    expect(parseSubject('feat(auth): 新增设备维度封禁')).toEqual({
      type: 'feat',
      bang: false,
      text: '新增设备维度封禁'
    });
    expect(parseSubject('fix!: 移除废弃的路由')).toEqual({
      type: 'fix',
      bang: true,
      text: '移除废弃的路由'
    });
  });

  it('不符合规范的标题归入 other，且原文保留', () => {
    expect(parseSubject('随手改了点东西')).toEqual({
      type: 'other',
      bang: false,
      text: '随手改了点东西'
    });
  });
});

describe('classify：分桶与破坏性变更判定', () => {
  it('按 type 分桶，忽略 scope', () => {
    const { buckets } = classify([
      commit('feat(a): 甲'),
      commit('feat(b): 乙'),
      commit('fix: 丙'),
      commit('chore: 丁')
    ]);

    expect(buckets.feat).toHaveLength(2);
    expect(buckets.fix).toHaveLength(1);
    expect(buckets.chore).toHaveLength(1);
  });

  it('`!:` 标记为破坏性变更', () => {
    expect(classify([commit('feat!: 改签名')]).breaking).toBe(true);
  });

  it('footer 形式的 BREAKING CHANGE 标记为破坏性变更', () => {
    expect(classify([commit('feat: 改签名', 'BREAKING CHANGE: 入参顺序调整')]).breaking).toBe(true);
    expect(classify([commit('feat: 改签名', 'BREAKING-CHANGE: 入参顺序调整')]).breaking).toBe(true);
  });

  it('正文里"提到"该词（非 footer 形式）不得被判成破坏性变更', () => {
    // 真实踩坑：规则说明句「破坏性变更（!:/BREAKING CHANGE）→ major」把 minor 抬成了 major
    const ruleText = [
      '- 判据（按本次推送包含的提交类型）：含 feat → minor；仅 fix/perf → patch；',
      '  破坏性变更（!:/BREAKING CHANGE）→ major；只有 chore/docs/test/style/ci/refactor → 不发版'
    ].join('\n');

    expect(classify([commit('docs: 说明发版规则', ruleText)]).breaking).toBe(false);
    // 行首但没有冒号也算不上声明
    expect(classify([commit('docs: 说明', 'BREAKING CHANGE 这个词的用法')]).breaking).toBe(false);
  });
});

describe('decideBump：版本递增档位', () => {
  const withTypes = (...subjects) => classify(subjects.map(s => commit(s)));

  it('仅在 feat/fix/perf/破坏性变更存在时才发版', () => {
    expect(decideBump(withTypes('feat: 新功能'))).toBe('minor');
    expect(decideBump(withTypes('fix: 修复'))).toBe('patch');
    expect(decideBump(withTypes('perf: 优化'))).toBe('patch');
    expect(decideBump(withTypes('feat: 新功能', 'fix: 修复'))).toBe('minor');
    expect(decideBump(withTypes('feat!: 破坏性功能'))).toBe('major');
  });

  it('只有 chore/docs/test/style/ci/refactor 时不发版', () => {
    for (const type of ['chore', 'docs', 'test', 'style', 'ci', 'refactor']) {
      expect(decideBump(withTypes(`${type}: 日常`))).toBeNull();
    }
    expect(decideBump(classify([]))).toBeNull();
    expect(decideBump({})).toBeNull();
  });
});

describe('bumpVersion / compareSemver', () => {
  it('按档位递增并容忍 v 前缀', () => {
    expect(bumpVersion('2.6.0', 'major')).toBe('3.0.0');
    expect(bumpVersion('2.6.3', 'minor')).toBe('2.7.0');
    expect(bumpVersion('v2.6.3', 'patch')).toBe('2.6.4');
  });

  it('无法解析的版本号必须抛错，不得静默产出 NaN', () => {
    expect(() => bumpVersion('abc', 'minor')).toThrow();
    expect(() => bumpVersion('2.6.0', 'weird')).toThrow();
  });

  it('比较按位进行', () => {
    expect(compareSemver('0.5.0', '0.5.0')).toBe(0);
    expect(compareSemver('0.5.1', '0.5.0')).toBeGreaterThan(0);
    expect(compareSemver('0.4.9', '0.5.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0);
  });
});

describe('buildNotes：Release 说明正文', () => {
  const buckets = {
    feat: ['feat(auth): 设备维度封禁'],
    fix: ['fix: 修探针误判'],
    chore: ['chore: 日常']
  };
  const notes = buildNotes({ from: 'v2.5.0', to: 'v2.6.0', buckets, count: 3 });

  it('汇总行给出总数与分类计数', () => {
    expect(notes).toContain('自 `v2.5.0` 起共 3 个提交');
    expect(notes).toContain('1 feat');
  });

  it('只输出有内容的分组，且条目去掉 type 前缀', () => {
    expect(notes).toContain('### 新功能');
    expect(notes).toContain('- 设备维度封禁');
    expect(notes).not.toContain('- feat(auth):');
    // 分组标题存在即代表有内容
    expect(notes).not.toContain('### 性能');
  });

  it('带出复现完整变更的命令', () => {
    expect(notes).toContain('git log v2.5.0..v2.6.0');
  });
});

describe('findSensitive：发版前自查对外可见的表述', () => {
  it('挑出含安全相关字样的标题', () => {
    const hits = findSensitive([
      commit('fix: 修复鉴权绕过漏洞'),
      commit('feat: 新增导出功能'),
      commit('fix: 轮换泄露的 token')
    ]);

    expect(hits).toEqual(['fix: 修复鉴权绕过漏洞', 'fix: 轮换泄露的 token']);
  });

  it('普通标题不误报', () => {
    expect(findSensitive([commit('feat: 新增分页参数'), commit('docs: 补充部署说明')])).toEqual([]);
  });
});

describe('bumpChangelog：未发布区块提升为版本号区块', () => {
  const base = ['# Changelog', '', '## 未发布（Unreleased）', '', '### 修复', '', '- 修了一个 bug', ''].join('\n');

  it('非空的未发布区块提升为「版本号 — 日期」并重建空区块', () => {
    const tail = ['', '## 1.0.0 — 2026-10-14', '', '- 首个版本', ''].join('\n');
    const { text, changed } = bumpChangelog(`${base}${tail}`, '1.1.0', '2026-10-28');

    expect(changed).toBe(true);
    expect(text).toContain('## 1.1.0 — 2026-10-28');
    expect(text).toContain('- 修了一个 bug');
    expect(text).toContain('## 1.0.0 — 2026-10-14');
    // 重建的空未发布区块必须排在新版本**之上**：这样下次发版原地提升它时，
    // 新版本才落到旧版本上方。放下面会让版本号一路往下沉（实测出过 2.29.6/2.29.7 乱序）
    const newIdx = text.indexOf('## 1.1.0 — 2026-10-28');
    const placeholderIdx = text.indexOf('## 未发布（Unreleased）');
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(placeholderIdx).toBeGreaterThanOrEqual(0);
    expect(placeholderIdx).toBeLessThan(newIdx);
  });

  it('连续发版后版本号仍保持从新到旧排列', () => {
    const tail = ['', '## 1.0.0 — 2026-10-14', '', '- 首个版本', ''].join('\n');
    const v11 = bumpChangelog(`${base}${tail}`, '1.1.0', '2026-10-28').text;
    // 第二版：先补内容（模拟人写未发布区块），再提升
    const withBody = v11.replace('## 未发布（Unreleased）', '## 未发布（Unreleased）\n\n### 修复\n\n- 修了第二个 bug');
    const v12 = bumpChangelog(withBody, '1.2.0', '2026-10-29').text;

    const iPlaceholder = v12.indexOf('## 未发布（Unreleased）');
    const i12 = v12.indexOf('## 1.2.0 — 2026-10-29');
    const i11 = v12.indexOf('## 1.1.0 — 2026-10-28');
    const i10 = v12.indexOf('## 1.0.0 — 2026-10-14');

    expect(iPlaceholder).toBeGreaterThanOrEqual(0);
    // 顺序必须是：未发布 → 1.2.0 → 1.1.0 → 1.0.0
    expect(iPlaceholder).toBeLessThan(i12);
    expect(i12).toBeLessThan(i11);
    expect(i11).toBeLessThan(i10);
  });

  it('未发布区块为空时不提升', () => {
    const empty = ['# Changelog', '', '## 未发布（Unreleased）', '', '## 1.0.0 — 2026-10-14', ''].join('\n');
    const { changed, reason } = bumpChangelog(empty, '1.1.0', '2026-10-28');
    expect(changed).toBe(false);
    expect(reason).toContain('为空');
  });

  it('没有未发布标题时返回原样并说明原因', () => {
    const { changed, reason } = bumpChangelog('# Changelog\n\n## 1.0.0 — 2026-10-14\n', '1.1.0', '2026-10-28');
    expect(changed).toBe(false);
    expect(reason).toContain('未找到');
  });

  it('提升后幂等：再次提升返回 unchanged', () => {
    const first = bumpChangelog(base, '1.1.0', '2026-10-28');
    expect(first.changed).toBe(true);
    const second = bumpChangelog(first.text, '1.2.0', '2026-10-29');
    expect(second.changed).toBe(false);
  });
});
