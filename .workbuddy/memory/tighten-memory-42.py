# -*- coding: utf-8 -*-
"""把 MEMORY.md 压回 12288B 预算内（§42 新增内容的净增靠同文件微缩让位）。"""
import io

PATH = '.workbuddy/memory/MEMORY.md'

# (旧, 新) —— 每条只做"去冗余"，不改语义、不删判据
TRIMS = [
    # §42 行：去掉两条"低复发"细节（已完整落在 details §42）
    ('；**EP 下拉不吃 Escape**。🔴 **EP 菜单项类名',
     '；**EP 下拉不吃 Escape**。🔴 菜单项类名'),
    ('🔴 同页 **7 个** `.el-dropdown-menu` 全预渲染、可见性只在**祖先** `.el-popper`（按矩形筛）；🔴 懒查判据须挑**非叶子**（叶子早被侧栏预热⇒恒绿）；断言别写**绝对**行高 ⇒ 写**量化不变式**。',
     '🔴 同页 7 个 `.el-dropdown-menu` 全预渲染，可见性只在**祖先** `.el-popper`（按矩形筛）；🔴 断言禁**绝对**行高 ⇒ 用**量化不变式**。'),
    # §35 那半句压成指针（§35 正文在 details，不丢入口）
    ('；🔴 **「目标分析」卡（§35）**：**无「切换目标」**（入口在主区卡头）；明细画**结构式**·行尾（⑂+%）**定宽**（`verify-targetbar-stepmol.cjs`）',
     '；**「目标分析」卡 → §35**（**无「切换目标」**、明细**结构式**+行尾**定宽**；`verify-targetbar-stepmol.cjs`）'),
    # 侧栏那行的冗余
    ('；🔴「最近的任务」计数 = **本组条数**（`verify-side-scroll.cjs`）',
     '；🔴 计数 = **本组条数**（`verify-side-scroll.cjs`）'),
    ('同一目标可确认**多条**「已确认路线」', '同目标可确认**多条**「已确认路线」'),
    ('`sessionSignature` **必须带 confirmed**', '`sessionSignature` **须带 confirmed**'),
    # 断言/探针那行的冗余
    ("（`count('')`=长度+1⇒必炸）", "（`count('')`⇒必炸）"),
    ('（否则**首段就崩**）', '（否则**首段崩**）'),
    ('（DOM 序+几何链同量；改结构先 grep）。', '（DOM 序+几何链同量；改结构先 grep）'),
    # 工作台那行
    ('ⓖ 🔴 **同阶段两条起跑线落点同源**。', 'ⓖ 🔴 **同阶段起跑线落点同源**。'),
    # LLM 面板那行
    ('「刷新」= **只读配置** + 有改动**先确认**', '「刷新」=**只读配置**+有改动**先确认**'),
    ('每把标 `source`，`.env` 那把删不掉', '每把标 `source`；`.env` 那把删不掉'),
    # 方案栏那行
    ('其余页签夹在**页签与内容之间**——EP 默认插槽整块进',
     '其余页签夹在**页签与内容之间**—EP 默认插槽整块进'),
]


def main():
    s = io.open(PATH, encoding='utf-8').read()
    before = len(s.encode('utf-8'))
    for old, new in TRIMS:
        n = s.count(old)
        assert n == 1, '锚点命中 %d 次：%s' % (n, old[:70])
        s = s.replace(old, new)
    io.open(PATH, 'w', encoding='utf-8', newline='\n').write(s)
    after = len(s.encode('utf-8'))
    print('MEMORY.md: %d -> %d bytes（省 %d；预算 12288，余 %d）' % (before, after, before - after, 12288 - after))


if __name__ == '__main__':
    main()
