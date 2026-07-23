import { _ as z } from './Icon.vue_vue_type_script_setup_true_lang-D-OxR9Ey.js';
import {
  d as I,
  a1 as U,
  A as B,
  C as M,
  o as q,
  c as C,
  b as t,
  e as o,
  f as l,
  F as $,
  r as Q,
  n as E,
  t as T,
  j as r,
  w as n,
  v,
  S as L,
  q as N,
  Q as A,
  s as D,
  k as F,
  l as a
} from './index-C531BqZY.js';
import { S as W, W as G, K, C as j } from './wrench-CXNTiZy0.js';
import { B as H } from './user-Cti-8Le8.js';
import { _ as P } from './_plugin-vue_export-helper-DTPmx0_K.js';
import './loader-circle-BU5vGQ8h.js';
import './x-dxW7U81h.js';
import './triangle-alert-htK-bCwW.js';
import './search-oUkp4cYT.js';
import './message-circle-C3r4ZyRP.js';
import './aperture-CMAIhw8p.js';
import './users-BaaIlyJv.js';
import './heart-DQGPeVSk.js';
import './map-pin-CeIDkRSF.js';
import './sparkles-CSDhrUXU.js';
import './camera-nl1SqI33.js';
const Y = { class: 'settings-modal-card' },
  Z = { class: 'modal-header' },
  J = { class: 'header-title-group' },
  O = { class: 'header-icon' },
  R = { class: 'modal-body-container' },
  X = { class: 'settings-sidebar' },
  ss = ['onClick'],
  ts = { class: 'tab-icon' },
  is = { class: 'tab-label' },
  es = { id: 'settings-sec-general', class: 'settings-section' },
  as = { class: 'section-title' },
  os = { class: 'setting-row' },
  ns = { class: 'switch-label' },
  ls = { class: 'setting-row' },
  ds = { class: 'switch-label' },
  cs = { class: 'setting-row' },
  rs = { id: 'settings-sec-ai', class: 'settings-section' },
  vs = { class: 'section-title' },
  us = { class: 'setting-row' },
  ps = { class: 'switch-label' },
  bs = { class: 'setting-row block-layout' },
  ms = { class: 'setting-info' },
  gs = { class: 'setting-label' },
  fs = { class: 'range-wrapper' },
  hs = { class: 'setting-row' },
  ws = { class: 'switch-label' },
  ks = { id: 'settings-sec-shortcuts', class: 'settings-section' },
  ys = { class: 'section-title' },
  Ss = { id: 'settings-sec-faq', class: 'settings-section' },
  _s = { class: 'section-title' },
  qs = I({
    __name: 'SettingsModal',
    props: { activeSection: {} },
    emits: ['close', 'showToast'],
    setup(V, { emit: Cs }) {
      const u = V,
        f = U(),
        h = F({ get: () => f.settings.showTemplate, set: e => f.setSetting('showTemplate', e) }),
        p = a('general'),
        d = a(null),
        w = a(!0),
        k = a('zh'),
        y = a(!0),
        b = a(60),
        S = a(!1),
        _ = [
          { id: 'general', name: '通用设置', icon: 'wrench' },
          { id: 'ai', name: 'AI 辅助', icon: 'bot' },
          { id: 'shortcuts', name: '快捷键', icon: 'keyboard' },
          { id: 'faq', name: '常见问题', icon: 'help-circle' }
        ],
        m = e => {
          p.value = e;
          const s = document.getElementById(`settings-sec-${e}`);
          s && d.value && s.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        x = () => {
          if (!d.value) return;
          const e = d.value,
            s = e.scrollTop;
          for (const c of _) {
            const i = document.getElementById(`settings-sec-${c.id}`);
            if (i) {
              const g = i.offsetTop - e.offsetTop;
              if (s >= g - 30 && s < g + i.clientHeight - 30) {
                p.value = c.id;
                break;
              }
            }
          }
        };
      return (
        B(() => {
          u.activeSection &&
            setTimeout(() => {
              m(u.activeSection);
            }, 100);
        }),
        M(
          () => u.activeSection,
          e => {
            e && m(e);
          }
        ),
        (e, s) => {
          const c = z;
          return (
            q(),
            C(
              'div',
              { class: 'modal-overlay animate-fade-in', onClick: s[7] || (s[7] = D(i => e.$emit('close'), ['self'])) },
              [
                t('div', Y, [
                  t('div', Z, [
                    t('div', J, [
                      t('span', O, [o(l(W), { size: 18 })]),
                      s[8] || (s[8] = t('h3', null, '系统设置', -1))
                    ]),
                    t('button', { class: 'close-btn', onClick: s[0] || (s[0] = i => e.$emit('close')) }, '×')
                  ]),
                  t('div', R, [
                    t('aside', X, [
                      (q(),
                      C(
                        $,
                        null,
                        Q(_, i =>
                          t(
                            'button',
                            { key: i.id, class: E(['tab-btn', { active: p.value === i.id }]), onClick: g => m(i.id) },
                            [
                              t('span', ts, [o(c, { name: i.icon, size: 16 }, null, 8, ['name'])]),
                              t('span', is, T(i.name), 1)
                            ],
                            10,
                            ss
                          )
                        ),
                        64
                      ))
                    ]),
                    t(
                      'main',
                      { class: 'settings-content', ref_key: 'scrollContainer', ref: d, onScroll: x },
                      [
                        t('section', es, [
                          t('h4', as, [o(l(G), { size: 15 }), s[9] || (s[9] = r(' 通用设置', -1))]),
                          t('div', os, [
                            s[11] ||
                              (s[11] = t(
                                'div',
                                { class: 'setting-info' },
                                [
                                  t('div', { class: 'setting-label' }, '默认显示模板骨骼'),
                                  t(
                                    'div',
                                    { class: 'setting-desc' },
                                    '在浏览列表及作品卡片时，默认加载并显示姿势骨骼层。若关闭此项，将不加载骨骼层图片，仅加载底图，可节省服务器带宽。'
                                  )
                                ],
                                -1
                              )),
                            t('label', ns, [
                              n(
                                t(
                                  'input',
                                  {
                                    type: 'checkbox',
                                    'onUpdate:modelValue': s[1] || (s[1] = i => (h.value = i)),
                                    class: 'switch-input'
                                  },
                                  null,
                                  512
                                ),
                                [[v, h.value]]
                              ),
                              s[10] || (s[10] = t('span', { class: 'switch-slider' }, null, -1))
                            ])
                          ]),
                          t('div', ls, [
                            s[13] ||
                              (s[13] = t(
                                'div',
                                { class: 'setting-info' },
                                [
                                  t('div', { class: 'setting-label' }, '启用高画质预览'),
                                  t(
                                    'div',
                                    { class: 'setting-desc' },
                                    '优先加载未压缩 of 原始底图以保证视觉细节，网络条件较差时建议关闭。'
                                  )
                                ],
                                -1
                              )),
                            t('label', ds, [
                              n(
                                t(
                                  'input',
                                  {
                                    type: 'checkbox',
                                    'onUpdate:modelValue': s[2] || (s[2] = i => (w.value = i)),
                                    class: 'switch-input'
                                  },
                                  null,
                                  512
                                ),
                                [[v, w.value]]
                              ),
                              s[12] || (s[12] = t('span', { class: 'switch-slider' }, null, -1))
                            ])
                          ]),
                          t('div', cs, [
                            s[15] ||
                              (s[15] = t(
                                'div',
                                { class: 'setting-info' },
                                [
                                  t('div', { class: 'setting-label' }, '界面语言 (Language)'),
                                  t('div', { class: 'setting-desc' }, '更改应用程序所展示的文字语言。')
                                ],
                                -1
                              )),
                            n(
                              t(
                                'select',
                                { class: 'setting-select', 'onUpdate:modelValue': s[3] || (s[3] = i => (k.value = i)) },
                                [
                                  ...(s[14] ||
                                    (s[14] = [
                                      t('option', { value: 'zh' }, '简体中文', -1),
                                      t('option', { value: 'en' }, 'English (US)', -1)
                                    ]))
                                ],
                                512
                              ),
                              [[L, k.value]]
                            )
                          ])
                        ]),
                        s[26] || (s[26] = t('div', { class: 'section-divider' }, null, -1)),
                        t('section', rs, [
                          t('h4', vs, [o(l(H), { size: 15 }), s[16] || (s[16] = r(' AI 辅助设置', -1))]),
                          t('div', us, [
                            s[18] ||
                              (s[18] = t(
                                'div',
                                { class: 'setting-info' },
                                [
                                  t('div', { class: 'setting-label' }, '自动进行姿态分析'),
                                  t(
                                    'div',
                                    { class: 'setting-desc' },
                                    '导入或拍摄完底图后，AI 自动检测并绘制人体参考骨架线。'
                                  )
                                ],
                                -1
                              )),
                            t('label', ps, [
                              n(
                                t(
                                  'input',
                                  {
                                    type: 'checkbox',
                                    'onUpdate:modelValue': s[4] || (s[4] = i => (y.value = i)),
                                    class: 'switch-input'
                                  },
                                  null,
                                  512
                                ),
                                [[v, y.value]]
                              ),
                              s[17] || (s[17] = t('span', { class: 'switch-slider' }, null, -1))
                            ])
                          ]),
                          t('div', bs, [
                            t('div', ms, [
                              t('div', gs, 'AI 关键点敏感度 (' + T(b.value) + '%)', 1),
                              s[19] ||
                                (s[19] = t(
                                  'div',
                                  { class: 'setting-desc' },
                                  '设置检测关键点时的阈值，数值越高对边缘模糊的关节识别越苛刻。',
                                  -1
                                ))
                            ]),
                            t('div', fs, [
                              n(
                                t(
                                  'input',
                                  {
                                    type: 'range',
                                    min: '10',
                                    max: '100',
                                    'onUpdate:modelValue': s[5] || (s[5] = i => (b.value = i)),
                                    class: 'setting-range'
                                  },
                                  null,
                                  512
                                ),
                                [[N, b.value]]
                              )
                            ])
                          ]),
                          t('div', hs, [
                            s[21] ||
                              (s[21] = t(
                                'div',
                                { class: 'setting-info' },
                                [
                                  t('div', { class: 'setting-label' }, '优先使用本地计算'),
                                  t(
                                    'div',
                                    { class: 'setting-desc' },
                                    '开启后将尝试利用您设备的 WebGL/GPU 进行 AI 运算，关闭则提交给云端。'
                                  )
                                ],
                                -1
                              )),
                            t('label', ws, [
                              n(
                                t(
                                  'input',
                                  {
                                    type: 'checkbox',
                                    'onUpdate:modelValue': s[6] || (s[6] = i => (S.value = i)),
                                    class: 'switch-input'
                                  },
                                  null,
                                  512
                                ),
                                [[v, S.value]]
                              ),
                              s[20] || (s[20] = t('span', { class: 'switch-slider' }, null, -1))
                            ])
                          ])
                        ]),
                        s[27] || (s[27] = t('div', { class: 'section-divider' }, null, -1)),
                        t('section', ks, [
                          t('h4', ys, [o(l(K), { size: 15 }), s[22] || (s[22] = r(' 键盘快捷键', -1))]),
                          s[23] ||
                            (s[23] = A(
                              '<div class="shortcuts-grid" data-v-65bab791><div class="shortcut-item" data-v-65bab791><span class="shortcut-action" data-v-65bab791>撤销上一步</span><span class="shortcut-key" data-v-65bab791>Ctrl + Z</span></div><div class="shortcut-item" data-v-65bab791><span class="shortcut-action" data-v-65bab791>重做下一步</span><span class="shortcut-key" data-v-65bab791>Ctrl + Y</span></div><div class="shortcut-item" data-v-65bab791><span class="shortcut-action" data-v-65bab791>平移参考画布</span><span class="shortcut-key" data-v-65bab791>空格键 Space</span></div><div class="shortcut-item" data-v-65bab791><span class="shortcut-action" data-v-65bab791>删除选中的骨骼节点</span><span class="shortcut-key" data-v-65bab791>Backspace / Delete</span></div></div>',
                              1
                            ))
                        ]),
                        s[28] || (s[28] = t('div', { class: 'section-divider' }, null, -1)),
                        t('section', Ss, [
                          t('h4', _s, [o(l(j), { size: 15 }), s[24] || (s[24] = r(' 常见问题 FAQ', -1))]),
                          s[25] ||
                            (s[25] = A(
                              '<div class="faq-list" data-v-65bab791><div class="faq-item" data-v-65bab791><div class="faq-q" data-v-65bab791>Q: 为什么拍照后骨骼没有完全对齐？</div><div class="faq-a" data-v-65bab791>A: 辅助拍照时请尽量让被摄者与屏幕上的骨骼对齐。系统会自动记录当时拍摄的视口及缩放比例（保存在 edit_data 内），并在详情页跨屏幕尺寸百分百等比例还原，无需担心对不齐问题。</div></div><div class="faq-item" data-v-65bab791><div class="faq-q" data-v-65bab791>Q: 全局开关关闭后会发生什么？</div><div class="faq-a" data-v-65bab791>A: 关闭全局模板显示后，首页所有列表将**不再加载**透明骨架图片，只加载照片原图，节省约 90% 的带宽。您依然可以随时在作品详情页中单独点击开关加载和渲染骨架。</div></div><div class="faq-item" data-v-65bab791><div class="faq-q" data-v-65bab791>Q: 能自主上传参考模板吗？</div><div class="faq-a" data-v-65bab791>A: 可以的。点击左侧菜单“发现”底下的投稿按钮，或在编辑器中设计好骨架姿势，直接上传底图和参考线，提交给管理员审核通过后即成为公共姿势模板。</div></div></div>',
                              1
                            ))
                        ])
                      ],
                      544
                    )
                  ])
                ])
              ]
            )
          );
        }
      );
    }
  }),
  Ws = P(qs, [['__scopeId', 'data-v-65bab791']]);
export { Ws as default };
