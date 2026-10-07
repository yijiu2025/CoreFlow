#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""第三十一轮：把 §41 的要点压进 MEMORY.md 主索引，同时收紧等量文字（预算 12288 B）。"""
import io

PATH = 'MEMORY.md'

NEW_BULLET = (
    "- 🔴 **行内 chip 行（§41）**：禁竖排（⇒撑高行 + 被 `stretch` 等宽）；横排须**写死 `line-height`**"
    "（`inline-flex` 匿名 flex item 差 1px）；`el-dropdown` 放 pill **外层**才是整块热区；"
    "**EP 下拉不吃 Escape** ⇒ 实拍前点外部+断言已关。守门 `verify-steprow-tags.cjs`\n"
)

REPL = [
    # 编号推进
    ('## 6. retroweb + retrochimera（逆合成工作台）→ **§14~§40**',
     '## 6. retroweb + retrochimera（逆合成工作台）→ **§14~§41**'),
    # 收紧：表格 td
    ('🔴 **表格 `<td>` 禁 `display:flex`**（⇒非表格单元格⇒不拉伸到行高⇒**分隔线断两截**）⇒flex 挂**内层 div**；守门 `verify-tbl-lines.cjs` §38',
     '🔴 **表格 `<td>` 禁 `display:flex`**（⇒**分隔线断两截**）⇒flex 挂**内层 div**；`verify-tbl-lines.cjs` §38'),
    # 收紧：探针锚点
    ('🔴 **探针锚点须新旧两版都有**（否则**首段就崩** ⇒ 后续断言全跑不到）；',
     '🔴 **探针锚点须新旧两版都有**（否则**首段就崩**）；'),
    # 收紧：env 单复数
    ('真凶常是环境变量**单复数拼错**（`…_KEYS` vs `…_KEY`）⇒ **静默返回空**；',
     '真凶常是环境变量**单复数拼错**（`…_KEYS` vs `…_KEY`）⇒ 静默返回空；'),
    # 收紧：LLM 三步
    ('⑤ LLM 三步排查见 §25（`/v1/models` 会骗人）；推理模型只吐 `reasoning_content`（须发 `thinking`）。',
     '⑤ LLM 三步排查见 §25；推理模型只吐 `reasoning_content`（须发 `thinking`）。'),
    # 收紧：CAS 正则
    ('404 = 未收录 · CAS 混在 synonyms（正则）· 查不到**删整块**。',
     '404 = 未收录 · CAS 混在 synonyms · 查不到**删整块**。'),
    # 收紧：watcher 反证
    ('🔴 **反向证明前先证"加载的是旧代码"**（watcher 会漏）⇒ `touch`+**读 dev 模块验特征串**；',
     '🔴 **反向证明前先证"加载的是旧代码"** ⇒ `touch`+**读 dev 模块验特征串**；'),
    # 收紧：sizer 公式
    ('偏移只一套（`sizer=max(画布×zoom,容器)+2×余量`，**余量省不得**⇒缩图后 `scrollWidth==clientWidth`⇒**拖不动**）；',
     '偏移只一套（`sizer=max(画布×zoom,容器)+2×余量`；**余量省不得**⇒缩图后 **拖不动**）；'),
    # 新增：本轮
    ('- 🔴 **「分析模块」key 前后端必须对齐**', NEW_BULLET + '- 🔴 **「分析模块」key 前后端必须对齐**'),
]


def main():
    s = io.open(PATH, encoding='utf-8', newline='\n').read()
    before = len(s.encode('utf-8'))
    for old, new in REPL:
        n = s.count(old)
        assert n == 1, '锚点命中 %d 次（应为 1）：%r' % (n, old[:70])
        s = s.replace(old, new)
    io.open(PATH, 'w', encoding='utf-8', newline='\n').write(s)
    after = len(s.encode('utf-8'))
    print('MEMORY.md: %d B → %d B（Δ%+d），预算 12288' % (before, after, after - before))
    assert after <= 12288, '仍超预算：%d' % after
    print('仍在预算内 ✅')


if __name__ == '__main__':
    main()
