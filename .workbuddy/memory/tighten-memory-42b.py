# -*- coding: utf-8 -*-
"""§42 主索引最后 9 字节：四处零语义微缩。"""
import io

PATH = '.workbuddy/memory/MEMORY.md'

TRIMS = [
    ('🔴 **探针也会崩**', '🔴 **探针会崩**'),
    ('（按矩形筛）', '（筛可见）'),
    ('🔴 **整行热区**一致 ⇒ 行 click', '🔴 **整行热区**一致⇒行 click'),
    ('菜单项类名 = `el-dropdown-menu__item`', '菜单项类名=`el-dropdown-menu__item`'),
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
