<script setup lang="ts">
/**
 * 代码生成（二期）
 *
 * 参考项目的生成器输出的是 Java（Controller/Service/Mapper/XML/菜单 SQL），
 * 本仓是 Fastify + Sequelize + Vue，模板要整套重写，且生成物必须符合本仓强制约定
 * （export 收拢末尾、registerSecureRoute、DAO/Service 分层、禁跨 app import）。
 *
 * 因此本期**只占位说明边界**，不提供「看起来能用但生成物跑不起来」的假入口 ——
 * 假入口比没有入口更贵：它会让使用者以为功能已就绪。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { FileCode2 } from 'lucide-vue-next';
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">代码生成</h2>
      <span class="page__sub">二期功能 · 当前仅说明规划</span>
    </div>

    <section class="panel">
      <div class="panel__body">
        <div class="placeholder">
          <FileCode2 :size="26" />
          <strong>代码生成器尚未交付</strong>
          <p>
            后端接口（<code class="mono">/admin/console/v1/gen/*</code>）与页面骨架已预留，但模板引擎需要按本仓形态重写，
            预计产出：Sequelize 模型 → 迁移 → DAO → Service → <code class="mono">registerSecureRoute</code> 路由 → Vue 页面。
          </p>
          <p>菜单里的「代码生成」目前会停在此页，不提供任何半成品操作。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.placeholder {
  display: grid;
  gap: 10px;
  justify-items: start;
  padding: 24px 4px;
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.7;
}

.placeholder strong {
  color: var(--ink);
  font-size: 15px;
}

code {
  padding: 1px 5px;
  border-radius: 6px;
  background: var(--hover-bg);
}
</style>
