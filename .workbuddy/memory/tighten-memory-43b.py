# -*- coding: utf-8 -*-
"""主索引收紧第二轮（结构性删减，为 §43 腾出空间）。

删的都是「有关卡兜底、且属于已完成的样式修复」或「details 里有完整版」的片段；
凡是"违反就出事"的新坑一律保留。
"""
import io

P = '.workbuddy/memory/MEMORY.md'
s = io.open(P, encoding='utf-8').read()
n0 = len(s.encode('utf-8'))

REPL = [
    # ① §35 那段在主索引里太长，details 有完整版 ⇒ 只留指针
    ('；**「目标分析」卡→§35**（**无「切换目标」**、明细**结构式**+行尾**定宽**；`verify-targetbar-stepmol.cjs`）',
     '；「目标分析」卡§35（`verify-targetbar-stepmol.cjs`）'),
    # ② `tabular-nums` 那截：verify-scheme-merge.cjs 在守门 ⇒ 复发风险低，主索引让位
    ('**`tabular-nums` 只保等宽内对齐**⇒先给兄弟定 `min-width`（`verify-scheme-merge.cjs`）；',
     ''),
    # ③ §25 的三步排查在 L61 已详述
    ('⑤ LLM 三步排查见 §25；推理模型只吐', '⑤ 推理模型只吐'),
    # ④ 零散措辞
    ('同一份数据**只许画一遍**；', '同一份数据**只画一遍**；'),
    ('🔴 **整行热区**⇒行 click/操作区 `@click.stop`；', '🔴 **整行热区**⇒操作区 `@click.stop`；'),
    ('- 🔴 **解析/画板/网络层/CAS → §16/§34**：', '- 🔴 **解析/画板/网络层/CAS→§16/§34**：'),
    ('ⓐ 可见性判据**只能 `targetSetupOpen`**；', 'ⓐ 可见性判据只能 `targetSetupOpen`；'),
    # ⑤ 范围标注
    ('→ **§14~§42**', '→ **§14~§43**'),
]

for old, new in REPL:
    n = s.count(old)
    assert n == 1, '命中 %d 次: %s' % (n, old[:80])
    s = s.replace(old, new)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
n1 = len(s.encode('utf-8'))
print('收紧：%d → %d（省 %d B）；预算 12288，余 %d' % (n0, n1, n0 - n1, 12288 - n1))
