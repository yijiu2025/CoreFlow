# -*- coding: utf-8 -*-
"""主索引收紧（为 §43 腾空间）。只压缩措辞，不改语义。"""
import io

P = '.workbuddy/memory/MEMORY.md'
s = io.open(P, encoding='utf-8').read()
n0 = len(s.encode('utf-8'))

REPL = [
    # L56 工作台
    ('；草稿**打开 vs 刷新**落点一致）·ⓖ 🔴 **同阶段起跑线落点同源**。',
     '）·ⓖ 🔴 **同阶段起跑线同源**。'),
    # L61 LLM 面板
    ('真凶常是环境变量**单复数拼错**（`…_KEYS` vs `…_KEY`）⇒ 静默返回空；',
     '真凶常是环境变量**单复数拼错**⇒静默返回空；'),
    # L62 侧栏
    ('`confirmRouteNetwork()`（改过已定步骤**自动分叉**）≠ `confirmScheme` ≠ `unconfirmRouteNetwork`；',
     '`confirmRouteNetwork`(**自动分叉**)≠`confirmScheme`≠`unconfirmRouteNetwork`；'),
    ('；同目标可确认**多条**「已确认路线」；', '；同目标可确认**多条**；'),
    ('🔴 **整行热区**一致⇒行 click + 操作区 `@click.stop`；',
     '🔴 **整行热区**⇒行 click/操作区 `@click.stop`；'),
    ('🔴 计数 = **本组条数**（`verify-side-scroll.cjs`）', '🔴 计数=**本组条数**（`verify-side-scroll.cjs`）'),
    ('**「目标分析」卡 → §35**', '**「目标分析」卡→§35**'),
    # L57 路线方案
    ('④ AI = **POST+fetch SSE**，', '④ AI=**POST+fetch SSE**，'),
    # L60 端点配置
    ('「使用中」= 下标起**首个可用** key', '「使用中」=下标记起**首个可用** key'),
    # L63 断言与探针
    ('🔴 **新增断言须"改回旧写法确认会红"**；', '🔴 **新断言须"改回旧写法确认会红"**；'),
    ('🔴 **探针会崩** ⇒ `st[0] if st else {}` + `.get()`；',
     '🔴 **探针会崩** ⇒ `st[0] if st else {}`+`.get()`、**锚点两版都须在**；'),
    ('🔴 **探针锚点须新旧两版都有**（否则**首段崩**）；', ''),
    ('🔴 **反向证明前先证"加载的是旧代码"** ⇒ `touch`+**读 dev 模块验特征串**；',
     '🔴 **反向证明前先证"加载的是旧代码"**⇒`touch`+**读 dev 模块验特征串**；'),
    # L65 解析/画板/网络层
    ('· 404 = 未收录 · CAS 混在 synonyms · 查不到**删整块**。', '· 404=未收录 · CAS 混 synonyms · 查不到**删整块**。'),
    # L66 UI 细则
    ('防跳位 = `Session.sig` 指纹（§18.1）；标定态「换目标/新任务」**禁 filter 删上一条会话**；',
     '防跳位=`Session.sig` 指纹；标定态「换目标/新任务」**禁 filter 删上条会话**；'),
    ('🔴 **`<td>` 禁 `display:flex`**（⇒**分隔线断两截**）⇒flex 挂**内层 div**；',
     '🔴 **`<td>`禁`display:flex`**（⇒**线断两截**）⇒flex 挂**内层**；'),
    # L67 画布
    ('；懒页签⇒fitView **首次可见**补。守门', '。守门'),
    # L69 chip 行
    ('；`el-dropdown` 挂 pill **外层**才是整块热区；**EP 下拉不吃 Escape**。',
     '；`el-dropdown` 挂 pill **外层**才是整块热区；**EP 下拉不吃 Esc**。'),
    ('🔴 同页 7 个 `.el-dropdown-menu` 全预渲染，可见性只在**祖先** `.el-popper`（筛可见）；',
     '🔴 同页 7 个 `.el-dropdown-menu` 全预渲染，可见性只在**祖先** `.el-popper`；'),
]

for old, new in REPL:
    n = s.count(old)
    assert n == 1, '命中 %d 次: %s' % (n, old[:80])
    s = s.replace(old, new)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
n1 = len(s.encode('utf-8'))
print('收紧：%d → %d（省 %d B）；预算 12288，余 %d' % (n0, n1, n0 - n1, 12288 - n1))
