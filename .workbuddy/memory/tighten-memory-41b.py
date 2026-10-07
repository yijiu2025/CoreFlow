#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""第三十一轮（续）：把 §41 条目压短 + 收紧相邻几条，落回 12288 B 预算内。"""
import io

PATH = 'MEMORY.md'

SHORT = (
    "- 🔴 **行内 chip 行（§41）**：禁竖排（撑高行+被撑等宽）；横排**写死 `line-height`**"
    "（匿名 flex item 差 1px）；`el-dropdown` 放 pill **外层**才是整块热区；**EP 下拉不吃 Escape**。"
    "守门 `verify-steprow-tags.cjs`\n"
)

LONG_PREFIX = "- 🔴 **行内 chip 行（§41）**："

REPL = [
    # ① 侧栏条（787B）
    ('同在 `.app__side-scroll`（**禁给侧栏内元素 `overflow-y`/`max-height`**）；',
     '同在 `.app__side-scroll`（**禁内嵌滚动**）；'),
    ('≠ `confirmScheme(id)`≠`unconfirmRouteNetwork`；🔴 共用 `networkStats`；',
     '≠ `confirmScheme` ≠ `unconfirmRouteNetwork`；🔴 共用 `networkStats`；'),
    ('🔴「最近的任务」计数 = **本组条数**。守门 `verify-side-scroll.cjs`；🔴 **「目标分析」卡（§35）**：**无「切换目标」**（入口在主区卡头）；各步明细画**结构式**·行尾（⑂+%）须**定宽**。守门 `verify-targetbar-stepmol.cjs`',
     '🔴「最近的任务」计数 = **本组条数**（`verify-side-scroll.cjs`）；🔴 **「目标分析」卡（§35）**：**无「切换目标」**（入口在主区卡头）；明细画**结构式**·行尾（⑂+%）**定宽**（`verify-targetbar-stepmol.cjs`）'),
    # ② 断言与探针条（651B）
    ('（守门 `verify-scheme-merge.cjs`）；', '（`verify-scheme-merge.cjs`）；'),
    ("🔴 **替换禁空串**（`count('')`恒为长度+1⇒必炸）；", "🔴 **替换禁空串**（`count('')`=长度+1⇒必炸）；"),
    # ③ UI 细则条（507B）
    ('侧栏防跳位 = `Session.sig` 内容指纹（§18.1）；', '防跳位 = `Session.sig` 指纹（§18.1）；'),
    ('DOM 三坑见 §16.3；🔴 **收起/展开不得改变控件位置**：', 'DOM 三坑 §16.3；🔴 **收起/展开不得改控件位置**：'),
    ('含可隐藏文字的按钮**须定高**（守门 `verify-collapse-stable.cjs`）。🔴 **表格 `<td>` 禁 `display:flex`**',
     '含可隐藏文字的按钮**须定高**（`verify-collapse-stable.cjs`）。🔴 **`<td>` 禁 `display:flex`**'),
    # ④ 工作台条（568B）
    ('（诞生于 `closeTargetSetup()`；`persistSession` **无归属不落盘**；草稿**打开 vs 刷新**落点须一致）·ⓖ 🔴 **同一阶段两条起跑线落点同源**（自动/手动都切树）。守门 `verify-parse-notask.cjs`/`verify-auto-jump.cjs`',
     '（生于 `closeTargetSetup()`；`persistSession` **无归属不落盘**；草稿**打开 vs 刷新**落点一致）·ⓖ 🔴 **同阶段两条起跑线落点同源**。`verify-parse-notask.cjs`/`verify-auto-jump.cjs`'),
    # ⑤ 画布条（450B）
    ('容器链须**确定高度**（`height` 非 `min-height`⇒否则与 `max(画布,容器)` 互撑成**几万 px**）；',
     '容器链须**确定高度**⇒否则与 `max(画布,容器)` 互撑成**几万 px**；'),
]


def main():
    s = io.open(PATH, encoding='utf-8', newline='\n').read()
    before = len(s.encode('utf-8'))

    # 先把上一版那条长 bullet 换成短的
    lines = s.split('\n')
    idx = [i for i, l in enumerate(lines) if l.startswith(LONG_PREFIX)]
    assert len(idx) == 1, '长条目命中 %d 条（应为 1）' % len(idx)
    lines[idx[0]] = SHORT.rstrip('\n')
    s = '\n'.join(lines)

    for old, new in REPL:
        n = s.count(old)
        assert n == 1, '锚点命中 %d 次（应为 1）：%r' % (n, old[:70])
        s = s.replace(old, new)

    io.open(PATH, 'w', encoding='utf-8', newline='\n').write(s)
    after = len(s.encode('utf-8'))
    print('MEMORY.md: %d B → %d B（Δ%+d），预算 12288' % (before, after, after - before))
    assert after <= 12288, '仍超预算：%d（还差 %d）' % (after, after - 12288)
    print('落在预算内 ✅')


if __name__ == '__main__':
    main()
